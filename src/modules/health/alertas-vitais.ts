import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  CAMPO_DA_MEDIDA,
  MEDIDAS_VITAIS,
  faixaVigente,
  foraDaFaixa,
  type Faixa,
  type MedidaVital,
} from './faixas'

/**
 * A janela do que conta como pendência.
 *
 * Uma pressão alta de três meses atrás não é pendência, é história — e história
 * é a linha do tempo do prontuário, que já existe. Sem janela, a tela cresceria
 * para sempre e o alerta perderia o sentido de "o que precisa de atenção".
 */
export const DIAS_DA_JANELA = 7

export type AlertaVital = {
  sinalVitalId: string
  residenteId: string
  residenteNome: string
  medida: MedidaVital
  valor: number
  faixa: Faixa
  aferidoEm: Date
  /** Quantas aferições seguidas daquela medida estão fora, contando esta. */
  seguidas: number
}

/**
 * Os alertas de todos os residentes, derivados na leitura.
 *
 * Não há tabela de alertas: materializá-los exigiria cron e sobreviveria ao
 * ajuste da faixa — um alerta gravado sob a faixa antiga continuaria existindo
 * depois de alguém corrigi-la, e alguém teria de sair apagando o que a faixa
 * nova não produz.
 *
 * O custo é uma leitura das aferições da janela de todos os residentes. Em
 * trinta residentes é irrelevante, e é o mesmo argumento do item 3 das
 * pendências da Fase 2B: quando doer, mede-se antes de otimizar.
 */
export async function listarAlertasVitais(ctx: Ctx): Promise<AlertaVital[]> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')

  const desde = new Date(Date.now() - DIAS_DA_JANELA * 86_400_000)

  const [afericoes, ajustes, dispensados] = await Promise.all([
    prisma.sinalVital.findMany({
      where: { aferidoEm: { gte: desde } },
      include: { residente: { select: { nomeCompleto: true, nomeSocial: true } } },
      // Mais recente primeiro, e `id` desempata: duas aferições no mesmo
      // instante trocariam de lugar entre consultas, e a contagem de seguidas
      // depende da ordem.
      orderBy: [{ aferidoEm: 'desc' }, { id: 'desc' }],
    }),
    prisma.faixaReferencia.findMany(),
    prisma.alertaDispensado.findMany({ where: { usuarioId: ctx.usuarioId } }),
  ])

  const ajustesPorResidente = new Map<string, typeof ajustes>()
  for (const ajuste of ajustes) {
    const lista = ajustesPorResidente.get(ajuste.residenteId) ?? []
    lista.push(ajuste)
    ajustesPorResidente.set(ajuste.residenteId, lista)
  }

  const foiDispensado = new Set(dispensados.map((d) => `${d.sinalVitalId}|${d.medida}`))

  const alertas: AlertaVital[] = []
  // Conta as seguidas por residente e medida, andando da mais recente para a
  // mais antiga. Uma aferição dentro da faixa zera a contagem — sem isso, a
  // contagem somaria aferições normais no meio, e ela existe justamente para
  // dizer se aquilo é padrão ou evento.
  const seguidasPor = new Map<string, number>()

  for (const afericao of afericoes) {
    const ajustesDele = (ajustesPorResidente.get(afericao.residenteId) ?? []).map((a) => ({
      medida: a.medida,
      minimo: a.minimo === null ? null : Number(a.minimo),
      maximo: a.maximo === null ? null : Number(a.maximo),
    }))

    for (const medida of MEDIDAS_VITAIS) {
      const bruto = afericao[CAMPO_DA_MEDIDA[medida]]
      if (bruto === null || bruto === undefined) continue

      // `Number(...)` porque a temperatura vem como `Decimal`: comparar
      // `Decimal` com número dá sempre falso, e sem reclamar.
      const valor = Number(bruto)
      const faixa = faixaVigente(medida, ajustesDele)
      const chave = `${afericao.residenteId}|${medida}`

      if (!foraDaFaixa(valor, faixa)) {
        seguidasPor.set(chave, 0)
        continue
      }

      const seguidas = (seguidasPor.get(chave) ?? 0) + 1
      seguidasPor.set(chave, seguidas)

      // O dispensado sai da lista, mas depois de contar: quem dispensou uma
      // aferição no meio de uma sequência não pode fazer a sequência parecer
      // menor para quem não dispensou.
      if (foiDispensado.has(`${afericao.id}|${medida}`)) continue

      alertas.push({
        sinalVitalId: afericao.id,
        residenteId: afericao.residenteId,
        residenteNome: afericao.residente.nomeSocial || afericao.residente.nomeCompleto,
        medida,
        valor,
        faixa,
        aferidoEm: afericao.aferidoEm,
        seguidas,
      })
    }
  }

  return alertas
}

/**
 * Dispensa **uma medida de uma aferição, para um usuário**.
 *
 * Existir é estar dispensado; não há booleano a manter. Não apaga nada e não
 * altera o prontuário: a aferição continua onde está, com o valor que tem, e o
 * que muda é uma linha da tela de quem clicou.
 */
export async function dispensarAlerta(
  ctx: Ctx,
  sinalVitalId: string,
  medida: MedidaVital
): Promise<void> {
  exigirPapel(ctx, 'AlertaDispensado', 'COORDENACAO', 'SAUDE')

  const sinal = await prisma.sinalVital.findUnique({
    where: { id: sinalVitalId },
    select: { residenteId: true },
  })
  if (!sinal) return

  await prisma.$transaction(async (tx) => {
    // `skipDuplicates` porque clicar duas vezes é normal, e a resposta certa é
    // "já está dispensado" — não um erro de unicidade na cara de quem está de
    // plantão.
    const criado = await tx.alertaDispensado.createMany({
      data: [{ usuarioId: ctx.usuarioId, sinalVitalId, medida }],
      skipDuplicates: true,
    })
    if (criado.count === 0) return

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'AlertaDispensado',
      entidadeId: sinalVitalId,
      residenteId: sinal.residenteId,
      diff: { medida: { de: null, para: medida } },
    })
  })
}
