import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O teste do tema, medido sobre o próprio `globals.css`.
 *
 * Ele lê o CSS como texto e extrai os pares `--cor-*: #rrggbb` de cada bloco.
 * Uma tabela de cores duplicada aqui em TypeScript passaria a medir a si mesma
 * no dia em que o CSS mudasse sozinho — os dois arquivos concordariam entre si
 * enquanto a tela mostrava outra coisa. Assim há uma fonte só, e o que se mede
 * é exatamente o que o navegador recebe.
 */

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

type Paleta = Record<string, string>

/**
 * Os blocos não têm chaves aninhadas — só declarações e comentários —, então
 * casar até a primeira `}` basta e dispensa um parser de CSS inteiro.
 */
function bloco(seletor: RegExp): Paleta {
  const achado = CSS.match(seletor)
  if (!achado) throw new Error(`bloco não encontrado no globals.css: ${seletor}`)

  const paleta: Paleta = {}
  for (const [, nome, hex] of achado[1].matchAll(/--cor-([a-z-]+):\s*(#[0-9a-f]{6})/g)) {
    paleta[nome] = hex
  }
  return paleta
}

const claro = bloco(/^:root \{([^}]*)\}/m)
const escuroDoSistema = bloco(/:root:not\(\[data-tema="claro"\]\) \{([^}]*)\}/)
const escuroEscolhido = bloco(/^:root\[data-tema="escuro"\] \{([^}]*)\}/m)

function canal(valor: number): number {
  const s = valor / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  )
}

function contraste(a: string, b: string): number {
  const [claro_, escuro_] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro_ + 0.05) / (escuro_ + 0.05)
}

/**
 * Os pares que o sistema realmente produz — cada um conferido no markup, e não
 * um produto cartesiano de tokens. Medir combinações que nunca aparecem numa
 * tela obrigaria a inventar cores para satisfazer o teste.
 */
const PARES: [texto: string, fundo: string, onde: string][] = [
  // Os cinco degraus sobre as duas superfícies mais comuns.
  ['forte', 'superficie', 'títulos e nomes no cartão'],
  ['forte', 'fundo', 'títulos direto na página'],
  ['firme', 'superficie', 'rótulo de campo'],
  ['firme', 'fundo', 'rótulo de campo na página'],
  ['medio', 'superficie', 'link sublinhado, texto secundário'],
  ['medio', 'fundo', 'texto secundário na página'],
  ['apoio', 'superficie', 'legenda, "nenhum registro"'],
  ['apoio', 'fundo', 'legenda na página'],
  ['tenue', 'superficie', 'a setinha › das listas'],
  ['tenue', 'fundo', 'a setinha › na página'],

  // Sobre `suave`: o painel do desligamento traz firme e apoio juntos, o do
  // funcionário desligado traz medio, e a linha em hover das listas traz
  // forte, apoio e a setinha.
  ['forte', 'suave', 'nome na linha em hover'],
  ['firme', 'suave', 'painel de residentes/[id]/desligar'],
  ['medio', 'suave', 'painel de funcionarios/[id]/editar'],
  ['apoio', 'suave', 'subtítulo na linha em hover'],
  ['tenue', 'suave', 'a setinha › na linha em hover'],

  ['forte', 'realce', 'item de navegação em hover'],
  ['sobre-acao', 'acao', 'texto do botão primário'],

  ['alerta', 'alerta-fundo', 'texto do aviso'],
  ['alerta-suave', 'alerta-fundo', 'segunda linha do aviso'],
  ['alerta', 'alerta-realce', 'etiqueta "aberta" da prestação'],

  ['perigo', 'superficie', 'erro e o * de obrigatório'],
  ['perigo', 'fundo', 'erro direto na página'],
  ['perigo-forte', 'perigo-fundo', 'alerta clínico'],

  ['sucesso', 'superficie', 'confirmação'],
  ['sucesso', 'fundo', 'confirmação na página'],
  ['sucesso-forte', 'sucesso-fundo', 'etiqueta "fechada"'],
]

/**
 * Exceção nominal, e não falha silenciada: `--cor-tenue` pinta a setinha `›`
 * das listas, que é `aria-hidden` e puramente decorativa. Fica registrada aqui
 * para que a próxima pessoa veja que foi uma decisão, e não um esquecimento.
 */
const DECORATIVOS = new Set(['tenue'])

const AA = 4.5

describe('os três blocos do globals.css', () => {
  it('cobrem os mesmos 27 tokens', () => {
    // A contagem é cravada de propósito. As outras asserções deste teste só
    // verificam que os três blocos concordam ENTRE SI — se alguém apagasse o
    // mesmo token dos três, elas continuariam verdes. Este número é o que
    // percebe um token que sumiu.
    expect(Object.keys(claro)).toHaveLength(27)
    expect(Object.keys(escuroDoSistema).sort()).toEqual(Object.keys(claro).sort())
    expect(Object.keys(escuroEscolhido).sort()).toEqual(Object.keys(claro).sort())
  })

  it('os dois blocos escuros não divergem', () => {
    // Os valores são repetidos literalmente nos dois blocos para que este teste
    // possa lê-los do CSS. O preço da duplicação é a chance de alguém alterar um
    // e esquecer o outro — e o sintoma seria cruel: o tema certo para quem
    // clicou no botão, e outro para quem só tem o sistema no escuro.
    expect(escuroEscolhido).toEqual(escuroDoSistema)
  })
})

