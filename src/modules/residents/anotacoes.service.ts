import { z } from 'zod'
import type { Anotacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

export const JANELA_EDICAO_MINUTOS = 15

const categoriaSchema = z.enum([
  'COMPORTAMENTO',
  'VISITA_FAMILIA',
  'OCORRENCIA',
  'SOCIAL',
  'JURIDICO',
  'OUTRO',
])

const novaAnotacaoSchema = z.object({
  residenteId: z.string().cuid(),
  categoria: categoriaSchema,
  texto: z.string().trim().min(3, 'Escreva o conteúdo da anotação'),
})

const retificacaoSchema = z.object({
  categoria: categoriaSchema.optional(),
  texto: z.string().trim().min(3, 'Escreva o conteúdo da retificação'),
})

export type DadosNovaAnotacao = z.infer<typeof novaAnotacaoSchema>
export type DadosRetificacao = z.infer<typeof retificacaoSchema>

async function exigirAnotacao(id: string): Promise<Anotacao> {
  const anotacao = await prisma.anotacao.findUnique({ where: { id } })
  if (!anotacao) throw new ErroNaoEncontrado('Anotação não encontrada')
  return anotacao
}

/**
 * As três funções de escrita (`criarAnotacao`, `editarAnotacao`,
 * `retificarAnotacao`) e a leitura `listarAnotacoes` aceitam os três papéis
 * por desenho: a anotação geral é o registro que toda a equipe escreve. A
 * restrição real de `editarAnotacao` não é de papel — é de autoria, checada
 * abaixo com `ErroPermissao` cuja mensagem fala de autoria, nunca de papel.
 */
export async function criarAnotacao(
  ctx: Ctx,
  dados: DadosNovaAnotacao
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(novaAnotacaoSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.anotacao.create({
      data: {
        ...entrada,
        editavelAte: new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000),
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Anotacao',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { categoria: { de: null, para: criada.categoria } },
    })

    return criada
  })
}

export async function listarAnotacoes(
  ctx: Ctx,
  residenteId: string
): Promise<Anotacao[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  return prisma.anotacao.findMany({
    where: { residenteId },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })
}

export async function editarAnotacao(
  ctx: Ctx,
  id: string,
  texto: string
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const atual = await exigirAnotacao(id)

  if (atual.criadoPorId !== ctx.usuarioId) {
    throw new ErroPermissao('Só o autor pode editar a própria anotação')
  }
  if (atual.editavelAte.getTime() < Date.now()) {
    throw new ErroValidacao(
      `A janela de ${JANELA_EDICAO_MINUTOS} minutos para edição expirou. Registre uma retificação.`
    )
  }

  const novoTexto = validar(z.string().trim().min(3, 'Escreva o conteúdo da anotação'), texto)

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.anotacao.update({
      where: { id },
      data: { texto: novoTexto },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Anotacao',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { texto: { de: atual.texto, para: novoTexto } },
    })

    return atualizada
  })
}

export async function retificarAnotacao(
  ctx: Ctx,
  id: string,
  dados: DadosRetificacao
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(retificacaoSchema, dados)
  const original = await exigirAnotacao(id)

  return prisma.$transaction(async (tx) => {
    const retificacao = await tx.anotacao.create({
      data: {
        residenteId: original.residenteId,
        categoria: entrada.categoria ?? original.categoria,
        texto: entrada.texto,
        editavelAte: new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000),
        retificaAnotacaoId: original.id,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Anotacao',
      entidadeId: retificacao.id,
      residenteId: original.residenteId,
      diff: { retificaAnotacaoId: { de: null, para: original.id } },
    })

    return retificacao
  })
}
