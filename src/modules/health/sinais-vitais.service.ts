import { z } from 'zod'
import type { SinalVital } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Campos numéricos separados, e não texto livre — é o que permite mostrar
 * tendência de pressão e de peso ao longo do tempo, que é onde o dado passa a
 * valer alguma coisa. O gráfico em si não é da 2A; os campos existem para
 * torná-lo possível depois.
 */

const MEDIDAS = [
  'pressaoSistolica',
  'pressaoDiastolica',
  'frequenciaCardiaca',
  'frequenciaRespiratoria',
  'temperatura',
  'saturacaoO2',
  'glicemia',
  'peso',
] as const

/**
 * As faixas são de **plausibilidade**, não clínicas: existem para pegar dedo
 * escorregado no teclado — uma temperatura de 365 — antes de o número virar
 * linha do prontuário. Valor fora da faixa clínica mas plausível, como febre
 * de 40 °C, entra normalmente: recusá-lo apagaria justamente o registro que
 * mais importa.
 */
const sinalVitalSchema = z
  .object({
    residenteId: z.string().cuid(),
    aferidoEm: z.date().refine((d) => d.getTime() <= Date.now(), {
      message: 'A aferição não pode estar no futuro',
    }),
    pressaoSistolica: z.number().int().min(40).max(300).nullish(),
    pressaoDiastolica: z.number().int().min(20).max(200).nullish(),
    frequenciaCardiaca: z.number().int().min(20).max(250).nullish(),
    frequenciaRespiratoria: z.number().int().min(4).max(80).nullish(),
    temperatura: z.number().min(30).max(45).nullish(),
    saturacaoO2: z.number().int().min(50).max(100).nullish(),
    glicemia: z.number().int().min(20).max(700).nullish(),
    peso: z.number().min(20).max(300).nullish(),
    observacao: z.string().trim().nullish(),
  })
  .refine((d) => MEDIDAS.some((campo) => d[campo] != null), {
    message: 'Informe ao menos uma medida',
  })

export type DadosSinalVital = z.infer<typeof sinalVitalSchema>

/** As colunas numéricas de `SinalVital` — as sete que alertam, mais o peso. */
export type CampoDeMedida = (typeof MEDIDAS)[number]

export async function registrarSinalVital(
  ctx: Ctx,
  dados: DadosSinalVital
): Promise<SinalVital> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')
  const entrada = validar(sinalVitalSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criado = await tx.sinalVital.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'SinalVital',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { aferidoEm: { de: null, para: criado.aferidoEm } },
    })

    return criado
  })
}

/**
 * `desde` é opcional: sem ele vem o histórico inteiro, que é o que o prontuário
 * mostra. O gráfico de tendência passa a janela, e quem corta é o banco — o
 * índice `[residenteId, aferidoEm]` já existe, e filtrar depois de ler traria
 * todo o histórico para a memória a cada troca de janela.
 */
export async function listarSinaisVitais(
  ctx: Ctx,
  residenteId: string,
  desde?: Date
): Promise<SinalVital[]> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')

  return prisma.sinalVital.findMany({
    where: { residenteId, ...(desde ? { aferidoEm: { gte: desde } } : {}) },
    orderBy: [{ aferidoEm: 'desc' }, { id: 'desc' }],
  })
}

/**
 * A mais recente **pelo momento da aferição**, não pelo da gravação. Registro
 * retroativo é comum — alguém lança de manhã o que aferiu de madrugada — e
 * ordenar por `criadoEm` mostraria a antiga como atual no cabeçalho clínico.
 */
export async function obterUltimoSinalVital(
  ctx: Ctx,
  residenteId: string
): Promise<SinalVital | null> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')

  return prisma.sinalVital.findFirst({
    where: { residenteId },
    orderBy: [{ aferidoEm: 'desc' }, { id: 'desc' }],
  })
}

/**
 * Se o residente já teve **alguma vez** aquela medida aferida, em qualquer data.
 *
 * Existe para a tela vazia do gráfico dizer qual dos dois vazios é o dela:
 * "ninguém mediu isto ainda" e "não houve medida nesta janela" pedem coisas
 * opostas — o primeiro pede começar a medir, o segundo pede abrir a janela.
 *
 * O campo é tipado contra as chaves do modelo, e não `string`: não há como
 * passar um nome de coluna que o schema não tenha.
 */
export async function existeAfericaoDaMedida(
  ctx: Ctx,
  residenteId: string,
  campo: CampoDeMedida
): Promise<boolean> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')

  const achada = await prisma.sinalVital.findFirst({
    where: { residenteId, [campo]: { not: null } },
    select: { id: true },
  })
  return achada !== null
}
