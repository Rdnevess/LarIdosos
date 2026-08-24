import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { formatarData } from '@/lib/ptbr'
import type { FiltrosLancamento } from './lancamentos.service'

/**
 * Os lançamentos em CSV, para o contador.
 *
 * O contador não usa o sistema: ele recebe um arquivo e importa. Este é o
 * formato que o escritório dele lê sem perguntar nada — e é bem mais barato
 * que integrar com o sistema contábil de cada escritório que a instituição
 * venha a contratar.
 *
 * **Ponto e vírgula, e não vírgula**: o Excel em português usa a vírgula como
 * separador decimal, e um CSV com vírgula abre tudo numa coluna só.
 *
 * **Com BOM**: sem ele o Excel em Windows lê o arquivo como ANSI e "Doação"
 * vira "DoaÃ§Ã£o". O contador recebe um arquivo ilegível e liga perguntando.
 */

const SEPARADOR = ';'

const COLUNAS = [
  'Data',
  'Natureza',
  'Descrição',
  'Valor',
  'Origem/Fornecedor',
  'Categoria',
  'Forma de pagamento',
  'Documento fiscal',
  'Status',
  'Conta',
] as const

const ROTULO_STATUS: Record<string, string> = {
  REALIZADO: 'Realizado',
  PREVISTO: 'Previsto',
  CANCELADO: 'Cancelado',
}

const ROTULO_FORMA: Record<string, string> = {
  PIX: 'PIX',
  TED: 'TED',
  CHEQUE: 'Cheque',
  DEBITO: 'Débito em conta',
  OUTRO: 'Outro',
}

/**
 * Aspas quando o campo contém separador, aspa ou quebra de linha; a aspa
 * interna é dobrada, como manda o formato. Sem isso, uma descrição com aspas
 * quebra o campo e desloca todas as colunas seguintes da linha.
 */
function campo(valor: string): string {
  if (!/[";\r\n]/.test(valor)) return valor
  return `"${valor.replace(/"/g, '""')}"`
}

/** Vírgula decimal e sem separador de milhar: é o que o Excel pt-BR importa. */
function valorCsv(valor: number): string {
  return valor.toFixed(2).replace('.', ',')
}

export async function gerarCsvLancamentos(
  ctx: Ctx,
  filtros: FiltrosLancamento
): Promise<string> {
  exigirPapel(ctx, 'Lancamento', 'COORDENACAO', 'ADMINISTRATIVO')

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      contaBancariaId: filtros.contaBancariaId,
      natureza: filtros.natureza,
      data: filtros.de || filtros.ate ? { gte: filtros.de, lte: filtros.ate } : undefined,
    },
    include: {
      origemReceita: { select: { nome: true } },
      fornecedor: { select: { nome: true } },
      categoriaDespesa: { select: { nome: true } },
      contaBancaria: { select: { banco: true, numeroConta: true } },
    },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  })

  const linhas = lancamentos.map((lancamento) =>
    [
      formatarData(lancamento.data),
      lancamento.natureza === 'RECEITA' ? 'Receita' : 'Despesa',
      lancamento.descricao,
      valorCsv(Number(lancamento.valor)),
      lancamento.origemReceita?.nome ?? lancamento.fornecedor?.nome ?? '',
      lancamento.categoriaDespesa?.nome ?? '',
      lancamento.formaPagamento ? ROTULO_FORMA[lancamento.formaPagamento] : '',
      lancamento.numeroDocumentoFiscal ?? '',
      ROTULO_STATUS[lancamento.status],
      `${lancamento.contaBancaria.banco} ${lancamento.contaBancaria.numeroConta}`,
    ]
      .map(campo)
      .join(SEPARADOR)
  )

  // `\r\n`: é a quebra que o RFC 4180 define, e a que o Excel em Windows
  // espera.
  return `﻿${[COLUNAS.join(SEPARADOR), ...linhas].join('\r\n')}\r\n`
}
