import { z } from 'zod'
import type { AvaliacaoDependencia, GrauDependencia } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const avaliacaoSchema = z.object({
  residenteId: z.string().cuid(),
  grau: z.enum(['I', 'II', 'III']),
  dataAvaliacao: z
    .date()
    .refine((data) => data.getTime() <= Date.now(), {
      message: 'A data da avaliação não pode estar no futuro',
    }),
  avaliadorNome: z.string().trim().min(3, 'Informe quem realizou a avaliação'),
  justificativa: z.string().trim().optional(),
})

export type DadosAvaliacao = z.infer<typeof avaliacaoSchema>

export async function registrarAvaliacao(
  ctx: Ctx,
  dados: DadosAvaliacao
): Promise<AvaliacaoDependencia> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE')
  const entrada = validar(avaliacaoSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criada = await tx.avaliacaoDependencia.create({
      data: { ...entrada, avaliadorId: ctx.usuarioId, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'AvaliacaoDependencia',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { grau: { de: null, para: entrada.grau } },
    })

    return criada
  })
}

export async function obterGrauVigente(
  ctx: Ctx,
  residenteId: string,
  emData: Date = new Date()
): Promise<GrauDependencia | null> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const avaliacao = await prisma.avaliacaoDependencia.findFirst({
    where: { residenteId, dataAvaliacao: { lte: emData } },
    orderBy: [{ dataAvaliacao: 'desc' }, { criadoEm: 'desc' }],
  })

  return avaliacao?.grau ?? null
}

export async function listarAvaliacoes(
  ctx: Ctx,
  residenteId: string
): Promise<AvaliacaoDependencia[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  return prisma.avaliacaoDependencia.findMany({
    where: { residenteId },
    orderBy: [{ dataAvaliacao: 'desc' }, { criadoEm: 'desc' }],
  })
}
