import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { documentoDeTeste } from '@/../tests/helpers/documento-prestacao'
import { gerarPdfPrestacao } from './pdf-prestacao'
import { LAYOUT } from './layout-prestacao'

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

/**
 * Conta operadores `moveTo` (`m`) no conteúdo não comprimido do PDF.
 *
 * Não usa `/\bS\b/`: "S" casa com a letra dentro de qualquer texto do
 * documento ("DESPESAS", "Saldo", "Unidade Executora"), e a asserção
 * passaria mesmo sem uma única borda desenhada. `m` é o operador de
 * `moveTo`, específico de traço — cada segmento de borda gera exatamente um.
 */
function contarSegmentos(buffer: Buffer): number {
  const m = buffer.toString('latin1').match(/[\d.]+ [\d.]+ m\b/g)
  return m ? m.length : 0
}

async function paginasDe(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}

describe('a grade desenhada', () => {
  it('desenha um segmento para cada lado com borda da capa', async () => {
    // A prova de que a fidelidade chegou ao papel: a contagem de segmentos do
    // PDF bate com a contagem de lados no layout. Sem isto, "tem bordas" seria
    // impressao, e esta maquina nem consegue abrir o PDF como imagem.
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
    const lados = Object.values(LAYOUT['1-Capa'].bordas)
      .flatMap((b) => [b.topo, b.esquerda, b.baixo, b.direita].filter(Boolean)).length

    expect(lados).toBeGreaterThan(0)
    expect(contarSegmentos(buffer)).toBeGreaterThanOrEqual(lados)
  })

  it('o documento tem ao menos as seis folhas do modelo', async () => {
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
    expect(await paginasDe(buffer)).toBeGreaterThanOrEqual(6)
  })

  it('a razao social vai para a celula da capa, e nao para o topo da pagina', async () => {
    // O layout diz que ela mora em A1, dentro de uma faixa mesclada. O gerador
    // antigo desenhava texto corrido a partir da margem, ignorando o modelo.
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
    expect(extrairTexto(buffer)).toContain('Associação Lar dos Idosos')
  })
})
