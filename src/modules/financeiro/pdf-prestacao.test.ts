import { describe, it, expect } from 'vitest'
import {
  documentoDeTeste,
  despesaDeTeste,
  receitaDeTeste,
} from '@/../tests/helpers/documento-prestacao'
import { gerarPdfPrestacao } from './pdf-prestacao'

/**
 * O `pdfkit` escreve os textos em arrays `TJ`, com os caracteres em hexa e os
 * ajustes de kerning como números entre eles: `[<4173736f>  50 <63696f>] TJ`.
 * Em teste o PDF sai sem compressão, então basta varrer o buffer, juntar os
 * pedaços hexa de cada array e decodificar em `latin1` — que é a codificação
 * das fontes padrão do PDF.
 *
 * Não é um leitor de PDF: serve para responder "esta palavra está no
 * documento?", que é o que estes testes perguntam.
 */
function extrairTexto(buffer: Buffer): string {
  const bruto = buffer.toString('latin1')
  const arrays = bruto.match(/\[[^\]]*\]\s*TJ/g) ?? []

  return arrays
    .map((array) =>
      (array.match(/<([0-9a-fA-F]*)>/g) ?? [])
        .map((hexa) => Buffer.from(hexa.slice(1, -1), 'hex').toString('latin1'))
        .join('')
    )
    .join('\n')
}

describe('gerarPdfPrestacao', () => {
  it('gera um PDF válido', async () => {
    const buffer = await gerarPdfPrestacao(documentoDeTeste())

    // Todo PDF começa com esta assinatura.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('tem uma página por seção do documento', async () => {
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
    const paginas = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

    expect(paginas).toBeGreaterThanOrEqual(6)
  })

  it('escreve a razão social e o mês por extenso', async () => {
    // O PDF não é pixel a pixel igual ao .xlsx, mas é o MESMO documento: o
    // conteúdo precisa estar lá.
    const documento = documentoDeTeste()
    const texto = extrairTexto(await gerarPdfPrestacao(documento))

    expect(texto).toContain(documento.capa.razaoSocial)
    expect(texto).toContain('agosto')
  })

  it('escreve os acentos do português, e não caixas vazias', async () => {
    // Helvetica é WinAnsi: cobre ã, ç e é sem embarcar arquivo de fonte. Se um
    // dia trocarmos por uma fonte que não cubra, isto falha.
    const texto = extrairTexto(await gerarPdfPrestacao(documentoDeTeste()))

    expect(texto).toContain('Associação')
    expect(texto).toContain('Prestação')
  })

  it('não quebra com quarenta despesas', async () => {
    // A tabela precisa paginar sozinha, repetindo o cabeçalho.
    const despesas = Array.from({ length: 40 }, (_, i) =>
      despesaDeTeste({ item: i + 1, credor: `Fornecedor ${i + 1}`, valor: 100 })
    )
    const buffer = await gerarPdfPrestacao(documentoDeTeste({ despesas }))

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(extrairTexto(buffer)).toContain('Fornecedor 40')
  })

  it('leva os totais e o saldo disponível ao papel', async () => {
    // O que a fiscalização confere primeiro.
    const documento = documentoDeTeste({
      despesas: [despesaDeTeste({ valor: 800 })],
      receitas: [receitaDeTeste({ valor: 2000 })],
      conciliacao: {
        ...documentoDeTeste().conciliacao,
        recebimentosPorOrigem: [{ rotulo: 'Doação', valor: 2000 }],
        despesasDetalhadas: [{ credor: 'Energisa', categoria: 'Energia', valor: 800 }],
        totalReceitas: 2000,
        totalDespesas: 800,
        saldoDisponivel: 16200,
      },
    })
    const texto = extrairTexto(await gerarPdfPrestacao(documento))

    expect(texto).toContain('16.200,00')
    expect(texto).toContain('Saldo Disponível')
  })

  it('leva as observações do mês à folha de encerramento', async () => {
    // É o texto que justifica movimentação incomum. Se não sair impresso, o
    // campo livre não serve para nada.
    const documento = documentoDeTeste({
      encerramento: {
        ...documentoDeTeste().encerramento,
        observacoes: 'A reforma do telhado foi emergencial após o temporal.',
        texto:
          'A reforma do telhado foi emergencial após o temporal.\n\nDeclaramos para os devidos fins...',
      },
    })
    const texto = extrairTexto(await gerarPdfPrestacao(documento))

    expect(texto).toContain('reforma do telhado')
  })
})
