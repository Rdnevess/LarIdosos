import { describe, it, expect } from 'vitest'
import { LAYOUT } from './layout-prestacao'

describe('LAYOUT', () => {
  it('tem as seis folhas do modelo, na ordem', () => {
    expect(Object.keys(LAYOUT)).toEqual([
      '1-Capa',
      '2-Contra-Capa',
      '3-Despesas',
      '4-Receitas',
      '5-Conciliação',
      '6-Encerramento',
    ])
  })

  it('não carrega documento de ninguém', () => {
    // O layout é extraído do modelo do órgão, que fica fora do git. Este teste
    // é a última barreira: se um CPF ou CNPJ escapar da extração, ele falha —
    // e o conserto é o critério do script, nunca este teste.
    const tudo = JSON.stringify(LAYOUT)

    expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    expect(tudo).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
    expect(tudo).not.toMatch(/\d{11,14}/)
  })

  it('sabe onde a faixa de dados cresce, nas duas folhas que crescem', () => {
    // O teto de ~22 linhas do modelo já foi atingido: hoje a equipe insere
    // linhas e reajusta fórmulas à mão. É esta faixa que o renderizador
    // dimensiona pelo volume real.
    expect(LAYOUT['3-Despesas'].faixaDados).toEqual({ primeiraLinha: 11, ultimaLinha: 32 })
    expect(LAYOUT['4-Receitas'].faixaDados).toEqual({ primeiraLinha: 11, ultimaLinha: 32 })
  })

  it('não marca faixa de dados nas folhas de texto corrido', () => {
    expect(LAYOUT['1-Capa'].faixaDados).toBeUndefined()
    expect(LAYOUT['6-Encerramento'].faixaDados).toBeUndefined()
  })

  it('traz os rótulos de coluna das folhas de lançamento', () => {
    const despesas = Object.values(LAYOUT['3-Despesas'].rotulos)

    expect(despesas).toContain('Item')
    expect(despesas).toContain('Credor')
    expect(despesas).toContain('CNPJ/CPF')
    expect(despesas).toContain('CH/OB')
    expect(despesas).toContain('Valor (R$)')
    expect(despesas).toContain('Total')
  })

  it('guarda só a âncora de cada faixa mesclada', () => {
    // Sem isto, o título de uma página apareceria doze vezes — uma por célula
    // do merge — e o arquivo gerado ficaria grande demais para alguém ler
    // antes de commitar, que é o passo que protege contra vazar dado.
    const rotulos = LAYOUT['3-Despesas'].rotulos

    expect(rotulos.A8).toBe('DESPESAS')
    expect(rotulos.B8).toBeUndefined()
  })

  it('não guarda o ofício nem a declaração: aqueles são conteúdo', () => {
    // Os dois carregam período, conta e razão social. Copiados como rótulo
    // fixo, congelariam "dezembro de 2025" em toda prestação gerada. Moram em
    // `textos-prestacao.ts`, como modelo com substituição.
    const tudo = JSON.stringify(LAYOUT)

    expect(tudo).not.toContain('Prezado Senhor')
    expect(tudo).not.toContain('Declaramos para os devidos fins')
    // E a nota de trabalho que estava dentro do modelo não sobrevive em
    // lugar nenhum.
    expect(tudo).not.toContain('Instrução para Claude')
  })

  it('preserva os merges de cada folha', () => {
    // 109 na de despesas: 88 das vinte e duas linhas de dado, quatro por
    // linha, mais os do cabeçalho e do rodapé.
    expect(LAYOUT['3-Despesas'].merges.length).toBe(109)
    expect(LAYOUT['5-Conciliação'].merges.length).toBe(117)
  })
})
