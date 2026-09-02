import ExcelJS from 'exceljs'

/**
 * Extrai o layout do modelo de prestação de contas exigido pelo órgão, e emite
 * `src/modules/financeiro/layout-prestacao.ts`.
 *
 * O modelo tem 109 a 117 células mescladas por folha — o layout inteiro depende
 * delas. Escrever ~450 definições de merge a partir de uma descrição textual
 * seria trabalhar no escuro; daí a extração.
 *
 * **O modelo fica em `docs/convenio/`, fora do git.** Só saem daqui faixas de
 * célula, larguras de coluna e textos que são **rótulo fixo** — cabeçalho de
 * coluna, título de seção, palavras como "Total". Uma célula dentro da faixa de
 * dados nunca é copiada, mesmo que pareça inofensiva: o critério é a posição,
 * não o conteúdo, porque conteúdo se julga errado.
 *
 * Uso:
 *   npx tsx scripts/extrair-layout-prestacao.ts > src/modules/financeiro/layout-prestacao.ts
 */

const CAMINHO_MODELO = 'docs/convenio/Modelo Prestação Contas.xlsx'

/**
 * As duas folhas cuja faixa de dados cresce com o volume. Nas demais, o
 * conteúdo é texto corrido e nada se repete linha a linha.
 */
const FOLHAS_QUE_CRESCEM = ['3-Despesas', '4-Receitas']

type FaixaDados = { primeiraLinha: number; ultimaLinha: number }

type EstiloBorda = 'hair' | 'thin' | 'medium' | 'thick' | 'double'
type LadosComBorda = { topo?: EstiloBorda; esquerda?: EstiloBorda; baixo?: EstiloBorda; direita?: EstiloBorda }
type FonteCelula = { familia: string; tamanho: number; negrito: boolean; italico: boolean }
type AlinhamentoCelula = { horizontal?: 'left' | 'center' | 'right' | 'justify'; vertical?: 'top' | 'middle' | 'bottom'; quebra?: boolean }
type MargensFolha = { esquerda: number; direita: number; topo: number; baixo: number }

/**
 * A faixa de dados vai da linha seguinte ao cabeçalho de coluna (a que tem
 * "Item") até a anterior à do total. É pela posição que se decide o que é dado,
 * e não pelo texto.
 */
function acharFaixaDados(folha: ExcelJS.Worksheet): FaixaDados | undefined {
  let linhaCabecalho = 0
  let linhaTotal = 0

  folha.eachRow((linha, n) => {
    linha.eachCell((celula) => {
      const valor = String(celula.value ?? '').trim()
      if (valor === 'Item' && linhaCabecalho === 0) linhaCabecalho = n
      if (valor === 'Total' && linhaTotal === 0 && n > linhaCabecalho) linhaTotal = n
    })
  })

  if (linhaCabecalho === 0 || linhaTotal === 0) return undefined
  return { primeiraLinha: linhaCabecalho + 1, ultimaLinha: linhaTotal - 1 }
}

function dentroDaFaixa(linha: number, faixa: FaixaDados | undefined): boolean {
  if (!faixa) return false
  return linha >= faixa.primeiraLinha && linha <= faixa.ultimaLinha
}

/**
 * Células cujo texto **não é layout**: são conteúdo com dado dentro.
 *
 * O ofício da contra-capa traz o período e a razão social; a declaração do
 * encerramento traz o número da conta e o mês. Copiados como rótulo fixo, eles
 * congelariam "dezembro de 2025" em toda prestação gerada — um documento que
 * mente sobre a própria competência.
 *
 * Os dois moram em `src/modules/financeiro/textos-prestacao.ts`, como modelo
 * com substituição. A declaração perdeu, lá, a primeira linha do modelo, que
 * era uma nota de trabalho e não parte do documento.
 */
const CELULAS_QUE_SAO_CONTEUDO: Record<string, string[]> = {
  '2-Contra-Capa': ['A16'],
  '6-Encerramento': ['A11'],
}

/**
 * As células que uma faixa mesclada cobre, exceto a âncora. Todas carregam o
 * mesmo valor no arquivo, e guardar as doze cópias de um título de página só
 * engorda o arquivo gerado — a ponto de ninguém conseguir lê-lo antes de
 * commitar, que é justamente o passo que protege contra vazar dado.
 */
function cobertasPorMerge(merges: string[]): Set<string> {
  const cobertas = new Set<string>()

  for (const faixa of merges) {
    const [inicio, fim] = faixa.split(':')
    if (!fim) continue
    const casaInicio = /^([A-Z]+)(\d+)$/.exec(inicio)
    const casaFim = /^([A-Z]+)(\d+)$/.exec(fim)
    if (!casaInicio || !casaFim) continue

    const numeroColuna = (letras: string) =>
      [...letras].reduce((n, letra) => n * 26 + (letra.charCodeAt(0) - 64), 0)
    const letrasColuna = (numero: number) => {
      let resto = numero
      let letras = ''
      while (resto > 0) {
        const indice = (resto - 1) % 26
        letras = String.fromCharCode(65 + indice) + letras
        resto = Math.floor((resto - indice) / 26)
      }
      return letras
    }

    for (let l = Number(casaInicio[2]); l <= Number(casaFim[2]); l += 1) {
      for (let c = numeroColuna(casaInicio[1]); c <= numeroColuna(casaFim[1]); c += 1) {
        const endereco = `${letrasColuna(c)}${l}`
        if (endereco !== inicio) cobertas.add(endereco)
      }
    }
  }

  return cobertas
}

