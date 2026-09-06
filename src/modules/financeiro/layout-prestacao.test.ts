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

  it('não guarda o exemplo preenchido do órgão', () => {
    // O modelo veio do órgão com um mês de verdade lançado. Até 06/09/2026,
    // dezenove desses textos estavam no arquivo gerado: dezoito categorias na
    // faixa de despesas da conciliação (`F24:F41`) e a origem em `B15`.
    //
    // Eram inofensivos por acidente — a coluna de credor veio vazia e
    // `linhaTraduzida` zera os rótulos ao desenhar —, mas dado de terceiro num
    // arquivo versionado não se defende por acidente. O extrator passou a
    // excluir as duas faixas de dado da conciliação, e não só a das folhas que
    // crescem.
    const tudo = JSON.stringify(LAYOUT)

    for (const doExemplo of [
      'Salário',
      'Diária',
      'Peça para conserto',
      'Prestação de Serviços de terceiros',
      'Taxa bancária',
      'Serviço reforma cozinha',
      'Compra de móveis',
      'Doações',
    ]) {
      expect(tudo, `"${doExemplo}" é do exemplo do órgão`).not.toContain(doExemplo)
    }
  })

  it('mantém os rótulos fixos da conciliação, que não são exemplo', () => {
    // A contraprova do teste acima: excluir faixa demais apagaria o cabeçalho
    // de coluna e os totais, e a folha sairia sem legenda nenhuma.
    const rotulos = LAYOUT['5-Conciliação'].rotulos

    expect(rotulos.A14).toBe('(+) Recebimentos')
    expect(rotulos.A20).toBe('Total de Saldo + Receitas')
    expect(rotulos.A22).toBe('( - ) Despesas')
    expect(rotulos.F23).toBe('Categoria')
    expect(rotulos.A47).toBe('Total de Despesas')
    expect(rotulos.A49).toBe('Saldo Disponível')
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

  it('os campos novos nao carregam texto de ninguem', () => {
    // A superficie do extrator cresceu: bordas, fontes e alinhamentos sao
    // Records com chave de celula. Nenhum deles pode conter texto livre — se
    // contiver, alguma coisa do exemplo preenchido vazou por um caminho novo.
    //
    // As allowlists sao o conjunto que o ECMA-376 define para cada eixo (via
    // os tipos do proprio ExcelJS), nao so os valores que este modelo usa
    // hoje — assim uma revisao do modelo que troque de alinhamento nao
    // quebra o teste à toa, mas texto livre continua barrado.
    const HORIZONTAIS_VALIDOS = [
      'left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed',
    ]
    const VERTICAIS_VALIDOS = ['top', 'middle', 'bottom', 'distributed', 'justify']
    // As familias que o modelo usa hoje. Uma familia nova aqui e
    // comportamento desejado, nao um teste fragil: e o sinal para alguem
    // olhar o que mudou no modelo antes do arquivo gerado entrar no git.
    const FAMILIAS_CONHECIDAS = ['Algerian', 'Arial', 'Calibri', 'Times New Roman']

    for (const folha of Object.values(LAYOUT)) {
      for (const lados of Object.values(folha.bordas)) {
        for (const estilo of Object.values(lados)) {
          expect(['hair', 'thin', 'medium', 'thick', 'double']).toContain(estilo)
        }
      }
      for (const fonte of Object.values(folha.fontes)) {
        expect(typeof fonte.tamanho).toBe('number')
        expect(FAMILIAS_CONHECIDAS).toContain(fonte.familia)
      }
      for (const alinhamento of Object.values(folha.alinhamentos)) {
        if (alinhamento.horizontal !== undefined) {
          expect(HORIZONTAIS_VALIDOS).toContain(alinhamento.horizontal)
        }
        if (alinhamento.vertical !== undefined) {
          expect(VERTICAIS_VALIDOS).toContain(alinhamento.vertical)
        }
        expect(typeof alinhamento.quebra === 'boolean' || alinhamento.quebra === undefined).toBe(true)
      }
    }
  })
})