describe('contraste do tema escuro', () => {
  for (const [texto, fundo, onde] of PARES) {
    const decorativo = DECORATIVOS.has(texto)
    const rotulo = `${texto} sobre ${fundo} (${onde})`

    it(decorativo ? `${rotulo} — decorativo, isento` : rotulo, () => {
      const razao = contraste(escuroEscolhido[texto], escuroEscolhido[fundo])

      if (decorativo) {
        // Não se exige AA de um enfeite, mas exige-se que ele continue visível:
        // abaixo de 1,5:1 a setinha teria sumido, e aí não seria mais decoração.
        expect(razao).toBeGreaterThan(1.5)
        return
      }

      expect(razao).toBeGreaterThanOrEqual(AA)
    })
  }
})

describe('contraste do tema claro', () => {
  // O claro passa hoje e serve de linha de base: se algum ajuste futuro o
  // rebaixar ao mexer nos tokens, o teste avisa antes de chegar na tela.
  for (const [texto, fundo, onde] of PARES) {
    if (DECORATIVOS.has(texto)) continue

    it(`${texto} sobre ${fundo} (${onde})`, () => {
      expect(contraste(claro[texto], claro[fundo])).toBeGreaterThanOrEqual(AA)
    })
  }
})

/**
 * A guarda contra cor crua.
 *
 * É o "esquecer uma" — o defeito que derrubou o primeiro tema escuro —
 * transformado em erro de teste, em vez de confiança na memória de quem
 * escreve a próxima tela.
 */

const FAMILIAS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'white', 'black',
].join('|')

const PROPRIEDADES =
  'bg|text|border|divide|ring|placeholder|outline|accent|caret|shadow|from|via|to'

// O `\b` fecha só o ramo das famílias: depois do `]` do valor arbitrário não há
// caractere de palavra, e uma borda ali nunca casaria — `text-[#0f172a]`
// passaria batido por uma guarda que parecia funcionar.
const COR_CRUA = new RegExp(
  `(?:[a-z-]+:)?(?:${PROPRIEDADES})-(?:(?:${FAMILIAS})(?:-\\d{2,3})?\\b|\\[#[0-9a-fA-F]{3,8}\\])`,
  'g',
)

function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) return arquivosDeCodigo(caminho)
    return /\.tsx?$/.test(entrada.name) ? [caminho] : []
  })
}

describe('guarda contra cor crua', () => {
  it('nenhuma tela declara cor fora dos tokens', () => {
    const achados: string[] = []

    for (const arquivo of arquivosDeCodigo(join(process.cwd(), 'src'))) {
      readFileSync(arquivo, 'utf8')
        .split(/\r?\n/)
        .forEach((linha, i) => {
          for (const cor of linha.match(COR_CRUA) ?? []) {
            const relativo = arquivo.slice(process.cwd().length + 1).replace(/\\/g, '/')
            achados.push(`${relativo}:${i + 1}  ${cor}`)
          }
        })
    }

    expect(achados, `use um token de \`globals.css\`:\n${achados.join('\n')}`).toEqual([])
  })

  it('reconhece as cores que deve barrar', () => {
    // Sem isto, um erro no regex faria a guarda passar sempre — e o teste
    // acima viraria enfeite. Cada linha aqui é uma classe que existiu de
    // verdade no sistema antes da repintura.
    for (const cru of [
      'bg-white', 'text-slate-800', 'text-slate-500', 'bg-slate-50',
      'hover:bg-slate-100', 'border-slate-300', 'text-white', 'bg-amber-50',
      'text-red-600', 'bg-green-100', 'text-[#0f172a]',
    ]) {
      expect(cru.match(COR_CRUA), `deveria barrar ${cru}`).not.toBeNull()
    }
  })

  it('não confunde token com cor crua', () => {
    for (const token of [
      'bg-fundo', 'bg-superficie', 'text-forte', 'text-apoio', 'text-sobre-acao',
      'border-borda-suave', 'hover:bg-suave', 'bg-alerta-realce', 'text-perigo-forte',
    ]) {
      expect(token.match(COR_CRUA), `não deveria barrar ${token}`).toBeNull()
    }
  })
})

describe('guarda contra botão cru', () => {
  it('nenhuma tela declara <button> fora do primitivo', () => {
    // Mesmo motivo da guarda de cor: "como é um botão primário" precisa ter uma
    // resposta só. O primitivo é o único lugar autorizado a escrever a tag.
    const achados: string[] = []

    for (const arquivo of arquivosDeCodigo(join(process.cwd(), 'src'))) {
      if (arquivo.endsWith(join('ui', 'botao.tsx'))) continue
      readFileSync(arquivo, 'utf8')
        .split(/\r?\n/)
        .forEach((linha, i) => {
          if (/<button[\s>]/.test(linha)) {
            const relativo = arquivo.slice(process.cwd().length + 1).replace(/\\/g, '/')
            achados.push(`${relativo}:${i + 1}`)
          }
        })
    }

    expect(achados, `use <Botao> de @/components/ui/botao:\n${achados.join('\n')}`).toEqual([])
  })
})