function extrairRotulos(
  folha: ExcelJS.Worksheet,
  faixa: FaixaDados | undefined,
  merges: string[]
): Record<string, string> {
  const rotulos: Record<string, string> = {}
  const cobertas = cobertasPorMerge(merges)
  const conteudo = new Set(CELULAS_QUE_SAO_CONTEUDO[folha.name] ?? [])

  folha.eachRow((linha, n) => {
    // A regra que protege o arquivo gerado: fora da faixa, tudo; dentro,
    // nada.
    if (dentroDaFaixa(n, faixa)) return

    linha.eachCell((celula) => {
      // Só a âncora do merge: as demais repetem o mesmo texto.
      if (cobertas.has(celula.address)) return
      // Texto que é conteúdo, não layout: mora em `textos-prestacao.ts`.
      if (conteudo.has(celula.address)) return

      const valor = celula.value
      // Só texto simples. Fórmula, data e número ficam de fora: o
      // renderizador os calcula, e um número solto no layout seria valor de
      // exemplo virando valor de produção.
      if (typeof valor !== 'string') return
      const texto = valor.trim()
      if (texto === '') return
      rotulos[celula.address] = texto
    })
  })

  return rotulos
}

function larguras(folha: ExcelJS.Worksheet, ateColuna: number): { coluna: number; largura: number }[] {
  const resultado: { coluna: number; largura: number }[] = []
  for (let i = 1; i <= ateColuna; i += 1) {
    const largura = folha.getColumn(i).width
    if (typeof largura === 'number') resultado.push({ coluna: i, largura })
  }
  return resultado
}

/** A última coluna com conteúdo ou borda. O `columnCount` conta coluna vazia. */
function ultimaColunaUsada(folha: ExcelJS.Worksheet): number {
  let ultima = 0
  folha.eachRow({ includeEmpty: true }, (linha) => {
    linha.eachCell({ includeEmpty: true }, (celula) => {
      const valor = celula.value
      const b = celula.border
      const temBorda = Boolean(b && (b.top || b.left || b.bottom || b.right))
      const temValor = valor !== null && valor !== undefined && valor !== ''
      if (temBorda || temValor) ultima = Math.max(ultima, celula.fullAddress.col)
    })
  })
  return ultima
}

/**
 * Polegada para ponto: o `pageSetup` do Excel mede margem em polegadas.
 *
 * Arredonda a duas casas: a polegada vem de um valor em centímetros do
 * Excel, e a conversão gera dízima (ex.: 0,6cm → 17,007874015748033pt). Sem
 * arredondar, a sequência de dígitos sem separador colide com o regex que
 * protege contra CPF/CNPJ — falso positivo, não dado de ninguém.
 */
function emPontos(polegadas: number | undefined, padrao: number): number {
  return Math.round((polegadas ?? padrao) * 72 * 100) / 100
}

function coletarMargens(folha: ExcelJS.Worksheet): MargensFolha {
  const m = folha.pageSetup?.margins
  return {
    esquerda: emPontos(m?.left, 0.25),
    direita: emPontos(m?.right, 0.25),
    topo: emPontos(m?.top, 0.75),
    baixo: emPontos(m?.bottom, 0.75),
  }
}

function coletarBordas(folha: ExcelJS.Worksheet, ateColuna: number): Record<string, LadosComBorda> {
  const bordas: Record<string, LadosComBorda> = {}
  folha.eachRow({ includeEmpty: true }, (linha) => {
    linha.eachCell({ includeEmpty: true }, (celula) => {
      if (celula.fullAddress.col > ateColuna) return
      const b = celula.border
      if (!b) return
      const lados: LadosComBorda = {}
      if (b.top?.style) lados.topo = b.top.style as EstiloBorda
      if (b.left?.style) lados.esquerda = b.left.style as EstiloBorda
      if (b.bottom?.style) lados.baixo = b.bottom.style as EstiloBorda
      if (b.right?.style) lados.direita = b.right.style as EstiloBorda
      if (Object.keys(lados).length > 0) bordas[celula.address] = lados
    })
  })
  return bordas
}

/** Só a aparência da fonte: `celula.value` nunca é lido aqui. */
function coletarFontes(folha: ExcelJS.Worksheet, ateColuna: number): Record<string, FonteCelula> {
  const fontes: Record<string, FonteCelula> = {}
  folha.eachRow({ includeEmpty: true }, (linha) => {
    linha.eachCell({ includeEmpty: true }, (celula) => {
      if (celula.fullAddress.col > ateColuna) return
      const f = celula.font
      if (!f) return
      fontes[celula.address] = {
        familia: f.name ?? 'Arial',
        tamanho: f.size ?? 10,
        negrito: Boolean(f.bold),
        italico: Boolean(f.italic),
      }
    })
  })
  return fontes
}

