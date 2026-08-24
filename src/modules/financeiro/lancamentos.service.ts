import { z } from 'zod'
import type { Lancamento, NaturezaLancamento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Os lançamentos de receita e de despesa.
 *
 * **Dois schemas, um por natureza**, e não um único com tudo opcional: os
 * campos obrigatórios diferem, e um schema frouxo aceitaria uma despesa sem
 * categoria — defeito que só apareceria na conciliação, na hora de entregar a
 * prestação.
 *
 * Exclusão é lógica. Lançamento errado é cancelado com motivo, e o registro
 * fica: um lançamento apagado é um buraco no extrato que ninguém consegue
 * explicar depois.
 */

const comum = {
  contaBancariaId: z.string().cuid(),
  descricao: z.string().trim().min(3, 'Descreva o lançamento'),
  // Valor zero não move dinheiro nenhum, e negativo é despesa disfarçada de
  // receita: as duas coisas sujam o total sem dizer o que aconteceu.
  valor: z.number().positive('O valor precisa ser maior que zero'),
  data: z.date(),
  observacao: z.string().trim().nullish(),
  documentoId: z.string().cuid().nullish(),
}

const receitaSchema = z.object({
  ...comum,
  origemReceitaId: z.string().cuid(),
  residenteId: z.string().cuid().nullish(),
  pagadorNome: z.string().trim().nullish(),
  pagadorDocumento: z.string().trim().nullish(),
})

const despesaSchema = z.object({
  ...comum,
  fornecedorId: z.string().cuid(),
  categoriaDespesaId: z.string().cuid(),
  formaPagamento: z.enum(['PIX', 'TED', 'CHEQUE', 'DEBITO', 'OUTRO']),
  numeroDocumentoFiscal: z.string().trim().nullish(),
})

export type DadosReceita = z.infer<typeof receitaSchema>
export type DadosDespesa = z.infer<typeof despesaSchema>

export type FiltrosLancamento = {
  contaBancariaId?: string
  de?: Date
  ate?: Date
  natureza?: NaturezaLancamento
}

async function exigirConta(id: string): Promise<void> {
  const conta = await prisma.contaBancaria.findUnique({ where: { id }, select: { id: true } })
  if (!conta) throw new ErroNaoEncontrado('Conta bancária não encontrada')
}

export async function lancarReceita(ctx: Ctx, dados: DadosReceita): Promise<Lancamento> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(receitaSchema, dados)
  await exigirConta(entrada.contaBancariaId)

  const origem = await prisma.origemReceita.findUnique({
    where: { id: entrada.origemReceitaId },
  })
  if (!origem) throw new ErroNaoEncontrado('Origem de receita não encontrada')

  // A checagem mora aqui, e não no schema, porque depende da origem gravada.
  // Sem o vínculo, o extrato individual do residente não fecharia — e ninguém
  // perceberia, porque a prestação sai igual de qualquer jeito.
  if (origem.exigeResidente && !entrada.residenteId) {
    throw new ErroValidacao(
      `A origem "${origem.nome}" exige o residente a que a receita se refere`
    )
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.lancamento.create({
      data: { ...entrada, natureza: 'RECEITA', criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Lancamento',
      entidadeId: criado.id,
      residenteId: entrada.residenteId ?? undefined,
      diff: {
        natureza: { de: null, para: 'RECEITA' },
        valor: { de: null, para: entrada.valor },
      },
    })

    return criado
  })
}

export async function lancarDespesa(ctx: Ctx, dados: DadosDespesa): Promise<Lancamento> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(despesaSchema, dados)
  await exigirConta(entrada.contaBancariaId)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.lancamento.create({
      data: { ...entrada, natureza: 'DESPESA', criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Lancamento',
      entidadeId: criado.id,
      diff: {
        natureza: { de: null, para: 'DESPESA' },
        valor: { de: null, para: entrada.valor },
      },
    })

    return criado
  })
}

/**
 * A conciliação é manual, contra o extrato do banco — importação de OFX ficou
 * de fora porque cada banco tem sua peculiaridade de formato.
 */
export async function conciliarLancamento(ctx: Ctx, id: string): Promise<Lancamento> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')

  const atual = await prisma.lancamento.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Lançamento não encontrado')

  return prisma.$transaction(async (tx) => {
    const conciliado = await tx.lancamento.update({
      where: { id },
      data: { conciliado: true, conciliadoEm: new Date() },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Lancamento',
      entidadeId: id,
      diff: { conciliado: { de: atual.conciliado, para: true } },
    })

    return conciliado
  })
}

export async function cancelarLancamento(
  ctx: Ctx,
  id: string,
  motivo: string
): Promise<Lancamento> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')

  const motivoCancelamento = validar(
    z.string().trim().min(3, 'Informe o motivo do cancelamento'),
    motivo
  )

  const atual = await prisma.lancamento.findUnique({
    where: { id },
    include: { prestacaoContas: { select: { status: true } } },
  })
  if (!atual) throw new ErroNaoEncontrado('Lançamento não encontrado')

  // O congelamento: um lançamento que já foi ao órgão não muda sem a
  // prestação ser reaberta, e reabrir exige motivo e deixa rastro.
  if (atual.prestacaoContas?.status === 'FECHADA') {
    throw new ErroValidacao(
      'Este lançamento faz parte de uma prestação já fechada. Reabra a prestação antes de alterá-lo.'
    )
  }

  return prisma.$transaction(async (tx) => {
    const cancelado = await tx.lancamento.update({
      where: { id },
      data: { status: 'CANCELADO', motivoCancelamento },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Lancamento',
      entidadeId: id,
      residenteId: atual.residenteId ?? undefined,
      diff: {
        status: { de: atual.status, para: 'CANCELADO' },
        motivoCancelamento: { de: null, para: motivoCancelamento },
      },
    })

    return cancelado
  })
}

export async function listarLancamentos(
  ctx: Ctx,
  filtros: FiltrosLancamento
): Promise<Lancamento[]> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')

  return prisma.lancamento.findMany({
    where: {
      contaBancariaId: filtros.contaBancariaId,
      natureza: filtros.natureza,
      data:
        filtros.de || filtros.ate ? { gte: filtros.de, lte: filtros.ate } : undefined,
    },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
  })
}
