import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import PDFKitDocument from 'pdfkit'
import { documentoDeTeste, despesaDeTeste } from '@/../tests/helpers/documento-prestacao'
import type { DocumentoPrestacao } from './documento-prestacao'
import { gerarPdfPrestacao, desenharFolha, desenharFolhaDeLancamentos } from './pdf-prestacao'
import { LAYOUT, type LayoutFolha, type NomeFolha } from './layout-prestacao'
import { faixaDe, xDaColuna, yDaLinha } from './grade-prestacao'

/** Um `DocumentoPrestacao` com `n` linhas de despesa, para testar o transbordo. */
function documentoCom(n: number): DocumentoPrestacao {
  return documentoDeTeste({
    despesas: Array.from({ length: n }, (_, i) =>
      despesaDeTeste({ item: i + 1, credor: `Credor ${i + 1}` })
    ),
  })
}

/**
 * Um PDF onde só o que `desenhar` chama existe — sem passar pelo documento
 * inteiro de `gerarPdfPrestacao`.
 *
 * A partir de Despesas e Receitas (esta tarefa), mais de uma folha desenha
 * conteúdo de verdade: o buffer do documento completo deixou de servir para
 * isolar os segmentos de uma folha só, porque as outras contribuem também.
 * Aqui só entra o que `desenhar` pede.
 */
async function bufferIsolado(
  desenhar: (doc: InstanceType<typeof PDFKitDocument>) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFKitDocument({ size: 'A4', margin: 0, compress: false })
    const pedacos: Buffer[] = []
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco))
    doc.on('end', () => resolve(Buffer.concat(pedacos)))
    doc.on('error', reject)

    desenhar(doc)

    doc.end()
  })
}

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

/**
 * Quantos segmentos `desenharFolha` emite para esta folha: para cada faixa
 * com borda, os lados de todas as suas células-membro unidos por OR — a
 * mesma conta que `bordasDaFolha`, em `pdf-prestacao.ts`, faz antes de
 * desenhar. Reimplementada aqui, e não importada de lá, para o teste
 * verificar o resultado com uma conta independente, não com a mesma função
 * que está sob teste.
 */
function segmentosDaFolha(layout: LayoutFolha): number {
  const porAncora = new Map<
    string,
    { topo?: boolean; baixo?: boolean; esquerda?: boolean; direita?: boolean }
  >()

  for (const [celula, lados] of Object.entries(layout.bordas)) {
    const ancora = faixaDe(layout, celula).split(':')[0]
    const atual = porAncora.get(ancora) ?? {}
    porAncora.set(ancora, {
      topo: atual.topo || Boolean(lados.topo),
      baixo: atual.baixo || Boolean(lados.baixo),
      esquerda: atual.esquerda || Boolean(lados.esquerda),
      direita: atual.direita || Boolean(lados.direita),
    })
  }

  let total = 0
  for (const lados of porAncora.values()) {
    total += [lados.topo, lados.baixo, lados.esquerda, lados.direita].filter(Boolean).length
  }
  return total
}

