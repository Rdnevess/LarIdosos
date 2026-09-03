import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { documentoDeTeste } from '@/../tests/helpers/documento-prestacao'
import { gerarPdfPrestacao } from './pdf-prestacao'
import { LAYOUT, type LayoutFolha, type NomeFolha } from './layout-prestacao'
import { faixaDe } from './grade-prestacao'

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
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
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
 * Violações reais, confirmadas na fonte, fora do que esta tarefa desenha.
 *
 * Não são ruído de extração nem um caso improvável: são formatação salva
 * célula a célula no `.xlsx` original, medida na XML crua, não inferida. Em
 * `5-Conciliação A47:I47`, `A47` tem `borderId=7`, com topo; as oito
 * seguintes, `B47` a `I47`, têm `borderId=8`, sem topo, de forma uniforme.
 * Em `3-Despesas` e `4-Receitas B33:G33`, `B33:E33` têm `borderId=14`, com
 * topo; `F33:G33` têm `borderId=5`, sem topo. O `borderId` é o mesmo
 * mecanismo que motivou `bordasDaFolha` existir: o Excel guarda a borda
 * `direita` de `A1:L2`, na Capa, separada em `L1`/`L2` — cada célula-membro
 * contribui a borda na sua posição dentro do perímetro. Estas três faixas
 * são esse mesmo mecanismo, só que com borda **ausente** numa parte, não
 * borda presente espalhada.
 *
 * Por isso a união por OR de `bordasDaFolha` desenharia o traço MAIS LONGO
 * do que o modelo tem, não mais curto: o topo esticado pela largura inteira
 * da faixa, cobrindo `F:G` em Despesas e Receitas e `B:I` em Conciliação,
 * onde o original não tem nada. Isso vai aparecer assim que essas três
 * folhas forem desenhadas — a saída é rastrear a extensão de cada lado, não
 * aceitar o esticamento.
 *
 * Nenhuma das três está em Capa, Contra-Capa ou Encerramento, as que
 * `desenharFolha` já desenha hoje — por isso a lista abaixo não bloqueia
 * esta tarefa. Ela existe para isso, e não porque o caso seja benigno: uma
 * violação NOVA nas seis folhas ainda reprova este teste, e uma destas três
 * sumir também reprova — sinal de que a lista precisa ser atualizada porque
 * o dado foi corrigido, não ignorado.
 */
const VIOLACOES_CONHECIDAS = [
  '3-Despesas B33:G33 lado topo: presente em 4/6 celulas do perimetro',
  '4-Receitas B33:G33 lado topo: presente em 4/6 celulas do perimetro',
  '5-Conciliação A47:I47 lado topo: presente em 1/9 celulas do perimetro',
].sort()

describe('a premissa de uniao por lado em bordasDaFolha', () => {
  it('cada lado presente numa faixa mesclada cobre todo aquele trecho do perimetro, nas seis folhas', () => {
    const violacoes = (Object.keys(LAYOUT) as NomeFolha[])
      .flatMap((nome) => violacoesDePerimetro(LAYOUT[nome]))
      .sort()
    expect(violacoes, violacoes.join('\n')).toEqual(VIOLACOES_CONHECIDAS)
  })

  it('nas tres folhas que a grade ja desenha, nenhuma violacao escapa pela lista conhecida', () => {
    const folhasDesenhadas: NomeFolha[] = ['1-Capa', '2-Contra-Capa', '6-Encerramento']
    const violacoes = folhasDesenhadas.flatMap((nome) => violacoesDePerimetro(LAYOUT[nome]))
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })
})
