# O PDF fiel ao modelo do órgão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a exportação em `.xlsx` e reconstruir o PDF da prestação de contas como uma grade fiel ao modelo do órgão — mesmas posições, mesmas mesclas, mesmas bordas.

**Architecture:** O extrator passa a recolher bordas, fontes, alinhamentos e alturas de linha do `.xlsx` do órgão para `layout-prestacao.ts`. Um módulo puro converte esse layout em caixas de página (sem pdfkit, sem banco), e o renderizador desenha bordas e texto nessas caixas. O `xlsx-prestacao.ts` some; o `layout-prestacao.ts` e o extrator sobrevivem e crescem.

**Tech Stack:** TypeScript, pdfkit (desenho), ExcelJS (só no extrator, em tempo de desenvolvimento), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-pdf-fiel-ao-modelo-design.md`

## Global Constraints

- Tudo em pt-BR: identificadores, comentários, mensagens. Corpo e assunto de commit em ASCII, sem acento e sem travessão.
- Autorização mora no serviço via `exigirPapel`, nunca só na tela. Toda regra tem o seu caso negativo em teste.
- Nada de cor crua do Tailwind, tamanho fora da escala nomeada (`text-titulo`, `text-secao`, `text-corpo`, `text-suporte`, `text-legenda`) nem `<button>` cru. Guardas em `tests/tema.test.ts`.
- **O modelo do órgão fica em `docs/convenio/`, fora do git.** Do extrator só saem geometria, estilo e rótulo fixo. Nenhum valor da faixa de dados, nunca — o critério é a posição, não o conteúdo.
- **Conversão de largura de coluna:** `pontos = (largura × 7 + 5) × 0,75`. Para a largura 8,14 do modelo dá 46,49 pt.
- **Altura de linha do Excel já é em pontos.** Não converta.
- **Margens vêm em polegadas** no `pageSetup` e viram pontos multiplicando por 72. Diferem por folha.
- **São 12 colunas.** O `columnCount` do ExcelJS chega a 20, mas conteúdo e borda param na coluna 12 nas seis folhas.
- **O modelo usa um estilo de borda só:** `thin`, cor padrão, 1.431 lados. As outras espessuras são caminho não exercitado.
- Mapeamento de tipografia: Arial e Calibri → Helvetica; Times New Roman → Times-Roman; Algerian → Times-Bold; qualquer outra → Helvetica. Negrito e itálico usam a variante.
- A suíte E2E completa estoura o limite de tempo. Rode por projeto: `npx playwright test --project=autenticado`, depois `--project=saude --project=administrativo --project=anonimo`. Mate `node` e `chrome` pendurados antes.
- **Não existe `poppler` nesta máquina.** Você não consegue abrir o modelo nem a saída como imagem. A geometria se prova contra o `.xlsx`; a aparência é conferida por uma pessoa.
- Branch já criada: `pdf-fiel-ao-modelo`, a partir de `master`. Ao fim, merge com `--no-ff`. Não empurre nada sem pedir.

---

## Estrutura de arquivos

**Apagar:**

| Arquivo | Por quê |
|---|---|
| `src/modules/financeiro/xlsx-prestacao.ts` | a exportação em `.xlsx` sai |
| `src/modules/financeiro/xlsx-prestacao.test.ts` | idem |

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/financeiro/grade-prestacao.ts` | converte o layout em caixas de página. Sem pdfkit, sem banco, sem I/O. |
| `src/modules/financeiro/grade-prestacao.test.ts` | a aritmética da conversão, provada sozinha. |

**Modificar:**

| Arquivo | O quê |
|---|---|
| `scripts/extrair-layout-prestacao.ts` | recolhe bordas, fontes, alinhamentos, alturas e margens. |
| `src/modules/financeiro/layout-prestacao.ts` | regerado pelo extrator, com o tipo ampliado. |
| `src/modules/financeiro/layout-prestacao.test.ts` | a barreira de dados passa a varrer os campos novos. |
| `src/modules/financeiro/pdf-prestacao.ts` | reescrito: desenha a grade em vez de texto corrido. |
| `src/modules/financeiro/pdf-prestacao.test.ts` | testes da grade, das folhas e do transbordo. |
| `src/modules/financeiro/exportar.ts` | sai o ramo `xlsx`. |
| `src/modules/financeiro/exportar.test.ts` | sai o que aferia `.xlsx`. |
| `src/app/api/prestacoes/[id]/[formato]/route.ts` | `FORMATOS` perde `'xlsx'`. |
| `src/app/(app)/financeiro/prestacoes/page.tsx` | sai o link "Baixar .xlsx". |
| `src/modules/financeiro/anexos-prestacao.test.ts` | a base deixa de ter seis páginas fixas. |
| `tests/e2e/financeiro.spec.ts` | sai a asserção do `.xlsx`. |
| `package.json` | `exceljs` desce para `devDependencies`. |
| `docs/operacao/pendencias-fase-3.md` | itens 1 e 2 morrem; nasce o da tipografia. |
| `README.md` | a exportação passa a ser PDF e CSV. |

---

## Task 1: Remover a exportação em `.xlsx`

Remoção pura, antes de qualquer construção. Deixa a árvore num estado válido e testável, e encolhe a superfície que as tarefas seguintes precisam entender.

**Files:**
- Delete: `src/modules/financeiro/xlsx-prestacao.ts`, `src/modules/financeiro/xlsx-prestacao.test.ts`
- Modify: `src/modules/financeiro/exportar.ts`, `src/modules/financeiro/exportar.test.ts`
- Modify: `src/app/api/prestacoes/[id]/[formato]/route.ts`
- Modify: `src/app/(app)/financeiro/prestacoes/page.tsx`
- Modify: `tests/e2e/financeiro.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces: `type FormatoExportacao = 'pdf' | 'csv'`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/modules/financeiro/exportar.test.ts`, **substitua** o teste que gera o `.xlsx` por este:

