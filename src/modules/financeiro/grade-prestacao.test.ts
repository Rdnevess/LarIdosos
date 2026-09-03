import { describe, it, expect } from 'vitest'
import type { LayoutFolha } from './layout-prestacao'
import { LAYOUT } from './layout-prestacao'
import {
  ALTURA_PAGINA,
  LARGURA_PAGINA,
  alturaDaLinha,
  caixaDa,
  faixaDe,
  larguraDaColuna,
  linhasQueCabem,
  xDaColuna,
  yDaLinha,
} from './grade-prestacao'

describe('larguraDaColuna', () => {
  it('converte a largura do Excel em pontos', () => {
    // O Excel mede coluna em caracteres; o PDF em pontos, a 72 por polegada
    // contra os 96 da tela. `(largura * 7 + 5) * 0,75` e a formula do OOXML
    // para a fonte padrao de 11pt.
    expect(larguraDaColuna(8.14)).toBeCloseTo(46.49, 1)
  })

  it('as doze colunas do modelo cabem na largura util de todas as folhas', () => {
    // Nao e coincidencia: a planilha foi desenhada para caber na A4. Se esta
    // conta nao fechasse, a fidelidade seria aproximacao e nao reproducao.
    for (const folha of Object.values(LAYOUT)) {
      const somadas = folha.larguras.reduce((s, c) => s + larguraDaColuna(c.largura), 0)
      const util = LARGURA_PAGINA - folha.margens.esquerda - folha.margens.direita

      expect(somadas, `${folha.nome}: ${somadas.toFixed(1)}pt em ${util.toFixed(1)}pt`)
        .toBeLessThanOrEqual(util)
    }
  })
})

describe('yDaLinha', () => {
  it('conta a partir do topo da pagina: a linha 1 vem antes da linha 2', () => {
    // O pdfkit expoe origem no canto superior esquerdo com y para baixo -
    // medido no content stream, a mesma direcao da planilha. Nao ha inversao:
    // a linha 1 tem o menor y, porque fica mais perto do topo.
    const capa = LAYOUT['1-Capa']

    expect(yDaLinha(capa, 1)).toBeLessThan(yDaLinha(capa, 2))
    expect(yDaLinha(capa, 1)).toBeCloseTo(capa.margens.topo, 1)
  })
})

describe('xDaColuna', () => {
  it('soma a largura das colunas anteriores, a partir da margem esquerda', () => {
    const despesas = LAYOUT['3-Despesas']
    const somaAteQuatro = despesas.larguras
      .filter((c) => c.coluna < 5)
      .reduce((soma, c) => soma + larguraDaColuna(c.largura), 0)

    expect(xDaColuna(despesas, 5)).toBeCloseTo(despesas.margens.esquerda + somaAteQuatro, 1)
  })
})

describe('faixaDe', () => {
  it('devolve a faixa mesclada que contem a celula', () => {
    // O titulo "DESPESAS" vive em A8, ancora de uma faixa mesclada. Desenhar
    // na caixa de A8 sozinha o espremeria numa coluna de 46pt.
    const despesas = LAYOUT['3-Despesas']
    const faixa = faixaDe(despesas, 'A8')

    expect(faixa).toContain(':')
    expect(faixa.startsWith('A8')).toBe(true)
  })

  it('celula fora de merge devolve ela mesma', () => {
    expect(faixaDe(LAYOUT['3-Despesas'], 'Z99')).toBe('Z99')
  })
})

describe('caixaDa', () => {
  it('a caixa de uma faixa mesclada e a uniao das celulas', () => {
    // A largura de A8 sozinha e uma coluna; a da faixa A8:L8 sao doze.
    const despesas = LAYOUT['3-Despesas']
    const uma = larguraDaColuna(despesas.larguras[0].largura)

    expect(caixaDa(despesas, 'A8').largura).toBeGreaterThan(uma * 5)
  })

  it('a caixa comeca na margem da folha, nao em zero', () => {
    const capa = LAYOUT['1-Capa']
    expect(caixaDa(capa, 'A1').x).toBeCloseTo(capa.margens.esquerda, 1)
  })

  it('o y da caixa e o topo da linha, e a altura de uma faixa de varias linhas e a soma delas', () => {
    // A11:L16 mescla seis linhas na Capa. A caixa cobre as seis, do topo da
    // primeira ate o fim da ultima - e ninguem tinha aferido o eixo vertical.
    const capa = LAYOUT['1-Capa']
    const caixa = caixaDa(capa, 'A11')
    const alturaEsperada = [11, 12, 13, 14, 15, 16]
      .reduce((soma, linha) => soma + alturaDaLinha(capa, linha), 0)

    expect(caixa.y).toBeCloseTo(yDaLinha(capa, 11), 1)
    expect(caixa.altura).toBeCloseTo(alturaEsperada, 1)
  })

  it('converte coluna de duas letras: o modelo nao usa, mas a formula precisa aguentar', () => {
    // Nenhuma folha do modelo passa de L, mas um modelo revisado poderia. Uma
    // folha sintetica de 27 colunas iguais exercita a conversao de "AA".
    const sintetica: LayoutFolha = {
      nome: 'Sintetica',
      merges: [],
      larguras: Array.from({ length: 27 }, (_, i) => ({ coluna: i + 1, largura: 10 })),
      rotulos: {},
      alturas: [],
      alturaPadrao: 15,
      bordas: {},
      fontes: {},
      alinhamentos: {},
      margens: { esquerda: 0, direita: 0, topo: 0, baixo: 0 },
    }

    expect(caixaDa(sintetica, 'AA1').x).toBeCloseTo(26 * larguraDaColuna(10), 1)
  })

  it('nenhuma caixa das seis folhas sai da pagina', () => {
    // A guarda de conjunto: se alguma celula cair fora do papel, o documento
    // sai cortado e ninguem repara ate a fiscalizacao reparar. Cobre os dois
    // eixos - uma folha invertida verticalmente ainda passaria so pelo x.
    for (const folha of Object.values(LAYOUT)) {
      for (const celula of Object.keys(folha.bordas)) {
        const c = caixaDa(folha, celula)
        expect(c.x, `${folha.nome} ${celula}`).toBeGreaterThanOrEqual(0)
        expect(c.x + c.largura, `${folha.nome} ${celula}`).toBeLessThanOrEqual(LARGURA_PAGINA + 0.01)
        expect(c.y, `${folha.nome} ${celula}`).toBeGreaterThanOrEqual(0)
        expect(c.y + c.altura, `${folha.nome} ${celula}`).toBeLessThanOrEqual(ALTURA_PAGINA + 0.01)
      }
    }
  })
})

describe('linhasQueCabem', () => {
  it('conta quantas linhas de dados entram antes de estourar a pagina', () => {
    // O transbordo depende disto: com 60 despesas, a folha vira tres paginas.
    const despesas = LAYOUT['3-Despesas']
    const cabem = linhasQueCabem(despesas, despesas.faixaDados!.primeiraLinha, 21)

    expect(cabem).toBeGreaterThan(0)
    expect(cabem).toBeLessThan(100)
  })
})
