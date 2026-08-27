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

/**
 * Onde cada texto foi posto na página.
 *
 * O `pdfkit` abre um bloco `BT … ET` por trecho, com a matriz
 * `1 0 0 1 <x> <y> Tm` dizendo onde ele começa. O `y` do PDF cresce **de baixo
 * para cima**, ao contrário do `doc.y` do `pdfkit` — então dois textos na mesma
 * linha têm o mesmo `y`, e um `y` maior está mais alto na folha.
 *
 * Como `extrairTexto`, não é um leitor de PDF: responde "onde esta palavra
 * foi escrita?", que é o que o teste de geometria pergunta.
 */
function textosPosicionados(buffer: Buffer): { texto: string; x: number; y: number }[] {
  const blocos = buffer.toString('latin1').match(/BT[\s\S]{0,400}?ET/g) ?? []

  return blocos.flatMap((bloco) => {
    const matriz = bloco.match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/)
    if (!matriz) return []

    const texto = (bloco.match(/<([0-9a-fA-F]*)>/g) ?? [])
      .map((hexa) => Buffer.from(hexa.slice(1, -1), 'hex').toString('latin1'))
      .join('')

    return [{ texto, x: Number(matriz[1]), y: Number(matriz[2]) }]
  })
}

describe('geometria do cabeçalho das tabelas', () => {
  // Só as folhas de Despesas e Recebimentos usam `tabela()`; as demais
  // desenham por outro caminho. São exatamente as duas em que o defeito
  // aparecia.
  const CABECALHO_DESPESAS = ['Item', 'Credor', 'CNPJ/CPF', 'CH/OB', 'Data', 'Valor (R$)']
  const CABECALHO_RECEBIMENTOS = ['Item', 'Origem', 'CNPJ/CPF', 'Data', 'Valor (R$)']

  it('os títulos do cabeçalho de Despesas ficam todos na mesma linha', async () => {
    // O defeito: o laço lia `doc.y` a cada coluna e devolvia um valor fixo de
    // 16 pt, enquanto `doc.text` avança a altura real da linha (10,71 pt em
    // corpo 9). Sobravam −5,29 pt por coluna, acumulados — a sexta coluna saía
    // 26 pt acima da primeira.
    const buffer = await gerarPdfPrestacao(
      documentoDeTeste({ despesas: [despesaDeTeste()] })
    )
    const postos = textosPosicionados(buffer)

    const credor = postos.find((p) => p.texto === 'Credor')
    expect(credor, 'cabeçalho de Despesas não encontrado').toBeDefined()

    for (const titulo of CABECALHO_DESPESAS) {
      const naMesmaLinha = postos.some((p) => p.texto === titulo && p.y === credor!.y)
      expect(naMesmaLinha, `"${titulo}" fora da linha do cabeçalho`).toBe(true)
    }
  })

  it('os títulos do cabeçalho de Recebimentos ficam todos na mesma linha', async () => {
    const buffer = await gerarPdfPrestacao(
      documentoDeTeste({ receitas: [receitaDeTeste()] })
    )
    const postos = textosPosicionados(buffer)

    const origem = postos.find((p) => p.texto === 'Origem')
    expect(origem, 'cabeçalho de Recebimentos não encontrado').toBeDefined()

    for (const titulo of CABECALHO_RECEBIMENTOS) {
      const naMesmaLinha = postos.some((p) => p.texto === titulo && p.y === origem!.y)
      expect(naMesmaLinha, `"${titulo}" fora da linha do cabeçalho`).toBe(true)
    }
  })

  it('o cabeçalho fica acima da primeira linha de dados', async () => {
    // Consequência do mesmo defeito, e a mais grave: com a deriva, o `doc.y`
    // no fim do laço já estava tão acima que o corpo da tabela começava
    // **antes** do próprio cabeçalho. Em PDF, `y` maior é mais alto.
    const buffer = await gerarPdfPrestacao(
      documentoDeTeste({ despesas: [despesaDeTeste({ credor: 'Fornecedor Alfa' })] })
    )
    const postos = textosPosicionados(buffer)

    const titulo = postos.find((p) => p.texto === 'Credor')
    const dado = postos.find((p) => p.texto === 'Fornecedor Alfa')
    expect(titulo, 'título não encontrado').toBeDefined()
    expect(dado, 'linha de dados não encontrada').toBeDefined()

    expect(titulo!.y, 'o cabeçalho não está acima dos dados').toBeGreaterThan(dado!.y)
  })
})