```ts
it('recusa o formato xlsx, que deixou de existir', async () => {
  // A exportacao em planilha saiu: o documento entregue ao orgao passou a ser
  // o PDF, que agora reproduz o modelo. Este teste existe para o formato nao
  // voltar por acidente — e para quem procurar "xlsx" no repositorio achar a
  // decisao, e nao um buraco.
  const { ctx, conta } = await cenario()
  const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

  await expect(
    exportarPrestacao(ctx, prestacao.id, 'xlsx' as never)
  ).rejects.toThrow()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/exportar.test.ts`
Expected: FAIL — hoje `'xlsx'` é formato válido e a exportação resolve em vez de rejeitar.

- [ ] **Step 3: Tirar o `xlsx` do serviço**

Em `src/modules/financeiro/exportar.ts`:

```ts
export type FormatoExportacao = 'pdf' | 'csv'

const MIME: Record<FormatoExportacao, string> = {
  pdf: 'application/pdf',
  // `charset=utf-8` junto do BOM que o CSV já carrega: os dois dizem a mesma
  // coisa, e programas diferentes acreditam em um ou no outro.
  csv: 'text/csv; charset=utf-8',
}
```

Remova o import de `gerarXlsxPrestacao` e, em `gerarConteudo`, troque o par de ramos por:

```ts
  const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

  const folhas = await gerarPdfPrestacao(documento)
  const anexos = await anexosDaPrestacao(prestacao.id, documento.despesas)
  return await juntarAnexos(folhas, anexos, { prestacaoId: prestacao.id })
```

Acrescente ao comentário do topo do arquivo:

```ts
 * **A planilha saiu em 01/09/2026.** Ela reproduzia a geometria do modelo do
 * órgão e nunca a aparência dele — as bordas do original nunca foram
 * capturadas. Em vez de consertar dois renderizadores, o projeto passou a ter
 * um: o PDF, agora fiel. O CSV fica, porque atende outra pessoa (o contador,
 * que importa) e nunca passou pelo modelo.
```

- [ ] **Step 4: Tirar o `xlsx` da rota e da tela**

Em `src/app/api/prestacoes/[id]/[formato]/route.ts`:

```ts
const FORMATOS: FormatoExportacao[] = ['pdf', 'csv']
```

Em `src/app/(app)/financeiro/prestacoes/page.tsx`, apague o bloco `<Link>` cujo `href` termina em `/xlsx` e cujo texto é `Baixar .xlsx`. Os outros dois links ficam.

Em `tests/e2e/financeiro.spec.ts`, apague qualquer asserção que mencione `.xlsx` ou `Baixar .xlsx`.

- [ ] **Step 5: Apagar os arquivos e descer o `exceljs`**

```bash
git rm src/modules/financeiro/xlsx-prestacao.ts src/modules/financeiro/xlsx-prestacao.test.ts
```

Em `package.json`, mova `"exceljs"` de `dependencies` para `devDependencies` — o extrator (`scripts/extrair-layout-prestacao.ts`) ainda precisa dele para ler o modelo, mas o servidor não.

Run: `npm install`
Run: `npm run auditoria`

Se devolver `found 0 vulnerabilities`, tente remover `"uuid"` do bloco `overrides` (ele existia por causa do `exceljs`), rode `npm install` e `npm run auditoria` de novo. **Se voltar a acusar, devolva o override** e registre no relatório que ele ainda é necessário.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/`
Expected: PASS. O teste do Step 1 agora rejeita, e nenhum teste importa `xlsx-prestacao`.

Run: `npm run typecheck && npm run lint`
Expected: limpos.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove a exportacao em xlsx

A planilha reproduzia a geometria do modelo do orgao e nunca a aparencia: as
bordas do original nunca foram capturadas pelo extrator, entao faltavam nela e,
por tabela, no PDF. Em vez de consertar dois renderizadores, o projeto passa a
ter um.

O CSV fica: atende o contador, que importa o arquivo, e nunca passou pelo
modelo. O exceljs desce para devDependencies porque o extrator ainda precisa
dele para ler o .xlsx do orgao."
```

---

## Task 2: O extrator recolhe bordas, fontes, alinhamentos e alturas

**Files:**
- Modify: `scripts/extrair-layout-prestacao.ts`
- Modify: `src/modules/financeiro/layout-prestacao.ts` (regerado, não editado à mão)
- Modify: `src/modules/financeiro/layout-prestacao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: o tipo `LayoutFolha` ampliado, exportado de `layout-prestacao.ts`:

```ts
export type EstiloBorda = 'hair' | 'thin' | 'medium' | 'thick' | 'double'
export type LadosComBorda = { topo?: EstiloBorda; esquerda?: EstiloBorda; baixo?: EstiloBorda; direita?: EstiloBorda }
export type FonteCelula = { familia: string; tamanho: number; negrito: boolean; italico: boolean }
export type AlinhamentoCelula = { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'middle' | 'bottom'; quebra?: boolean }
export type MargensFolha = { esquerda: number; direita: number; topo: number; baixo: number }

