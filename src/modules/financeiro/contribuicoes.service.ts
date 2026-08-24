import { z } from 'zod'
import type { ContribuicaoResidente } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * A contribuição do residente, e a proposta mensal.
 *
 * A contribuição é percentual sobre o benefício (art. 35, §2º da Lei
 * 10.741/2003), e o benefício é reajustado todo ano — daí a vigência. Guardar
 * apenas "valor da mensalidade" quebraria na primeira virada de exercício e
 * corromperia o histórico.
 *
 * **O sistema propõe, não lança.** Lançar automático inventaria dinheiro que
 * pode não ter chegado; exigir trinta digitações por mês faria a equipe voltar
 * para a planilha. A proposta é o meio que não faz nenhuma das duas coisas.
 */

const contribuicaoSchema = z.object({
  residenteId: z.string().cuid(),
  // O teto de 70% é o do art. 35, §2º. Aceitar mais seria o sistema ajudar a
  // descumprir a lei.
  percentual: z
    .number()
    .positive('O percentual precisa ser maior que zero')
    .max(70, 'A participação do idoso não pode passar de 70% do benefício'),
  valorBaseBeneficio: z.number().positive('Informe o valor do benefício'),
  vigenciaInicio: z.date(),
  observacao: z.string().trim().nullish(),
})

export type DadosContribuicao = z.infer<typeof contribuicaoSchema>

export type PropostaContribuicao = {
  residenteId: string
  residenteNome: string
  percentual: number
  valorBaseBeneficio: number
  valorCalculado: number
  jaLancado: boolean
  lancamentoId: string | null
}

/**
 * `toFixed` devolve string e arredonda por representação binária. Para dinheiro
 * o caminho é multiplicar, arredondar e dividir.
 */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function calcularContribuicao(percentual: number, base: number): number {
  return duasCasas((percentual / 100) * base)
}

/**
 * Encerra a vigente antes de criar a nova, na mesma transação — o mesmo
 * desenho de `prescreverSubstituta` na Fase 2B, e pelo mesmo motivo: o
 * histórico é o que a fiscalização lê.
 */
export async function definirContribuicao(
  ctx: Ctx,
  dados: DadosContribuicao
): Promise<ContribuicaoResidente> {
  exigirPapel(ctx, 'ContribuicaoResidente', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(contribuicaoSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  const vigente = await prisma.contribuicaoResidente.findFirst({
    where: { residenteId: entrada.residenteId, vigenciaFim: null },
    orderBy: { vigenciaInicio: 'desc' },
  })

  return prisma.$transaction(async (tx) => {
    if (vigente) {
      // Termina na véspera do início da nova: sem o dia de folga, as duas
      // vigeriam no mesmo dia e a consulta devolveria qualquer uma.
      const vespera = new Date(entrada.vigenciaInicio)
      vespera.setDate(vespera.getDate() - 1)

      await tx.contribuicaoResidente.update({
        where: { id: vigente.id },
        data: { vigenciaFim: vespera },
      })
    }

    const criada = await tx.contribuicaoResidente.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'ContribuicaoResidente',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: {
        percentual: { de: vigente ? Number(vigente.percentual) : null, para: entrada.percentual },
        valorBaseBeneficio: {
          de: vigente ? Number(vigente.valorBaseBeneficio) : null,
          para: entrada.valorBaseBeneficio,
        },
      },
    })

    return criada
  })
}

export async function obterContribuicaoVigente(
  ctx: Ctx,
  residenteId: string,
  em: Date = new Date()
): Promise<ContribuicaoResidente | null> {
  exigirPapel(ctx, 'ContribuicaoResidente', 'COORDENACAO', 'ADMINISTRATIVO')

  return prisma.contribuicaoResidente.findFirst({
    where: {
      residenteId,
      vigenciaInicio: { lte: em },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: em } }],
    },
    orderBy: { vigenciaInicio: 'desc' },
  })
}

/**
 * A proposta do mês: quem tem contribuição vigente, quanto dá, e o que já
 * virou lançamento.
 *
 * A vigência é conferida contra o **primeiro dia da competência**: é o mês que
 * define quem contribui, e não o dia em que alguém abre a tela.
 */
export async function montarPropostaMensal(
  ctx: Ctx,
  ano: number,
  mes: number
): Promise<PropostaContribuicao[]> {
  exigirPapel(ctx, 'ContribuicaoResidente', 'COORDENACAO', 'ADMINISTRATIVO')

  const primeiroDia = new Date(ano, mes - 1, 1)
  const primeiroDoSeguinte = new Date(ano, mes, 1)

  const contribuicoes = await prisma.contribuicaoResidente.findMany({
    where: {
      vigenciaInicio: { lte: primeiroDia },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: primeiroDia } }],
    },
    include: { residente: { select: { nomeCompleto: true, nomeSocial: true } } },
    orderBy: { vigenciaInicio: 'desc' },
  })

  // Uma contribuição por residente: a mais recente que vigia na competência.
  const porResidente = new Map<string, (typeof contribuicoes)[number]>()
  for (const contribuicao of contribuicoes) {
    if (!porResidente.has(contribuicao.residenteId)) {
      porResidente.set(contribuicao.residenteId, contribuicao)
    }
  }

  // Cancelado não conta: contribuição lançada por engano e cancelada precisa
  // voltar à proposta, senão o mês fecha sem ela e ninguém percebe.
  const lancados = await prisma.lancamento.findMany({
    where: {
      natureza: 'RECEITA',
      status: { not: 'CANCELADO' },
      residenteId: { in: [...porResidente.keys()] },
      data: { gte: primeiroDia, lt: primeiroDoSeguinte },
    },
    select: { id: true, residenteId: true },
  })
  const lancadoPorResidente = new Map(
    lancados.filter((l) => l.residenteId).map((l) => [l.residenteId!, l.id])
  )

  const proposta = [...porResidente.values()].map((contribuicao) => {
    const percentual = Number(contribuicao.percentual)
    const base = Number(contribuicao.valorBaseBeneficio)
    const lancamentoId = lancadoPorResidente.get(contribuicao.residenteId) ?? null

    return {
      residenteId: contribuicao.residenteId,
      residenteNome:
        contribuicao.residente.nomeSocial || contribuicao.residente.nomeCompleto,
      percentual,
      valorBaseBeneficio: base,
      valorCalculado: calcularContribuicao(percentual, base),
      jaLancado: lancamentoId !== null,
      lancamentoId,
    }
  })

  return proposta.sort((a, b) => a.residenteNome.localeCompare(b.residenteNome, 'pt-BR'))
}
