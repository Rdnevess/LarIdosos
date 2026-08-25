import { z } from 'zod'
import type { AnotacaoSaude } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { textoDeAnotacaoSchema } from '@/lib/anotacao'
import { prazoDeEdicao, exigirJanelaAberta } from '@/lib/janela-edicao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * A anotação clínica do prontuário — o que substitui o caderno de plantão.
 *
 * Irmã de `Anotacao` (`src/modules/residents/anotacoes.service.ts`), que ficou
 * sendo o não-clínico da ficha cadastral. As duas seguem a regra R3, que mora
 * em `src/lib/janela-edicao.ts` justamente para não existir em duas cópias.
 *
 * A diferença de fundo entre elas é o alcance: esta recusa o papel
 * ADMINISTRATIVO, aquela o aceita.
 */

const categoriaSchema = z.enum([
  'EVOLUCAO',
  'INTERCORRENCIA',
  'ALIMENTACAO',
  'SONO',
  'HIGIENE',
  'COMPORTAMENTO',
  'QUEDA',
])

const turnoSchema = z.enum(['MANHA', 'TARDE', 'NOITE'])

const textoSchema = textoDeAnotacaoSchema

const novaAnotacaoSchema = z.object({
  residenteId: z.string().cuid(),
  categoria: categoriaSchema,
  turno: turnoSchema,
  texto: textoSchema,
  gravidade: z.enum(['LEVE', 'MODERADA', 'GRAVE']).nullish(),
  conduta: z.string().trim().nullish(),
  // O momento do evento, que não é o do registro: quem lança às 6h o que
  // houve às 3h precisa poder dizer isso. Futuro é sempre erro de digitação.
  ocorridoEm: z.date().refine((d) => d.getTime() <= Date.now(), {
    message: 'A anotação não pode registrar algo que ainda não aconteceu',
  }),
})

const retificacaoSchema = z.object({
  texto: textoSchema,
  categoria: categoriaSchema.optional(),
  turno: turnoSchema.optional(),
})

export type DadosAnotacaoSaude = z.infer<typeof novaAnotacaoSchema>
export type DadosRetificacaoSaude = z.infer<typeof retificacaoSchema>

async function exigirAnotacao(id: string): Promise<AnotacaoSaude> {
  const anotacao = await prisma.anotacaoSaude.findUnique({ where: { id } })
  if (!anotacao) throw new ErroNaoEncontrado('Anotação não encontrada')
  return anotacao
}

export async function criarAnotacaoSaude(
  ctx: Ctx,
  dados: DadosAnotacaoSaude
): Promise<AnotacaoSaude> {
  exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')
  const entrada = validar(novaAnotacaoSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criada = await tx.anotacaoSaude.create({
      data: { ...entrada, editavelAte: prazoDeEdicao(), criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'AnotacaoSaude',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: {
        categoria: { de: null, para: criada.categoria },
        turno: { de: null, para: criada.turno },
      },
    })

    return criada
  })
}

export async function editarAnotacaoSaude(
  ctx: Ctx,
  id: string,
  texto: string
): Promise<AnotacaoSaude> {
  exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')
  const atual = await exigirAnotacao(id)

  // Regra R3, compartilhada com a anotação da ficha: só o autor, e só nos
  // primeiros quinze minutos.
  exigirJanelaAberta(atual, ctx, 'AnotacaoSaude')

  const novoTexto = validar(textoSchema, texto)

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.anotacaoSaude.update({
      where: { id },
      data: { texto: novoTexto },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'AnotacaoSaude',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { texto: { de: atual.texto, para: novoTexto } },
    })

    return atualizada
  })
}

/**
 * Sem exigência de autoria nem de janela: é o caminho que continua aberto
 * depois que a edição fecha, e para qualquer pessoa da equipe — quem entra no
 * turno seguinte precisa poder corrigir o que encontrou errado.
 *
 * Herda categoria e turno da original quando não vierem: retificar corrige o
 * que foi escrito, não reclassifica o evento nem muda o turno em que ele
 * aconteceu. Reclassificar exigiria uma decisão de produto que esta fase não
 * tomou.
 */
export async function retificarAnotacaoSaude(
  ctx: Ctx,
  id: string,
  dados: DadosRetificacaoSaude
): Promise<AnotacaoSaude> {
  exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')
  const entrada = validar(retificacaoSchema, dados)
  const original = await exigirAnotacao(id)

  return prisma.$transaction(async (tx) => {
    const retificacao = await tx.anotacaoSaude.create({
      data: {
        residenteId: original.residenteId,
        categoria: entrada.categoria ?? original.categoria,
        turno: entrada.turno ?? original.turno,
        texto: entrada.texto,
        // A retificação herda o momento do evento, não o de agora: as duas
        // falam do mesmo acontecimento, e separá-las na linha do tempo
        // sugeriria dois eventos.
        ocorridoEm: original.ocorridoEm,
        editavelAte: prazoDeEdicao(),
        retificaAnotacaoSaudeId: original.id,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'AnotacaoSaude',
      entidadeId: retificacao.id,
      residenteId: original.residenteId,
      diff: { retificaAnotacaoSaudeId: { de: null, para: original.id } },
    })

    return retificacao
  })
}

export async function listarAnotacoesSaude(
  ctx: Ctx,
  residenteId: string
): Promise<AnotacaoSaude[]> {
  exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')

  // Ordena por `ocorridoEm`, não por `criadoEm`: ordenar pelo registro poria o
  // lançamento retroativo da madrugada acima do evento da tarde, só porque foi
  // digitado depois. O `id` desempata para a ordem ser estável.
  return prisma.anotacaoSaude.findMany({
    where: { residenteId },
    orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
  })
}