export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  rotulos: Record<string, string>
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }
  alturas: { linha: number; altura: number }[]
  alturaPadrao: number
  bordas: Record<string, LadosComBorda>
  fontes: Record<string, FonteCelula>
  alinhamentos: Record<string, AlinhamentoCelula>
  margens: MargensFolha
}
```

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `src/modules/financeiro/layout-prestacao.test.ts`:

```ts
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
    // Medido no arquivo: todos os 1431 lados sao `thin`. Se um dia o orgao
    // revisar o modelo e trouxer outro estilo, este teste avisa — e o
    // renderizador ja sabe desenhar os outros.
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
```

E **estenda a barreira de dados que já existe** — o teste `não carrega documento de ninguém` continua como está, mas acrescente logo depois:

```ts
  it('os campos novos nao carregam texto de ninguem', () => {
    // A superficie do extrator cresceu: bordas, fontes e alinhamentos sao
    // Records com chave de celula. Nenhum deles pode conter texto livre — se
    // contiver, alguma coisa do exemplo preenchido vazou por um caminho novo.
    for (const folha of Object.values(LAYOUT)) {
      for (const lados of Object.values(folha.bordas)) {
        for (const estilo of Object.values(lados)) {
          expect(['hair', 'thin', 'medium', 'thick', 'double']).toContain(estilo)
        }
      }
      for (const fonte of Object.values(folha.fontes)) {
        expect(typeof fonte.tamanho).toBe('number')
        expect(fonte.familia.length).toBeLessThan(40)
      }
    }
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/layout-prestacao.test.ts`
Expected: FAIL — `folha.bordas` é `undefined`, o tipo nem tem o campo.

- [ ] **Step 3: Ampliar o extrator**

Em `scripts/extrair-layout-prestacao.ts`, acrescente as funções de coleta. Mantenha o critério que o comentário do topo já declara: **posição, nunca conteúdo**.

```ts
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

/** Polegada para ponto: o `pageSetup` do Excel mede margem em polegadas. */
function emPontos(polegadas: number | undefined, padrao: number): number {
  return (polegadas ?? padrao) * 72
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
```

Escreva `coletarFontes` e `coletarAlinhamentos` no mesmo formato — percorrendo até `ateColuna`, gravando por `celula.address`, e **sem tocar no valor da célula**. Para a fonte, grave `{ familia: f.name ?? 'Arial', tamanho: f.size ?? 10, negrito: Boolean(f.bold), italico: Boolean(f.italic) }`; para o alinhamento, os três campos do `celula.alignment` que a spec define.

Para as alturas:

```ts
function coletarAlturas(folha: ExcelJS.Worksheet): { linha: number; altura: number }[] {
  const alturas: { linha: number; altura: number }[] = []
  folha.eachRow({ includeEmpty: true }, (linha, n) => {
    if (linha.height) alturas.push({ linha: n, altura: linha.height })
  })
  return alturas
}
```

E acrescente ao objeto que o extrator emite por folha, junto de `merges`/`larguras`/`rotulos`:

```ts
    alturas: coletarAlturas(folha),
    alturaPadrao: folha.properties?.defaultRowHeight ?? 12.75,
    bordas: coletarBordas(folha, ultimaColuna),
    fontes: coletarFontes(folha, ultimaColuna),
    alinhamentos: coletarAlinhamentos(folha, ultimaColuna),
    margens: {
      esquerda: emPontos(folha.pageSetup?.margins?.left, 0.25),
      direita: emPontos(folha.pageSetup?.margins?.right, 0.25),
      topo: emPontos(folha.pageSetup?.margins?.top, 0.75),
      baixo: emPontos(folha.pageSetup?.margins?.bottom, 0.75),
    },
```

E limite a coleta de larguras a `ultimaColunaUsada`, em vez de `columnCount`.

- [ ] **Step 4: Regerar o layout**

Run: `npx tsx scripts/extrair-layout-prestacao.ts > src/modules/financeiro/layout-prestacao.ts`

**Leia o arquivo gerado antes de commitar.** É o passo que protege contra vazar dado — o `git diff` vai ser grande, mas confira que os `Record` novos só têm chave de célula e valores de estilo, sem texto solto.

Run: `npm run lint -- --fix src/modules/financeiro/layout-prestacao.ts` se o gerado não obedecer ao formatador.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/layout-prestacao.test.ts`
Expected: PASS, os sete testes novos e os sete que já existiam.

Se a contagem de 1.431 lados não bater, **não ajuste o número do teste**: descubra por que a coleta divergiu da medição. O número veio do arquivo.

- [ ] **Step 6: Commit**

```bash
git add scripts/extrair-layout-prestacao.ts src/modules/financeiro/layout-prestacao.ts src/modules/financeiro/layout-prestacao.test.ts
git commit -m "O extrator passa a recolher bordas, fontes, alinhamento e alturas

O layout tinha a geometria do modelo e nenhuma da aparencia dele. Sao 1431
lados com borda no arquivo do orgao que nunca foram capturados — e por isso
faltavam no documento entregue.

Recolhe ate a ultima coluna com conteudo ou borda, e nao ate o columnCount: o
ExcelJS relata ate 20 colunas, contando formatada e vazia, mas conteudo e
borda param na 12 nas seis folhas.

A barreira de dados cresceu junto: os Records novos so aceitam estilo conhecido
e nome de fonte curto, porque a superficie por onde algo do exemplo preenchido
poderia vazar aumentou."
```

---

## Task 3: O módulo puro de geometria

**Files:**
- Create: `src/modules/financeiro/grade-prestacao.ts`
- Test: `src/modules/financeiro/grade-prestacao.test.ts`

**Interfaces:**
- Consumes: `LAYOUT`, `LayoutFolha` de `./layout-prestacao`.
- Produces:

```ts
export type Caixa = { x: number; y: number; largura: number; altura: number }
export function larguraDaColuna(largura: number): number
export function xDaColuna(layout: LayoutFolha, coluna: number): number
export function yDaLinha(layout: LayoutFolha, linha: number): number
export function alturaDaLinha(layout: LayoutFolha, linha: number): number
export function faixaDe(layout: LayoutFolha, celula: string): string
export function caixaDa(layout: LayoutFolha, celula: string): Caixa
export function linhasQueCabem(layout: LayoutFolha, primeiraLinha: number, alturaLinha: number): number
export const ALTURA_PAGINA = 842
export const LARGURA_PAGINA = 595
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/modules/financeiro/grade-prestacao.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/grade-prestacao.test.ts`
Expected: FAIL — `Failed to resolve import "./grade-prestacao"`.

- [ ] **Step 3: Escrever o módulo**

Crie `src/modules/financeiro/grade-prestacao.ts`:

```ts
import type { LayoutFolha } from './layout-prestacao'

/**
 * A geometria da grade: onde cada célula do modelo cai na página.
 *
 * Módulo **puro**, como `faixas.ts`, `turno.ts` e `tendencia.ts`: sem pdfkit,
 * sem banco, sem leitura de arquivo. É aqui que mora a aritmética que decide
 * se o documento sai fiel, e regra assim precisa ser testável sozinha.
 */

export const LARGURA_PAGINA = 595
export const ALTURA_PAGINA = 842

export type Caixa = { x: number; y: number; largura: number; altura: number }

/**
 * Largura de coluna do Excel em pontos de PDF.
 *
 * O Excel mede em caracteres da fonte padrão; a fórmula do OOXML converte para
 * pixels a 96 DPI, e o PDF trabalha a 72. Para a largura 8,14 do modelo dá
 * 46,49 pt, e as doze colunas somam 557,8 pt contra 561 pt de largura útil —
 * a planilha foi desenhada para caber na A4, e esse encaixe é a confirmação de
 * que a conta está certa.
 */
export function larguraDaColuna(largura: number): number {
  return (largura * 7 + 5) * 0.75
}

/** Quebra "A11" em coluna 1 e linha 11. Só a faixa A..L nos interessa. */
function partesDa(celula: string): { coluna: number; linha: number } {
  const [, letras, digitos] = celula.match(/^([A-Z]+)(\d+)$/) ?? []
  if (!letras || !digitos) throw new Error(`Célula fora do formato: ${celula}`)
  let coluna = 0
  for (const letra of letras) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return { coluna, linha: Number(digitos) }
}

export function xDaColuna(layout: LayoutFolha, coluna: number): number {
  let x = layout.margens.esquerda
  for (const c of layout.larguras) {
    if (c.coluna >= coluna) break
    x += larguraDaColuna(c.largura)
  }
  return x
}

export function alturaDaLinha(layout: LayoutFolha, linha: number): number {
  return layout.alturas.find((a) => a.linha === linha)?.altura ?? layout.alturaPadrao
}

/**
 * O topo da linha, em coordenada de PDF.
 *
 * O `y` da planilha cresce para baixo e o do PDF para cima. A inversão fica
 * aqui, uma vez só: espalhá-la pelo renderizador produziria uma folha de
 * cabeça para baixo no dia em que alguém esquecesse de inverter.
 */
export function yDaLinha(layout: LayoutFolha, linha: number): number {
  let percorrido = 0
  for (let n = 1; n < linha; n++) percorrido += alturaDaLinha(layout, n)
  return ALTURA_PAGINA - layout.margens.topo - percorrido
}

/** A faixa mesclada que contém a célula, ou a própria célula. */
export function faixaDe(layout: LayoutFolha, celula: string): string {
  const alvo = partesDa(celula)
  for (const faixa of layout.merges) {
    const [inicio, fim] = faixa.split(':')
    const a = partesDa(inicio)
    const b = partesDa(fim)
    if (
      alvo.coluna >= a.coluna && alvo.coluna <= b.coluna &&
      alvo.linha >= a.linha && alvo.linha <= b.linha
    ) {
      return faixa
    }
  }
  return celula
}

/** A caixa da célula — ou da faixa mesclada que a contém. */
export function caixaDa(layout: LayoutFolha, celula: string): Caixa {
  const faixa = faixaDe(layout, celula)
  const [inicio, fim] = faixa.includes(':') ? faixa.split(':') : [faixa, faixa]
  const a = partesDa(inicio)
  const b = partesDa(fim)

  const x = xDaColuna(layout, a.coluna)
  const direita = xDaColuna(layout, b.coluna) + larguraDaColuna(
    layout.larguras.find((c) => c.coluna === b.coluna)?.largura ?? 0
  )

  const topo = yDaLinha(layout, a.linha)
  let altura = 0
  for (let n = a.linha; n <= b.linha; n++) altura += alturaDaLinha(layout, n)

  return { x, y: topo - altura, largura: direita - x, altura }
}

/**
 * Quantas linhas de altura fixa cabem entre `primeiraLinha` e o fim da página.
 *
 * É o que decide o transbordo: com sessenta despesas a folha vira três
 * páginas, e a conta de quantas cabem em cada uma mora aqui, longe do pdfkit.
 */
export function linhasQueCabem(
  layout: LayoutFolha,
  primeiraLinha: number,
  alturaLinha: number
): number {
  const disponivel = yDaLinha(layout, primeiraLinha) - layout.margens.baixo
  return Math.max(0, Math.floor(disponivel / alturaLinha))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/grade-prestacao.test.ts`
Expected: PASS, os nove testes.

**Se "nenhuma caixa das seis folhas sai da página" falhar, pare e relate.** Significa que a conversão diverge do modelo, e ajustar o teste esconderia o problema em vez de resolvê-lo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/grade-prestacao.ts src/modules/financeiro/grade-prestacao.test.ts
git commit -m "Acrescenta o modulo puro da geometria da grade

Converte o layout do modelo em caixas de pagina: largura de coluna do Excel em
pontos de PDF, altura de linha, inversao do eixo vertical, e a caixa de uma
faixa mesclada como uniao das celulas.

Puro de proposito, como faixas.ts e tendencia.ts: sem pdfkit, sem banco, sem
I/O. E a aritmetica que decide se o documento sai fiel, e ela precisa ser
testavel sozinha — nao por inspecao do PDF gerado, que esta maquina nem
consegue abrir como imagem.

A guarda de conjunto e que nenhuma caixa das seis folhas sai do papel."
```

---

## Task 4: O renderizador e as três folhas estáticas

Capa, Contra-Capa e Encerramento — as que não têm faixa de dados. Entrega o núcleo do desenho e três das seis folhas.

**Files:**
- Modify: `src/modules/financeiro/pdf-prestacao.ts`
- Test: `src/modules/financeiro/pdf-prestacao.test.ts`

**Interfaces:**
- Consumes: `caixaDa`, `faixaDe`, `larguraDaColuna`, `ALTURA_PAGINA` da Task 3; `LAYOUT` da Task 2.
- Produces: dentro de `pdf-prestacao.ts`, `desenharFolha(doc, layout, valores)` onde `valores: Record<string, string>` são as substituições da folha.

- [ ] **Step 1: Escrever os testes que falham**

Substitua o conteúdo de `src/modules/financeiro/pdf-prestacao.test.ts` pelos testes da grade, mantendo os auxiliares de documento de teste que ele já tem:

```ts
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
```

O arquivo **já tem** um extrator de texto chamado `extrairTexto` (linha 19) — use-o, não escreva outro. Ele existe porque `gerarPdfPrestacao` desliga a compressão em teste, e decodifica os pedaços hexa de cada array de texto.

Acrescente os dois auxiliares que faltam, mais o import do `pdf-lib` (`import { PDFDocument } from 'pdf-lib'`), que o arquivo ainda não tem. `contarSegmentos` conta operadores de traço no conteúdo do PDF, legível pelo mesmo motivo:

```ts
/** Conta operadores de desenho de linha no conteudo nao comprimido do PDF. */
function contarSegmentos(buffer: Buffer): number {
  return (buffer.toString('latin1').match(/\bS\b/g) ?? []).length
}

async function paginasDe(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}
```

Para `extrairTexto`, reaproveite o extrator de texto que o arquivo de teste já usa hoje — ele existe porque o PDF sai sem compressão em teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/pdf-prestacao.test.ts`
Expected: FAIL — a contagem de segmentos é muito menor que a de lados, porque o gerador atual não desenha grade nenhuma.

- [ ] **Step 3: Escrever o renderizador**

Em `src/modules/financeiro/pdf-prestacao.ts`, **substitua** as funções de página por um desenhador de folha. O documento passa a nascer sem margem, porque a margem é de cada folha e já está na caixa:

```ts
const ESPESSURA: Record<EstiloBorda, number> = {
  hair: 0.25,
  thin: 0.5,
  medium: 1,
  thick: 1.5,
  double: 0.5,
}

/**
 * As cinco tipografias do modelo mapeadas para as embutidas do PDF.
 *
 * Nenhum arquivo de fonte é embutido: Algerian e Calibri são do Windows, e
 * distribuí-las dentro de um documento é questão de licença antes de ser
 * técnica. Tamanho, peso e posição são preservados exatamente; só o desenho
 * das letras difere, e a §9 da spec registra o que isso custa.
 */
function fonteDoPdf(familia: string, negrito: boolean, italico: boolean): string {
  const serifada = familia === 'Times New Roman' || familia === 'Algerian'
  if (familia === 'Algerian') return 'Times-Bold'
  if (serifada) {
    if (negrito && italico) return 'Times-BoldItalic'
    if (negrito) return 'Times-Bold'
    if (italico) return 'Times-Italic'
    return 'Times-Roman'
  }
  if (negrito && italico) return 'Helvetica-BoldOblique'
  if (negrito) return 'Helvetica-Bold'
  if (italico) return 'Helvetica-Oblique'
  return 'Helvetica'
}

/**
 * Desenha uma folha do modelo: bordas primeiro, texto depois.
 *
 * Bordas antes de propósito — um texto desenhado antes ficaria por baixo da
 * linha da célula seguinte.
 */
function desenharFolha(
  doc: Doc,
  layout: LayoutFolha,
  valores: Record<string, string>
): void {
  for (const [celula, lados] of Object.entries(layout.bordas)) {
    // Só a âncora da faixa desenha: as células internas de um merge não têm
    // borda própria no documento impresso.
    if (faixaDe(layout, celula).split(':')[0] !== celula) continue
    const c = caixaDa(layout, celula)

    const segmentos: [number, number, number, number, EstiloBorda][] = []
    if (lados.topo) segmentos.push([c.x, c.y + c.altura, c.x + c.largura, c.y + c.altura, lados.topo])
    if (lados.baixo) segmentos.push([c.x, c.y, c.x + c.largura, c.y, lados.baixo])
    if (lados.esquerda) segmentos.push([c.x, c.y, c.x, c.y + c.altura, lados.esquerda])
    if (lados.direita) segmentos.push([c.x + c.largura, c.y, c.x + c.largura, c.y + c.altura, lados.direita])

    for (const [x1, y1, x2, y2, estilo] of segmentos) {
      doc.lineWidth(ESPESSURA[estilo])
        .moveTo(x1, ALTURA_PAGINA - y1)
        .lineTo(x2, ALTURA_PAGINA - y2)
        .stroke()
    }
  }

  const textos = { ...layout.rotulos, ...valores }
  for (const [celula, texto] of Object.entries(textos)) {
    if (!texto) continue
    const c = caixaDa(layout, celula)
    const fonte = layout.fontes[celula]
    const alinhamento = layout.alinhamentos[celula]

    // Texto que não cabe: quebra em linhas quando a célula do modelo diz
    // `quebra`, e senão é truncado com reticências.
    //
    // A §5 da spec diz "reduzido até caber ou quebrado", e reduzir foi
    // descartado aqui de propósito: encolher a fonte de uma célula a deixaria
    // num tamanho que nenhuma vizinha tem, quebrando justamente a hierarquia
    // tipográfica que esta mudança existe para reproduzir. Truncar é honesto —
    // e a reticência aparece, então quem confere vê que faltou espaço, em vez
    // de ler um texto silenciosamente menor.
    doc
      .font(fonteDoPdf(fonte?.familia ?? 'Arial', fonte?.negrito ?? false, fonte?.italico ?? false))
      .fontSize(fonte?.tamanho ?? 10)
      .text(texto, c.x + 2, ALTURA_PAGINA - c.y - c.altura + 2, {
        width: c.largura - 4,
        height: c.altura,
        align: alinhamento?.horizontal ?? 'left',
        lineBreak: alinhamento?.quebra ?? false,
        ellipsis: true,
      })
  }
}
```

**Registre essa divergência no relatório da tarefa**, para a revisão julgar: a spec previa reduzir a fonte, e a implementação trunca.

E, em `gerarPdfPrestacao`, troque `margin: MARGEM` por `margin: 0` — a margem agora é da folha, não do documento — e monte as três folhas estáticas chamando `desenharFolha` com os valores que as funções antigas já sabiam montar (razão social em A1, CNPJ e endereço em A3, mês em A23, e assim por diante, exatamente como `montarCapa` do `xlsx-prestacao.ts` fazia antes de ser apagado — recupere esses mapeamentos de `git show 564bdc5^:src/modules/financeiro/xlsx-prestacao.ts`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/pdf-prestacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/pdf-prestacao.ts src/modules/financeiro/pdf-prestacao.test.ts
git commit -m "Desenha a grade do modelo nas tres folhas estaticas

Capa, contra-capa e encerramento passam a ser a grade do modelo: cada rotulo
na caixa da sua celula, com a fonte, o tamanho e o alinhamento que o original
tem, e as bordas desenhadas antes do texto para nenhuma letra ficar por baixo
de uma linha.

Cinco tipografias mapeadas para as embutidas do PDF, sem embutir arquivo:
Algerian vira Times negrito. Tamanho, peso e posicao sao preservados; so o
desenho das letras difere.

O documento nasce sem margem, porque a margem e de cada folha e ja esta na
caixa que o modulo de geometria devolve."
```

---

## Task 5: Despesas e Receitas, com transbordo

**Files:**
- Modify: `src/modules/financeiro/pdf-prestacao.ts`
- Test: `src/modules/financeiro/pdf-prestacao.test.ts`

**Interfaces:**
- Consumes: `desenharFolha` da Task 4; `linhasQueCabem` da Task 3.
- Produces: `desenharFolhaDeLancamentos(doc, layout, documento, linhas)`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
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
```

Acrescente o auxiliar `documentoCom(n)`, que devolve um `DocumentoPrestacao` com `n` linhas de despesa, reaproveitando o `despesaDeTeste` que `tests/helpers/documento-prestacao.ts` já expõe.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/pdf-prestacao.test.ts -t "que crescem"`
Expected: FAIL — as folhas de lançamento ainda não existem no renderizador novo.

- [ ] **Step 3: Escrever o desenhador das folhas que crescem**

```ts
/**
 * Uma folha cuja faixa de dados cresce com o volume — despesas e receitas.
 *
 * **Nunca encolhe abaixo do modelo.** Um mês com três lançamentos imprime as
 * vinte e duas linhas, as demais em branco com suas bordas: é o que o órgão
 * está acostumado a receber, e a regra vem do gerador da planilha que saiu.
 *
 * **Transborda repetindo o cabeçalho.** Quando a próxima linha não cabe, abre
 * página e redesenha as linhas 1 a 10 da folha — as que trazem "Item, Credor,
 * CNPJ/CPF, Data, Valor". Sem isso, quem folheia a página 4 não sabe que
 * coluna está lendo. O rodapé com total e assinaturas sai só na última.
 */
function desenharFolhaDeLancamentos(
  doc: Doc,
  layout: LayoutFolha,
  documento: DocumentoPrestacao,
  linhas: { descricao: string; documento: string; data: Date; valor: number }[]
): void {
  const { primeiraLinha, ultimaLinha } = layout.faixaDados!
  const doModelo = ultimaLinha - primeiraLinha + 1
  const usadas = Math.max(linhas.length, doModelo)
  const alturaLinha = alturaDaLinha(layout, primeiraLinha)
  const porPagina = Math.min(doModelo, linhasQueCabem(layout, primeiraLinha, alturaLinha))

  for (let inicio = 0; inicio < usadas; inicio += porPagina) {
    if (inicio > 0) doc.addPage()

    // O cabeçalho da folha, repetido em toda página.
    desenharFolha(doc, cabecalhoDaFolha(layout), valoresDoCabecalho(documento))

    const fatia = linhas.slice(inicio, inicio + porPagina)
    fatia.forEach((linha, i) => desenharLinhaDeDado(doc, layout, primeiraLinha + i, linha))

    const ultimaFatia = inicio + porPagina >= usadas
    if (ultimaFatia) desenharRodape(doc, layout, documento, linhas)
  }
}
```

Escreva `cabecalhoDaFolha` (recorta o layout às linhas 1 a `primeiraLinha - 1`), `valoresDoCabecalho` (órgão destinatário em A1, razão social em A6), `desenharLinhaDeDado` (item, credor, documento, data e valor nas colunas que o modelo usa) e `desenharRodape` (total, "Unidade Executora" e as duas assinaturas), recuperando as posições exatas de `git show 564bdc5^:src/modules/financeiro/xlsx-prestacao.ts`, que as tinha resolvido.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/pdf-prestacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/pdf-prestacao.ts src/modules/financeiro/pdf-prestacao.test.ts
git commit -m "Desenha despesas e receitas, com transbordo

A faixa de dados cresce com o volume e nunca encolhe abaixo do modelo: tres
lancamentos ainda imprimem as vinte e duas linhas, em branco com suas bordas,
que e o que o orgao esta acostumado a receber.

Quando a proxima linha nao cabe, abre pagina e redesenha o cabecalho da folha.
Quem folheia a pagina 4 precisa saber que coluna esta lendo. O rodape com
total e assinaturas sai so na ultima."
```

---

## Task 6: A conciliação

A folha composta — as linhas dela dependem de quantas origens de receita e quantas despesas a competência teve.

**Files:**
- Modify: `src/modules/financeiro/pdf-prestacao.ts`
- Test: `src/modules/financeiro/pdf-prestacao.test.ts`

**Interfaces:**
- Consumes: `desenharFolha` da Task 4, `caixaDa` da Task 3.
- Produces: nada que tarefa posterior consuma.

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('a conciliacao', () => {
  it('empilha saldo, recebimentos por origem, despesas e os totais', async () => {
    const texto = extrairTexto(await gerarPdfPrestacao(documentoDeTeste()))

    expect(texto).toContain('Saldo Anterior')
    expect(texto).toContain('Total de Saldo + Receitas')
    expect(texto).toContain('Total de Despesas')
    expect(texto).toContain('Saldo Disponível')
  })

  it('nao imprime as categorias do exemplo preenchido', async () => {
    // O layout extraido traz, da linha 24 em diante, as categorias de outra
    // prestacao — "Salario", "Diaria", "Taxa bancaria". Sao genericas, entao
    // passaram pela barreira de CPF/CNPJ, mas continuam sendo conteudo alheio.
    // A conciliacao e composta, nunca copiada.
    const texto = extrairTexto(await gerarPdfPrestacao(documentoDeTeste()))

    expect(texto).not.toContain('Servico reforma cozinha')
    expect(texto).not.toContain('Peça para conserto')
  })

  it('assina na ordem inversa das folhas de lancamento', async () => {
    // Tesoureiro a esquerda, presidente a direita: e como o modelo faz, e o
    // documento entregue precisa parecer com o que o orgao espera.
    const texto = extrairTexto(await gerarPdfPrestacao(documentoDeTeste()))
    expect(texto.indexOf('Tesoureiro')).toBeLessThan(texto.lastIndexOf('Presidente'))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/pdf-prestacao.test.ts -t "conciliacao"`
Expected: FAIL — a folha ainda não é desenhada.

- [ ] **Step 3: Escrever a conciliação**

Desenhe o cabeçalho da folha (linhas 1 a 12) com `desenharFolha`, e depois empilhe as linhas dinâmicas a partir da 13, na ordem que a `montarConciliacao` do `xlsx-prestacao.ts` estabelecia — recupere-a de `git show 564bdc5^:src/modules/financeiro/xlsx-prestacao.ts`, que resolveu essa ordem célula a célula:

saldo anterior, `(+) Recebimentos`, uma linha por origem, `Total de Saldo + Receitas`, `( - ) Despesas`, o cabeçalho `Credor | Categoria`, uma linha por despesa, `Total de Despesas`, `Saldo Disponível`, `Unidade Executora` e as assinaturas invertidas.

Cada linha usa a caixa da célula correspondente e a borda que o layout declara para ela; as que passarem da última linha do modelo herdam a borda da última linha de dados.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/`
Expected: PASS, o módulo inteiro.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/pdf-prestacao.ts src/modules/financeiro/pdf-prestacao.test.ts
git commit -m "Desenha a folha de conciliacao, composta e nao copiada

As linhas dependem de quantas origens de receita e quantas despesas a
competencia teve, entao a posicao de cada uma e calculada pelo volume. So os
rotulos legitimos do modelo sao reaproveitados: as categorias que o layout
extraido carrega da linha 24 em diante sao de outra prestacao e nunca sao
impressas.

Assina na ordem inversa das folhas de lancamento — tesoureiro a esquerda,
presidente a direita — porque e como o modelo faz."
```

---

## Task 7: O apêndice, a documentação e as pendências

**Files:**
- Modify: `src/modules/financeiro/anexos-prestacao.test.ts`
- Modify: `docs/operacao/pendencias-fase-3.md`
- Modify: `README.md`
- Modify: `tests/e2e/financeiro.spec.ts`

**Interfaces:**
- Consumes: tudo o que veio antes.
- Produces: nada.

- [ ] **Step 1: A base do apêndice deixa de ter seis páginas fixas**

Em `src/modules/financeiro/anexos-prestacao.test.ts`, o teste "sem anexo nenhum, devolve exatamente as folhas de entrada" usa um `base` fabricado com o `pdfkit` — ele continua válido e não muda.

Mas em `src/modules/financeiro/exportar.test.ts`, qualquer teste que crave seis páginas para a base precisa passar a **medir a base antes**, porque o volume de lançamentos agora muda a contagem:

```ts
// A base deixou de ter seis paginas fixas: com o PDF fiel ao modelo, a folha
// de despesas transborda conforme o volume. Medir antes e a unica conta que
// continua valendo com qualquer numero de lancamentos.
const antes = (await PDFDocument.load(semAnexo.buffer)).getPageCount()
```

Run: `npx vitest run src/modules/financeiro/`
Expected: PASS.

- [ ] **Step 2: As pendências**

Em `docs/operacao/pendencias-fase-3.md`, marque os itens 1 e 2 como **resolvidos por eliminação** na tabela de estado, e reescreva as seções deles:

O item 1 ("A fidelidade do `.xlsx` só se confirma abrindo os dois lado a lado") perde o objeto: não há mais `.xlsx`. A seção passa a registrar que a pergunta migrou para o PDF, que agora reproduz o modelo, e que a conferência visual continua sendo humana.

O item 2 ("O PDF não é pixel a pixel igual ao `.xlsx`") perde o objeto pelo mesmo motivo, e a seção registra que a decisão de não embarcar um conversor de 400 MB continua valendo — a fidelidade veio de reproduzir a grade, não de converter.

Acrescente o item 9:

```markdown
| 9. As letras do PDF não são as do modelo | aberto, deliberado | se o órgão recusar por isso |
```

E a seção:

```markdown
## 9. As letras do PDF não são as do modelo

**Situação:** o modelo do órgão usa cinco tipografias — Algerian 16 no título
da capa, Times New Roman 10, Arial 10/11/14 e Calibri 12. O PDF gerado mapeia
todas para as fontes embutidas do formato: Arial e Calibri viram Helvetica,
Times New Roman vira Times, e o Algerian do título vira Times negrito.

**Qual é a exposição:** tamanho, peso, posição, alinhamento e as bordas são
idênticos ao modelo; só o desenho das letras difere. Quem comparar lado a lado
vê o mesmo documento com o título em outra letra.

**Por que ficou assim:** embutir as originais exige os arquivos `.ttf` de
Algerian e Calibri e o direito de distribuí-los dentro de um documento. As duas
vêm do Windows, e a licença não é obviamente permissiva. Foi decisão do dono do
projeto, com a alternativa na mesa.

**O que fazer, se o órgão recusar:** obter os arquivos e confirmar o direito de
embuti-los. O renderizador aceita a troca sem mudança estrutural — o layout já
guarda o nome original de cada fonte, e só o mapeamento em `fonteDoPdf` muda.
```

- [ ] **Step 3: O README**

No parágrafo que descreve a exportação da prestação, troque a menção às três saídas por duas: **PDF** (o documento entregue ao órgão, que reproduz o modelo dele, com os anexos comprobatórios no apêndice) e **CSV** (a listagem plana que o contador importa). Diga que o `.xlsx` saiu em 01/09/2026 e por quê, numa frase.

- [ ] **Step 4: A suíte inteira**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: tudo verde.

Run: `taskkill //F //IM node.exe //T; taskkill //F //IM chrome.exe //T`
Run: `npx playwright test --project=autenticado --reporter=line`
Expected: PASS.

Run: `taskkill //F //IM node.exe //T; taskkill //F //IM chrome.exe //T`
Run: `npx playwright test --project=saude --project=administrativo --project=anonimo --reporter=line`
Expected: PASS.

Run: `npm run auditoria`
Expected: `found 0 vulnerabilities`.

- [ ] **Step 5: Gerar um PDF para a conferência humana**

Gere um PDF de uma prestação real e **entregue o arquivo**, porque a conferência visual contra `docs/convenio/Modelo Prestacao Contas.pdf` não pode ser feita por você — não há `poppler` nesta máquina.

Escreva um spec temporário em `tests/e2e/` que crie uma prestação com algumas despesas, anexe nada, baixe `/api/prestacoes/<id>/pdf` e grave o arquivo num diretório temporário. Rode-o, relate o caminho do arquivo e a contagem de páginas, e **apague o spec depois**. Limpe também o que ele criar no banco — conta, categoria, fornecedor, lançamentos e prestação.

- [ ] **Step 6: Commit e merge**

```bash
git add -A
git commit -m "Fecha o PDF fiel: apendice, pendencias e README

Os itens 1 e 2 da Fase 3 morrem por eliminacao — nao ha mais .xlsx para
conferir contra o modelo, nem para o PDF divergir. Nasce o item 9: as letras
do PDF nao sao as do modelo, por decisao, com o caminho de volta escrito.

A base do apendice deixou de ter seis paginas fixas, porque a folha de
despesas transborda conforme o volume."

git checkout master
git merge --no-ff pdf-fiel-ao-modelo -m "Merge branch 'pdf-fiel-ao-modelo'"
```

Não empurre. O push é sempre pedido antes.

---

## Verificação final

Com a saída de cada comando à vista:

- [ ] `npm run typecheck` — limpo
- [ ] `npm run lint` — limpo
- [ ] `npx vitest run` — todos passando
- [ ] `npx playwright test --project=autenticado` — passando
- [ ] `npx playwright test --project=saude --project=administrativo --project=anonimo` — passando
- [ ] `npm run auditoria` — `found 0 vulnerabilities`
- [ ] `/api/prestacoes/<id>/xlsx` devolve 404
- [ ] Nenhuma caixa das seis folhas sai da página
- [ ] O PDF gerado foi entregue para a conferência visual humana
