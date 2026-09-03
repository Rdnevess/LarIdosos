import { describe, it, expect } from 'vitest'
import { LAYOUT } from './layout-prestacao'
import {
  ALTURA_PAGINA,
  LARGURA_PAGINA,
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
  it('inverte o eixo: a linha 1 fica no alto da pagina', () => {
    // Na planilha o `y` cresce para baixo; no PDF, para cima. A inversao mora
    // aqui, uma vez — como ja mora em `posicaoY` do grafico de tendencia.
    const capa = LAYOUT['1-Capa']

    expect(yDaLinha(capa, 1)).toBeGreaterThan(yDaLinha(capa, 2))
    expect(yDaLinha(capa, 1)).toBeCloseTo(ALTURA_PAGINA - capa.margens.topo, 1)
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

  it('nenhuma caixa das seis folhas sai da pagina', () => {
    // A guarda de conjunto: se alguma celula cair fora do papel, o documento
    // sai cortado e ninguem repara ate a fiscalizacao reparar.
    for (const folha of Object.values(LAYOUT)) {
      for (const celula of Object.keys(folha.bordas)) {
        const c = caixaDa(folha, celula)
        expect(c.x, `${folha.nome} ${celula}`).toBeGreaterThanOrEqual(0)
        expect(c.x + c.largura, `${folha.nome} ${celula}`).toBeLessThanOrEqual(LARGURA_PAGINA + 0.01)
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