/** Só a disposição do texto na célula: `celula.value` nunca é lido aqui. */
function coletarAlinhamentos(folha: ExcelJS.Worksheet, ateColuna: number): Record<string, AlinhamentoCelula> {
  const alinhamentos: Record<string, AlinhamentoCelula> = {}
  folha.eachRow({ includeEmpty: true }, (linha) => {
    linha.eachCell({ includeEmpty: true }, (celula) => {
      if (celula.fullAddress.col > ateColuna) return
      const a = celula.alignment
      if (!a) return
      const alinhamento: AlinhamentoCelula = {}
      if (a.horizontal) alinhamento.horizontal = a.horizontal as AlinhamentoCelula['horizontal']
      if (a.vertical) alinhamento.vertical = a.vertical as AlinhamentoCelula['vertical']
      if (a.wrapText) alinhamento.quebra = true
      if (Object.keys(alinhamento).length > 0) alinhamentos[celula.address] = alinhamento
    })
  })
  return alinhamentos
}

function coletarAlturas(folha: ExcelJS.Worksheet): { linha: number; altura: number }[] {
  const alturas: { linha: number; altura: number }[] = []
  folha.eachRow({ includeEmpty: true }, (linha, n) => {
    if (linha.height) alturas.push({ linha: n, altura: linha.height })
  })
  return alturas
}

async function principal(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(CAMINHO_MODELO)

  const folhas = wb.worksheets.map((folha) => {
    const faixa = FOLHAS_QUE_CRESCEM.includes(folha.name)
      ? acharFaixaDados(folha)
      : undefined

    const merges = ((folha.model as { merges?: string[] }).merges ?? []).slice().sort()
    const ultimaColuna = ultimaColunaUsada(folha)

    return {
      nome: folha.name,
      merges,
      larguras: larguras(folha, ultimaColuna),
      rotulos: extrairRotulos(folha, faixa, merges),
      faixaDados: faixa,
      alturas: coletarAlturas(folha),
      alturaPadrao: folha.properties?.defaultRowHeight ?? 12.75,
      bordas: coletarBordas(folha, ultimaColuna),
      fontes: coletarFontes(folha, ultimaColuna),
      alinhamentos: coletarAlinhamentos(folha, ultimaColuna),
      margens: coletarMargens(folha),
    }
  })

  const cabecalho = `/**
 * O layout do modelo de prestação de contas exigido pelo órgão.
 *
 * **Arquivo gerado.** Não edite à mão: rode
 * \`npx tsx scripts/extrair-layout-prestacao.ts\` contra o modelo em
 * \`docs/convenio/\`, que fica fora do git.
 *
 * Só contém faixas de célula, larguras de coluna, rótulos fixos e a
 * aparência (borda, fonte, alinhamento, altura, margem). Nenhuma célula da
 * faixa de dados é copiada — há teste conferindo que nenhum CPF ou CNPJ
 * escapou.
 */

export type EstiloBorda = 'hair' | 'thin' | 'medium' | 'thick' | 'double'
export type LadosComBorda = { topo?: EstiloBorda; esquerda?: EstiloBorda; baixo?: EstiloBorda; direita?: EstiloBorda }
export type FonteCelula = { familia: string; tamanho: number; negrito: boolean; italico: boolean }
export type AlinhamentoCelula = { horizontal?: 'left' | 'center' | 'right' | 'justify'; vertical?: 'top' | 'middle' | 'bottom'; quebra?: boolean }
export type MargensFolha = { esquerda: number; direita: number; topo: number; baixo: number }

export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  /** Célula → texto. Rótulo fixo, nunca dado de ninguém. */
  rotulos: Record<string, string>
  /** Onde começa e termina a faixa que cresce com o volume de lançamentos. */
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }
  /** Linhas com altura declarada, diferente do padrão da folha. */
  alturas: { linha: number; altura: number }[]
  /** Altura, em pontos, das linhas sem altura declarada. */
  alturaPadrao: number
  /** Célula → lados com borda. Só estilo, nunca dado de ninguém. */
  bordas: Record<string, LadosComBorda>
  /** Célula → fonte. Só aparência, nunca dado de ninguém. */
  fontes: Record<string, FonteCelula>
  /** Célula → alinhamento. Só disposição, nunca dado de ninguém. */
  alinhamentos: Record<string, AlinhamentoCelula>
  /** Margens de impressão, em pontos. */
  margens: MargensFolha
}

export type NomeFolha =
${folhas.map((f) => `  | '${f.nome}'`).join('\n')}

export const LAYOUT: Record<NomeFolha, LayoutFolha> = `

  const corpo = JSON.stringify(
    Object.fromEntries(folhas.map((f) => [f.nome, f])),
    null,
    2
  )

  process.stdout.write(`${cabecalho}${corpo}\n`)
}

await principal()