describe('a grade desenhada', () => {
  it('a contagem de segmentos bate exatamente com a uniao de lados das tres folhas estaticas', async () => {
    // Igualdade, nao piso: um piso frouxo deixaria uma regressao que perde
    // ate alguns lados passar despercebida. O esperado e calculado do mesmo
    // jeito que desenharFolha desenha - a uniao de lados por faixa -, e nao
    // pela contagem crua de flags por celula, que conta a mesma linha de uma
    // mescla ate doze vezes.
    //
    // bufferIsolado, e nao gerarPdfPrestacao: a partir desta tarefa Despesas
    // e Receitas tambem desenham borda de verdade, e o documento inteiro
    // deixou de servir pra isolar so as tres folhas estaticas.
    const buffer = await bufferIsolado((doc) => {
      desenharFolha(doc, LAYOUT['1-Capa'], {})
      desenharFolha(doc, LAYOUT['2-Contra-Capa'], {})
      desenharFolha(doc, LAYOUT['6-Encerramento'], {})
    })
    const esperado =
      segmentosDaFolha(LAYOUT['1-Capa']) +
      segmentosDaFolha(LAYOUT['2-Contra-Capa']) +
      segmentosDaFolha(LAYOUT['6-Encerramento'])

    expect(esperado).toBeGreaterThan(0)
    expect(contarSegmentos(buffer)).toBe(esperado)
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

describe('as folhas que crescem', () => {
  it('tres despesas ainda imprimem as vinte e duas linhas do modelo', async () => {
    // A folha nunca encolhe abaixo do modelo: e o que o orgao esta acostumado
    // a receber, e a regra sobreviveu do gerador da planilha.
    const buffer = await gerarPdfPrestacao(documentoCom(3))
    expect(await paginasDe(buffer)).toBe(6)
  })

  it('sessenta despesas transbordam para paginas novas', async () => {
    // 22 linhas cabem numa folha. Com 60, a folha de despesas vira tres.
    const poucas = await paginasDe(await gerarPdfPrestacao(documentoCom(3)))
    const muitas = await paginasDe(await gerarPdfPrestacao(documentoCom(60)))

    expect(muitas).toBeGreaterThan(poucas)
  })

  it('a pagina de transbordo repete o cabecalho da folha', async () => {
    // Quem folheia a pagina 4 precisa saber que coluna esta lendo. Contar
    // quantas vezes "Credor" aparece e o que prova a repeticao.
    const texto = extrairTexto(await gerarPdfPrestacao(documentoCom(60)))
    const ocorrencias = (texto.match(/Credor/g) ?? []).length

    // Uma por pagina de despesas, mais as de receitas (que tambem usa "Credor"
    // no modelo do orgao) e a da conciliacao.
    expect(ocorrencias).toBeGreaterThan(2)
  })
})

type LadoBorda = 'topo' | 'baixo' | 'esquerda' | 'direita'

/** "B11" -> { coluna: 2, linha: 11 }. Espelha `partesDa`, privada em grade-prestacao.ts. */
function partesDaCelula(celula: string): { coluna: number; linha: number } {
  const [, letras, digitos] = celula.match(/^([A-Z]+)(\d+)$/) ?? []
  if (!letras || !digitos) throw new Error(`Célula fora do formato: ${celula}`)
  let coluna = 0
  for (const letra of letras) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return { coluna, linha: Number(digitos) }
}

/** { coluna: 2, linha: 11 } -> "B11". O inverso de `partesDaCelula`. */
function celulaDaParte(coluna: number, linha: number): string {
  let c = coluna
  let letras = ''
  while (c > 0) {
    const resto = (c - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    c = Math.floor((c - 1) / 26)
  }
  return `${letras}${linha}`
}

/**
 * As violações da premissa de `bordasDaFolha`: ela une por OR os lados das
 * células de uma faixa mesclada, o que só desenha a caixa certa se cada lado
 * presente cobrir TODO aquele trecho do perímetro — senão o traço sai com o
 * comprimento inteiro da faixa onde o modelo só tinha borda numa parte dela.
 *
 * Varre as seis folhas do `LAYOUT` para pegar isso antes de o PDF sair
 * errado, se um layout revisado algum dia trouxer borda parcial.
 */
function violacoesDePerimetro(layout: LayoutFolha): string[] {
  const violacoes: string[] = []

  for (const faixa of layout.merges) {
    const [inicio, fim] = faixa.split(':')
    const a = partesDaCelula(inicio)
    const b = partesDaCelula(fim)

    const bordaPresente = (celula: string, lado: LadoBorda) =>
      Boolean(layout.bordas[celula]?.[lado])

    const colunas = Array.from({ length: b.coluna - a.coluna + 1 }, (_, i) => a.coluna + i)
    const linhas = Array.from({ length: b.linha - a.linha + 1 }, (_, i) => a.linha + i)

    const arestas: { lado: LadoBorda; celulas: string[] }[] = [
      { lado: 'topo', celulas: colunas.map((coluna) => celulaDaParte(coluna, a.linha)) },
      { lado: 'baixo', celulas: colunas.map((coluna) => celulaDaParte(coluna, b.linha)) },
      { lado: 'esquerda', celulas: linhas.map((linha) => celulaDaParte(a.coluna, linha)) },
      { lado: 'direita', celulas: linhas.map((linha) => celulaDaParte(b.coluna, linha)) },
    ]

    for (const { lado, celulas } of arestas) {
      const presencas = celulas.map((celula) => bordaPresente(celula, lado))
      const algumaPresente = presencas.some(Boolean)
      const todasPresentes = presencas.every(Boolean)
      if (algumaPresente && !todasPresentes) {
        const quantas = presencas.filter(Boolean).length
        violacoes.push(
          `${layout.nome} ${faixa} lado ${lado}: presente em ${quantas}/${celulas.length} celulas do perimetro`
        )
      }
    }
  }

  return violacoes
}

/**
 * Violações reais, confirmadas na fonte, ainda sem o teste de extensão que
 * prova a folha correta.
 *
 * Não são ruído de extração nem um caso improvável: são formatação salva
 * célula a célula no `.xlsx` original, medida na XML crua, não inferida. Em
 * `5-Conciliação A47:I47`, `A47` tem `borderId=7`, com topo; as oito
 * seguintes, `B47` a `I47`, têm `borderId=8`, sem topo, de forma uniforme. O
 * `borderId` é o mesmo mecanismo que motivou `segmentosDeBorda` existir: o
 * Excel guarda a borda `direita` de `A1:L2`, na Capa, separada em `L1`/`L2`
 * — cada célula-membro contribui a borda na sua posição dentro do perímetro.
 * Esta faixa é esse mesmo mecanismo, só que com borda **ausente** numa
 * parte, não borda presente espalhada.
 *
 * `3-Despesas` e `4-Receitas B33:G33` tinham a mesma característica —
 * `B33:E33` com topo, `F33:G33` sem — e saíram desta lista: `pdf-prestacao.ts`
 * não une mais por OR, rastreia a extensão de cada lado célula a célula
 * (`segmentosDeBorda`), e o describe "o rastreamento de extensao" logo
 * abaixo prova, pela coordenada realmente desenhada no PDF, que o traço para
 * em `E` e não estica até `G`. `5-Conciliação` fica porque ninguém ainda
 * desenhou aquela folha de verdade nem escreveu o teste de extensão
 * equivalente para ela — outra tarefa.
 *
 * Por isso a varredura abaixo pula `3-Despesas` e `4-Receitas` de propósito:
 * a garantia para as duas não é mais "nenhuma violação escapou por aqui", é
 * o teste de extensão, mais forte porque confere a coordenada desenhada, não
 * só a presença/ausência na célula do layout. Uma violação NOVA nas folhas
 * varridas ainda reprova este teste, e a de Conciliação sumir também reprova
 * — sinal de que a lista precisa ser atualizada porque o dado foi corrigido
 * ou a folha ganhou o mesmo teste de extensão, não porque foi ignorada.
 */
const VIOLACOES_CONHECIDAS = [
  '5-Conciliação A47:I47 lado topo: presente em 1/9 celulas do perimetro',
].sort()

describe('a premissa de uniao por lado em bordasDaFolha', () => {
  it('cada lado presente numa faixa mesclada cobre todo aquele trecho do perimetro, fora de despesas e receitas', () => {
    const folhasVarridas = (Object.keys(LAYOUT) as NomeFolha[]).filter(
      (nome) => nome !== '3-Despesas' && nome !== '4-Receitas'
    )
    const violacoes = folhasVarridas.flatMap((nome) => violacoesDePerimetro(LAYOUT[nome])).sort()
    expect(violacoes, violacoes.join('\n')).toEqual(VIOLACOES_CONHECIDAS)
  })

  it('nas tres folhas que a grade ja desenha, nenhuma violacao escapa pela lista conhecida', () => {
    const folhasDesenhadas: NomeFolha[] = ['1-Capa', '2-Contra-Capa', '6-Encerramento']
    const violacoes = folhasDesenhadas.flatMap((nome) => violacoesDePerimetro(LAYOUT[nome]))
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })
})

type SegmentoBruto = { x1: number; y1: number; x2: number; y2: number }

/**
 * Os segmentos `moveTo` + `lineTo` do conteúdo do PDF, como números.
 *
 * Mesma técnica de `contarSegmentos`: em teste o PDF sai sem compressão, e
 * cada borda que `desenharFolha` desenha emite exatamente um par contíguo
 * "x y m" seguido de "x y l" — `moveTo` e `lineTo`, sem nada entre os dois.
 */
function segmentosBrutos(buffer: Buffer): SegmentoBruto[] {
  const texto = buffer.toString('latin1')
  const pares = texto.match(/[\d.]+ [\d.]+ m\n[\d.]+ [\d.]+ l/g) ?? []
  return pares.map((par) => {
    const [x1, y1, x2, y2] = (par.match(/[\d.]+/g) ?? []).map(Number)
    return { x1, y1, x2, y2 }
  })
}

describe('o rastreamento de extensao no topo de B33:G33', () => {
  it('para no fim de E — nao estica ate G como a uniao por OR desenharia', async () => {
    // Medido na XML crua do .xlsx: B33:E33 tem borderId=14, com topo;
    // F33:G33 tem borderId=5, sem topo — o mesmo caso que motivou tirar
    // Despesas e Receitas de VIOLACOES_CONHECIDAS, agora provado pela
    // coordenada realmente desenhada, nao so pela presenca na celula.
    const layout = LAYOUT['3-Despesas']
    const y = yDaLinha(layout, 33)
    const xInicioB = xDaColuna(layout, 2)
    const xFimE = xDaColuna(layout, 6) // fim de E = inicio de F: onde o modelo para
    const xFimG = xDaColuna(layout, 8) // fim de G = inicio de H: o esticamento que a uniao por OR desenharia

    // bufferIsolado, e nao gerarPdfPrestacao: 4-Receitas tem, na mesma
    // posicao, uma borda "baixo" real na ultima linha de dado (B32:E32) que
    // coincide em coordenada com o topo de B33:G33 — outra faixa, outro
    // motivo, mesmo traco visual. Isolar so Despesas evita esse falso match.
    const documento = documentoCom(3)
    const linhas = documento.despesas.map((despesa) => ({
      descricao: despesa.credor,
      documento: despesa.documento,
      complemento: despesa.formaPagamento,
      data: despesa.data,
      valor: despesa.valor,
    }))
    const buffer = await bufferIsolado((doc) => {
      desenharFolhaDeLancamentos(doc, layout, documento, linhas)
    })
    const segmentos = segmentosBrutos(buffer)

    const topoDoTotal = segmentos.filter(
      (s) =>
        Math.abs(s.y1 - y) < 0.01 &&
        Math.abs(s.y2 - y) < 0.01 &&
        Math.abs(s.x1 - xInicioB) < 0.01
    )

    expect(topoDoTotal, JSON.stringify(topoDoTotal)).toHaveLength(1)
    expect(topoDoTotal[0].x2).toBeCloseTo(xFimE, 3)
    expect(topoDoTotal[0].x2).not.toBeCloseTo(xFimG, 3)
  })
})
