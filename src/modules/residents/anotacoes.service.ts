import { z } from 'zod'
import type { Anotacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { prazoDeEdicao, exigirJanelaAberta } from '@/lib/janela-edicao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const categoriaSchema = z.enum([
  'VISITA_FAMILIA',
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
  exigirPapel(ctx, 'Anotacao', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(novaAnotacaoSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.anotacao.create({
      data: {
        ...entrada,
        editavelAte: prazoDeEdicao(),
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

/**
 * Audita. A regra do projeto oferece duas saídas para leitura de dado sensível
 * — minimizar campos ou registrar o acesso — e aqui só a segunda existe: o
 * texto da anotação É o dado sensível, então uma lista sem ele não serve para
 * nada. Devolver o histórico inteiro de visitas, ocorrências e questões
 * jurídicas de um residente é abrir o dado dessa pessoa, não listar muitas.
 */
export async function listarAnotacoes(
  ctx: Ctx,
  residenteId: string
): Promise<Anotacao[]> {
  exigirPapel(ctx, 'Anotacao', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const anotacoes = await prisma.anotacao.findMany({
    where: { residenteId },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'Anotacao',
    residenteId,
  })

  return anotacoes
}

export async function editarAnotacao(
  ctx: Ctx,
  id: string,
  texto: string
): Promise<Anotacao> {
  exigirPapel(ctx, 'Anotacao', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const atual = await exigirAnotacao(id)

  // A regra R3 mora em `src/lib/janela-edicao.ts`, compartilhada com
  // `AnotacaoSaude`: duas cópias dela divergiriam, e é regra que a
  // fiscalização lê.
  exigirJanelaAberta(atual.editavelAte, atual.criadoPorId, ctx, 'Anotacao')

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
  exigirPapel(ctx, 'Anotacao', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(retificacaoSchema, dados)
  const original = await exigirAnotacao(id)

  return prisma.$transaction(async (tx) => {
    const retificacao = await tx.anotacao.create({
      data: {
        residenteId: original.residenteId,
        categoria: entrada.categoria ?? original.categoria,
        texto: entrada.texto,
        editavelAte: prazoDeEdicao(),
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
