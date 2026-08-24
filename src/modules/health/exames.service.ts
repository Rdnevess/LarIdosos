import { z } from 'zod'
import type { Exame, StatusExame } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Exames, e a máquina de status que sustenta a tela de pendências.
 *
 * O `status` é a razão de ser do módulo: exame solicitado e esquecido é o
 * problema real em ILPI, e é o percurso `SOLICITADO → AGENDADO → REALIZADO →
 * RESULTADO_RECEBIDO` que permite enxergar onde ele parou.
 */

/**
 * Os status que a área de pendências considera em aberto.
 *
 * `REALIZADO` entra de propósito: exame feito cujo resultado ninguém buscou é
 * exatamente o caso que a tela existe para pegar. Sai da lista só em
 * `RESULTADO_RECEBIDO` ou `CANCELADO`.
 */
export const EXAMES_EM_ABERTO: StatusExame[] = ['SOLICITADO', 'AGENDADO', 'REALIZADO']

const statusSchema = z.enum([
  'SOLICITADO',
  'AGENDADO',
  'REALIZADO',
  'RESULTADO_RECEBIDO',
  'CANCELADO',
])

const novoExameSchema = z.object({
  residenteId: z.string().cuid(),
  // Texto livre: a lista de exames possíveis é longa e muda, e um enum
  // incompleto forçaria "Outro" na maioria dos casos.
  tipo: z.string().trim().min(2, 'Informe o tipo do exame'),
  dataSolicitacao: z.date().nullish(),
  dataRealizacao: z.date().nullish(),
  dataResultado: z.date().nullish(),
  solicitanteNome: z.string().trim().nullish(),
  laboratorio: z.string().trim().nullish(),
  status: statusSchema.optional(),
  resumoResultado: z.string().trim().nullish(),
  documentoId: z.string().cuid().nullish(),
})

const atualizacaoExameSchema = novoExameSchema.partial().omit({ residenteId: true })

export type DadosExame = z.infer<typeof novoExameSchema>
export type DadosAtualizacaoExame = z.infer<typeof atualizacaoExameSchema>

export async function registrarExame(ctx: Ctx, dados: DadosExame): Promise<Exame> {
  exigirPapel(ctx, 'Exame', 'COORDENACAO', 'SAUDE')
  const entrada = validar(novoExameSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criado = await tx.exame.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Exame',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { tipo: { de: null, para: criado.tipo } },
    })

    return criado
  })
}

export async function atualizarExame(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoExame
): Promise<Exame> {
  exigirPapel(ctx, 'Exame', 'COORDENACAO', 'SAUDE')
  const entrada = validar(atualizacaoExameSchema, dados)

  const atual = await prisma.exame.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Exame não encontrado')

  // A guarda mora aqui, e não no schema, porque depende do estado gravado: o
  // exame pode já ter resumo ou anexo de uma atualização anterior, e schema
  // não enxerga o banco.
  //
  // Sem ela, marcar "resultado recebido" viraria o jeito rápido de tirar o
  // exame da lista de pendências sem ninguém ter olhado o resultado — que é
  // exatamente o problema que a lista existe para pegar.
  if (entrada.status === 'RESULTADO_RECEBIDO') {
    const resumo = entrada.resumoResultado ?? atual.resumoResultado
    const documento = entrada.documentoId ?? atual.documentoId
    if (!resumo && !documento) {
      throw new ErroValidacao(
        'Para marcar o resultado como recebido, informe o resumo ou anexe o laudo'
      )
    }
  }

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.exame.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Exame',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff,
    })

    return atualizado
  })
}

export async function listarExames(ctx: Ctx, residenteId: string): Promise<Exame[]> {
  exigirPapel(ctx, 'Exame', 'COORDENACAO', 'SAUDE')

  return prisma.exame.findMany({
    where: { residenteId },
    orderBy: [{ dataSolicitacao: 'desc' }, { id: 'desc' }],
  })
}
