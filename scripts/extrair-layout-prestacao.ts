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

  folha.eachRow((linha, n) => {
    // A regra que protege o arquivo gerado: fora da faixa, tudo; dentro,
    // nada.
    if (dentroDaFaixa(n, faixa)) return

    linha.eachCell((celula) => {
      // Só a âncora do merge: as demais repetem o mesmo texto.
      if (cobertas.has(celula.address)) return

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

function larguras(folha: ExcelJS.Worksheet): { coluna: number; largura: number }[] {
  const resultado: { coluna: number; largura: number }[] = []
  for (let i = 1; i <= folha.columnCount; i += 1) {
    const largura = folha.getColumn(i).width
    if (typeof largura === 'number') resultado.push({ coluna: i, largura })
  }
  return resultado
}

async function principal(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(CAMINHO_MODELO)

  const folhas = wb.worksheets.map((folha) => {
    const faixa = FOLHAS_QUE_CRESCEM.includes(folha.name)
      ? acharFaixaDados(folha)
      : undefined

    const merges = ((folha.model as { merges?: string[] }).merges ?? []).slice().sort()

    return {
      nome: folha.name,
      merges,
      larguras: larguras(folha),
      rotulos: extrairRotulos(folha, faixa, merges),
      faixaDados: faixa,
    }
  })

  const cabecalho = `/**
 * O layout do modelo de prestação de contas exigido pelo órgão.
 *
 * **Arquivo gerado.** Não edite à mão: rode
 * \`npx tsx scripts/extrair-layout-prestacao.ts\` contra o modelo em
 * \`docs/convenio/\`, que fica fora do git.
 *
 * Só contém faixas de célula, larguras de coluna e rótulos fixos. Nenhuma
 * célula da faixa de dados é copiada — há teste conferindo que nenhum CPF ou
 * CNPJ escapou.
 */

export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  /** Célula → texto. Rótulo fixo, nunca dado de ninguém. */
  rotulos: Record<string, string>
  /** Onde começa e termina a faixa que cresce com o volume de lançamentos. */
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }
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
