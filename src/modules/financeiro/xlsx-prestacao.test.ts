import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { documentoDeTeste, despesaDeTeste, receitaDeTeste } from '@/../tests/helpers/documento-prestacao'
import { gerarXlsxPrestacao } from './xlsx-prestacao'

async function reabrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  // O `exceljs` embute uma versão antiga de `@types/node`, e o `Buffer` dele
  // não é o `Buffer<ArrayBufferLike>` deste projeto. O dado é o mesmo.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
  return wb
}

/** A primeira célula da coluna Data, varrendo a faixa de dados de cima. */
function celulaDaPrimeiraData(folha: ExcelJS.Worksheet): ExcelJS.Cell {
  for (let linha = 11; linha <= folha.rowCount; linha++) {
    const celula = folha.getCell(linha, 9)
    if (celula.value !== null && celula.value !== undefined) return celula
  }
  throw new Error('Nenhuma data encontrada na faixa de dados')
}

/**
 * O valor da linha marcada "Total": rótulo em H, número em J.
 *
 * J, e não K como nas linhas de dado — no modelo a faixa do total é `J33:L33`
 * e a da linha é `K11:L11`. É a geometria do modelo que manda.
 */
function valorDoTotal(folha: ExcelJS.Worksheet): number {
  for (let linha = 1; linha <= folha.rowCount; linha++) {
    if (folha.getCell(linha, 8).value === 'Total') {
      return folha.getCell(linha, 10).value as number
    }
  }
  throw new Error('Linha de total não encontrada')
}

describe('gerarXlsxPrestacao', () => {
  it('gera as seis folhas, na ordem do modelo', async () => {
    const wb = await reabrir(await gerarXlsxPrestacao(documentoDeTeste()))

    expect(wb.worksheets.map((f) => f.name)).toEqual([
      '1-Capa',
      '2-Contra-Capa',
      '3-Despesas',
      '4-Receitas',
      '5-Conciliação',
      '6-Encerramento',
    ])
  })

  it('grava valores calculados, e nenhuma fórmula', async () => {
    // O sistema é a fonte da verdade dos totais. As fórmulas do modelo são a
    // parte frágil: soma de faixa fixa, agrupamento por texto literal, e um
    // XLOOKUP que já aponta para #REF!.
    const documento = documentoDeTeste({
      despesas: [despesaDeTeste()],
      receitas: [receitaDeTeste()],
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))

    for (const folha of wb.worksheets) {
      folha.eachRow((linha) => {
        linha.eachCell((celula) => {
          expect(celula.formula).toBeUndefined()
        })
      })
    }
  })

  it('grava data como data, não como número de série', async () => {
    // No modelo atual elas aparecem como 45995.
    const documento = documentoDeTeste({ despesas: [despesaDeTeste()] })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))
    const folha = wb.getWorksheet('3-Despesas')!

    expect(celulaDaPrimeiraData(folha).value).toBeInstanceOf(Date)
  })

  it('cresce além das 22 linhas do modelo quando o mês tem mais lançamentos', async () => {
    // O teto já foi atingido: hoje a equipe insere linhas e reajusta fórmulas
    // à mão.
    const despesas = Array.from({ length: 40 }, (_, i) =>
      despesaDeTeste({ item: i + 1, credor: `Fornecedor ${i + 1}`, valor: 100 })
    )
    const wb = await reabrir(await gerarXlsxPrestacao(documentoDeTeste({ despesas })))
    const folha = wb.getWorksheet('3-Despesas')!

    expect(folha.getCell(50, 2).value).toBe('Fornecedor 40')
    expect(folha.rowCount).toBeGreaterThan(50)
  })

  it('o total da folha bate com o do documento', async () => {
    const documento = documentoDeTeste({
      despesas: [
        despesaDeTeste({ item: 1, credor: 'A', valor: 300.25 }),
        despesaDeTeste({ item: 2, credor: 'B', formaPagamento: 'TED', valor: 499.75 }),
      ],
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))

    expect(valorDoTotal(wb.getWorksheet('3-Despesas')!)).toBe(800)
  })

  it('não leva ao órgão as categorias de exemplo do modelo', async () => {
    // O layout extraído carrega, na conciliação, as categorias do exemplo
    // preenchido — "Salário", "Diária", "Taxa bancária". São genéricas, e por
    // isso passaram pela barreira de CPF/CNPJ, mas continuam sendo conteúdo de
    // outra prestação. A folha é composta com os dados reais; nada do exemplo
    // sobrevive.
    const documento = documentoDeTeste({
      conciliacao: {
        ...documentoDeTeste().conciliacao,
        despesasDetalhadas: [{ credor: 'Energisa', categoria: 'Energia', valor: 800 }],
        totalDespesas: 800,
        saldoDisponivel: 14200,
      },
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))
    const folha = wb.getWorksheet('5-Conciliação')!

    const textos: string[] = []
    folha.eachRow((linha) => {
      linha.eachCell((celula) => {
        if (typeof celula.value === 'string') textos.push(celula.value)
      })
    })

    expect(textos).not.toContain('Salário')
    expect(textos).not.toContain('Diária')
    expect(textos).not.toContain('Taxa bancária')
    expect(textos).toContain('Energia')
  })

  it('escreve o saldo disponível na conciliação', async () => {
    const documento = documentoDeTeste({
      conciliacao: {
        ...documentoDeTeste().conciliacao,
        recebimentosPorOrigem: [{ rotulo: 'Doação', valor: 2000 }],
        totalReceitas: 2000,
        totalDespesas: 800,
        saldoDisponivel: 16200,
        despesasDetalhadas: [{ credor: 'Energisa', categoria: 'Energia', valor: 800 }],
      },
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))
    const folha = wb.getWorksheet('5-Conciliação')!

    let saldo: number | undefined
    folha.eachRow((linha, numero) => {
      if (linha.getCell(1).value === 'Saldo Disponível') {
        saldo = folha.getCell(numero, 10).value as number
      }
    })

    expect(saldo).toBe(16200)
  })
})