describe('o estilo que o modelo carrega', () => {
  it('traz as bordas das seis folhas', () => {
    // O defeito que esta tarefa conserta: o extrator recolhia geometria e
    // ignorava aparencia, entao o documento entregue nao tinha as linhas que o
    // modelo do orgao tem. Sao 1431 lados no arquivo original.
    const lados = Object.values(LAYOUT).flatMap((folha) =>
      Object.values(folha.bordas).flatMap((b) =>
        [b.topo, b.esquerda, b.baixo, b.direita].filter(Boolean)
      )
    )

    expect(lados.length).toBe(1431)
  })

  it('o modelo usa um estilo de borda so', () => {
    // Medido no arquivo: todos os 1431 lados sao `thin`.
    //
    // Desde 06/09/2026 nao virá outro modelo do orgao — a prestacao gerada
    // aqui e o documento oficial —, entao este teste deixou de ser um aviso
    // sobre revisao externa e passou a ser o que sempre foi de fato: a prova
    // de que o ramo `double` do renderizador e inalcancavel, e por isso nunca
    // foi exercitado. Ver a pendencia 12 da Fase 3.
    const estilos = new Set(
      Object.values(LAYOUT).flatMap((folha) =>
        Object.values(folha.bordas).flatMap((b) =>
          [b.topo, b.esquerda, b.baixo, b.direita].filter(Boolean)
        )
      )
    )

    expect([...estilos]).toEqual(['thin'])
  })

  it('traz as margens de impressao, que diferem por folha', () => {
    // A capa usa 0,236 polegada nas laterais; as folhas de lancamento usam
    // 0,25 e 0,75. Uma margem so para todas deslocaria quatro folhas.
    expect(LAYOUT['1-Capa'].margens.esquerda).toBeCloseTo(17, 0)
    expect(LAYOUT['3-Despesas'].margens.topo).toBeCloseTo(54, 0)
    expect(LAYOUT['3-Despesas'].margens.esquerda).toBeCloseTo(18, 0)
  })

  it('traz altura de linha e a altura padrao da folha', () => {
    // Altura do Excel ja e em pontos. Linha sem altura declarada usa o padrao
    // da folha, que difere: 13,5 na capa, 12,75 nas de lancamento.
    expect(LAYOUT['1-Capa'].alturaPadrao).toBeCloseTo(13.5, 2)
    expect(LAYOUT['3-Despesas'].alturaPadrao).toBeCloseTo(12.75, 2)
    expect(LAYOUT['3-Despesas'].alturas.length).toBeGreaterThan(0)
  })

  it('traz as fontes, com o nome original preservado', () => {
    // O mapeamento para as fontes embutidas do PDF acontece no desenho, nao
    // aqui: o layout guarda o que o modelo diz, e quem traduz e o renderizador.
    // Assim, o dia em que as fontes originais forem embutidas nao exige
    // reextrair.
    const familias = new Set(
      Object.values(LAYOUT).flatMap((folha) =>
        Object.values(folha.fontes).map((f) => f.familia)
      )
    )

    expect(familias.has('Arial')).toBe(true)
    expect(familias.has('Times New Roman')).toBe(true)
  })

  it('so recolhe ate a coluna 12, e nao ate o columnCount', () => {
    // O ExcelJS relata columnCount de ate 20, contando coluna formatada e
    // vazia. Conteudo e borda param na 12 nas seis folhas. Recolher ate 20
    // acrescentaria oito colunas que estourariam a largura da pagina.
    for (const folha of Object.values(LAYOUT)) {
      expect(folha.larguras.length).toBe(12)
      for (const celula of Object.keys(folha.bordas)) {
        const coluna = celula.replace(/\d+/g, '')
        expect(coluna.length, `${folha.nome}: ${celula} passa da coluna L`).toBe(1)
        expect(coluna <= 'L', `${folha.nome}: ${celula} passa da coluna L`).toBe(true)
      }
    }
  })
})
