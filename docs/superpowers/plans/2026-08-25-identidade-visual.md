# Identidade visual — Plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** que o sistema pareça o Lar Dona Francisca e seja legível no celular do corredor, sem perder a densidade que o desktop precisa.

**Arquitetura:** a mudança é quase toda de **valor de token**, não de markup. Os 26 tokens semânticos e o `@theme inline` já existem; trocar os valores repinta as 31 telas sem tocá-las. A densidade por dispositivo sai de **uma** regra: o `font-size` da raiz muda no breakpoint, e toda a escala em `rem` acompanha. Os primitivos (`Botao`, `Cartao`, `Etiqueta`) entram depois, com uma guarda de teste que força a adoção completa.

**Tech Stack:** Next.js 15.5 (App Router), Tailwind CSS 4.3, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-identidade-visual-design.md`

## Restrições globais

- **Contraste:** todo par texto/fundo ≥ 4,5:1 nos dois temas. `--cor-tenue` é a única exceção nominal (setinha decorativa, `aria-hidden`), e ainda assim ≥ 1,5:1.
- **Componente:** botão e controle ≥ 3:1 contra o fundo adjacente (WCAG 1.4.11).
- **Cor crua proibida:** `bg-white`, `text-slate-*` e família reprovam em `tests/tema.test.ts`. Todo valor novo entra como token em `src/app/globals.css`.
- **Os três blocos do tema são espelhados:** `:root`, `@media (prefers-color-scheme: dark) :root:not([data-tema="claro"])` e `:root[data-tema="escuro"]`. Os dois escuros repetem os mesmos literais de propósito, e há teste que falha se divergirem.
- **Idioma:** interface e mensagens em pt-BR.
- **Comandos:** unidade `npx dotenv -e .env.test -- vitest run <arquivo>`; E2E `npx playwright test <arquivo>`; `npx tsc --noEmit` e `npx eslint` limpos antes de cada commit.
- **Escopo:** este plano cobre as **etapas 1 e 2** da spec. A etapa 3 (logo, nome, favicon) depende dos arquivos vetoriais da marca, que ainda não chegaram, e terá plano próprio.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/globals.css` | Modificado. Valores dos 26 tokens, token novo `--cor-detalhe`, escala tipográfica, `font-size` da raiz por breakpoint |
| `src/components/icones.tsx` | Criado. Os ~15 ícones Lucide, copiados à mão |
| `src/components/ui/botao.tsx` | Criado. O primitivo de ação |
| `src/components/ui/cartao.tsx` | Criado. Superfície e cabeçalho de seção |
| `src/components/ui/etiqueta.tsx` | Criado. Estado curto (aberta, fechada, atrasada) |
| `tests/tema.test.ts` | Modificado. Guarda nova contra `<button` cru |
| `tests/e2e/aparencia.spec.ts` | Criado. Fonte aplicada, alvo de toque, densidade |

---

### Task 1: A fonte volta a ser a Geist

**Files:**
- Modify: `src/app/globals.css` (regra `body`)
- Test: `tests/e2e/aparencia.spec.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: nada em código. Estabelece `tests/e2e/aparencia.spec.ts`, que as tarefas 3 e 4 estendem.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/e2e/aparencia.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a interface usa a Geist, e não a Arial de sobra do template', async ({ page }) => {
  // O `layout.tsx` baixa a Geist pelo `next/font` desde o primeiro commit, e o
  // `globals.css` a expõe como `--font-sans`. Um `font-family: Arial` no `body`
  // — sobra do template do Next — descartava tudo isso: o sistema pagava o
  // download e renderizava em Arial.
  await page.goto('/login')

  const familia = await page
    .locator('body')
    .evaluate((el) => getComputedStyle(el).fontFamily)

  expect(familia).toMatch(/geist/i)
  expect(familia).not.toMatch(/arial/i)
})
```

Registrar o arquivo no projeto anônimo do Playwright. Em `playwright.config.ts`, o projeto `autenticado` tem `testIgnore` e o `anonimo` tem `testMatch`; acrescentar `aparencia\.spec\.ts` aos dois, como já foi feito para `tema.spec.ts` e `saude-do-sistema.spec.ts`.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test aparencia.spec.ts`
Expected: FAIL — `expect(received).toMatch(/geist/i)` recebendo `Arial, Helvetica, sans-serif`.

- [ ] **Passo 3: Implementação mínima**

Em `src/app/globals.css`, na regra `body`, trocar a linha do `font-family`:

```css
body {
  background: var(--cor-fundo);
  color: var(--cor-forte);
  /* A Geist já é carregada pelo `next/font` em `src/app/layout.tsx` e exposta
     como `--font-sans` no `@theme inline` acima. A linha que estava aqui fixava
     Arial e descartava as duas coisas — o sistema pagava o download da fonte e
     renderizava com a de sistema. Era sobra do template inicial do Next. */
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx playwright test aparencia.spec.ts`
Expected: PASS

- [ ] **Passo 5: Commitar**

```bash
git add src/app/globals.css tests/e2e/aparencia.spec.ts playwright.config.ts
git commit -m "Faz a interface usar a Geist que ja era baixada"
```

---

### Task 2: A escala tipográfica e a densidade por dispositivo

**Files:**
- Modify: `src/app/globals.css` (bloco `@theme inline`, regra nova de `:root`)
- Test: `tests/e2e/aparencia.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: as classes `text-titulo`, `text-secao`, `text-corpo`, `text-suporte` e `text-legenda`, usadas pelas tarefas 6, 7 e 8.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/e2e/aparencia.spec.ts`:

```ts
test('o texto corrente tem 16px no celular e 15px no desktop', async ({ page }) => {
  // Densidade por dispositivo, em uma regra só: o `font-size` da raiz muda no
  // breakpoint e toda a escala em `rem` acompanha. É o que concilia "legível em
  // pé no corredor" com a tabela densa que a §9 do design-mãe promete a quem
  // confere duzentos lançamentos.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  const celular = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(celular).toBe('16px')

  await page.setViewportSize({ width: 1280, height: 800 })
  const desktop = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(desktop).toBe('15px')
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test aparencia.spec.ts -g "texto corrente"`
Expected: FAIL — os dois retornam `16px`, porque nada define o tamanho da raiz.

- [ ] **Passo 3: Implementação mínima**

Em `src/app/globals.css`, acrescentar os degraus dentro do `@theme inline` que já existe, logo antes das linhas de `--font-*`:

```css
  /* Cinco degraus, pelo mesmo motivo que a cor de texto tem cinco: o que não
     tem nome vira decisão repetida em cada tela. Antes disto, `text-sm`
     aparecia 155 vezes e `text-lg` 26 — a tela inteira falava no mesmo tom.
     Em `rem` de propósito: é o que faz a densidade por dispositivo caber numa
     regra só. */
  --text-titulo: 1.5rem;
  --text-titulo--line-height: 2rem;
  --text-secao: 1.125rem;
  --text-secao--line-height: 1.75rem;
  --text-corpo: 1rem;
  --text-corpo--line-height: 1.5rem;
  /* `suporte`, e nao `apoio`: `--color-apoio` ja existe e gera a mesma classe
     utilitaria `text-apoio`. A cor venceria e o degrau de tamanho nasceria
     morto — conferido compilando o CSS. */
  --text-suporte: 0.875rem;
  --text-suporte--line-height: 1.25rem;
  --text-legenda: 0.75rem;
  --text-legenda--line-height: 1rem;
```

E, logo depois do bloco `@theme inline`, a regra da raiz:

```css
/**
 * A densidade do sistema inteiro, em duas linhas.
 *
 * Toda medida da escala é `rem`, então mudar o tamanho da raiz reescala texto,
 * espaçamento e alvo de toque de uma vez. No celular a raiz fica em 16px — o
 * tamanho que se lê em pé, no corredor, com o aparelho na mão. A partir de
 * 640px cai para 15px, o que devolve à tabela de auditoria e à de lançamentos
 * a densidade que a §9 do design promete a quem confere duzentas linhas.
 *
 * Fazer isso por breakpoint, e não por preferência da pessoa, é deliberado: um
 * seletor de densidade dobraria a matriz de teste visual (dois temas × duas
 * densidades) para resolver um problema que o dispositivo já responde.
 */
:root {
  font-size: 16px;
}

@media (min-width: 640px) {
  :root {
    font-size: 15px;
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx playwright test aparencia.spec.ts`
Expected: PASS (os dois testes)

- [ ] **Passo 5: Conferir que nada quebrou**

Run: `npx playwright test`
Expected: as 68 travessias passam. A mudança de `rem` afeta layout; se alguma asserção de posição quebrar, é sinal legítimo e precisa ser investigada, não silenciada.

- [ ] **Passo 6: Commitar**

```bash
git add src/app/globals.css tests/e2e/aparencia.spec.ts
git commit -m "Acrescenta a escala tipografica e a densidade por dispositivo"
```

---

### Task 3: A paleta da marca no tema claro

**Files:**
- Modify: `src/app/globals.css` (bloco `:root`)
- Test: `tests/tema.test.ts` (já existe; nenhuma alteração necessária)

**Interfaces:**
- Consumes: nada.
- Produces: os valores claros dos tokens, que a tarefa 4 espelha no escuro.

**Por que o teste não muda:** `tests/tema.test.ts` lê o `globals.css` como texto, extrai os pares `--cor-*: #rrggbb` e mede o contraste dos 26 pares reais. Trocar valores mantém o teste válido — ele passa a medir os novos. É o retorno do desenho que a spec do tema escuro escolheu.

- [ ] **Passo 1: Rodar o teste antes de mexer, para ter a linha de base**

Run: `npx dotenv -e .env.test -- vitest run tests/tema.test.ts`
Expected: PASS, 54 testes. Anote o número: ele não pode cair.

- [ ] **Passo 2: Trocar os valores no bloco `:root`**

Em `src/app/globals.css`, no bloco `:root`, substituir os valores abaixo. **Os demais tokens não mudam** — os treze semânticos (âmbar, vermelho, verde) ficam como estão, pelo motivo da §3 da spec.

```css
  /* Superfícies e bordas — neutro quente, derivado do creme #fdfaf7 da marca.
     A luminância de cada degrau é a mesma da família slate que estava aqui, e
     só a temperatura mudou: assim o ritmo visual que já funcionava sobrevive.
     Um cinza azulado ao lado do creme da marca lê como erro de impressão. */
  --cor-fundo: #fbfaf8;
  --cor-superficie: #ffffff;
  --cor-suave: #fbfaf8;
  --cor-realce: #f8f4f1;
  --cor-borda: #d9d3cc;
  --cor-borda-suave: #eae7e3;

  /* Texto. `forte` carrega a marca — é o marinho do telhado da logo, medido em
     #0b3e6f, com 10,86:1 sobre branco. Os quatro degraus abaixo dele recuam
     para o neutro quente: se o título fosse marinho e o corpo cinza-azulado, as
     duas temperaturas brigariam na mesma frase. */
  --cor-forte: #0b3e6f;
  --cor-firme: #463f39;
  --cor-medio: #5b524a;
  --cor-apoio: #7d7166;
  --cor-tenue: #aaa197;

  /* Ação: o azul da fita e do wordmark, medido em #165c99. Passa 6,94:1 sobre
     branco, então serve como texto e como fundo de botão sem ajuste — o que
     raramente acontece com cor de marca. */
  --cor-acao: #165c99;
  --cor-sobre-acao: #ffffff;
```

Acrescentar o token novo, logo depois de `--cor-sobre-acao`:

```css
  /* O dourado dos selos de categoria. **Só filete e anel** — nunca texto,
     nunca fundo de caixa. Ele reprova AA (2,64:1 a 3,04:1 sobre branco), a logo
     principal não o usa, e ao lado da família âmbar viraria a mesma cor para
     quem passa os olhos numa tela de plantão. Ver §3 da spec. */
  --cor-detalhe: #ae9050;
```

- [ ] **Passo 3: Expor o token novo a Tailwind**

No bloco `@theme inline`, ao lado das outras linhas `--color-*`:

```css
  --color-detalhe: var(--cor-detalhe);
```

- [ ] **Passo 4: Rodar o teste de contraste**

Run: `npx dotenv -e .env.test -- vitest run tests/tema.test.ts`
Expected: PASS, os mesmos 54. Os 26 pares do claro foram verificados na derivação e passam; se algum reprovar aqui, **é o teste que está certo** — ajuste o valor, não a asserção.

- [ ] **Passo 5: Commitar**

```bash
git add src/app/globals.css
git commit -m "Poe a paleta da marca no tema claro"
```

---

### Task 4: A paleta da marca no tema escuro

**Files:**
- Modify: `src/app/globals.css` (os **dois** blocos escuros)
- Test: `tests/tema.test.ts`

**Interfaces:**
- Consumes: os tokens da tarefa 3.
- Produces: nada além dos valores.

**A decisão que este passo aplica:** a logo tem creme e marinho. O tema claro ficou no lado creme; **o escuro fica no lado marinho**, com as superfícies tintadas de azul em vez de marrom. Cada tema fica fiel a uma metade da marca, em vez de o escuro virar sépia.

- [ ] **Passo 1: Trocar os valores nos dois blocos escuros**

Em `src/app/globals.css`, os blocos `@media (prefers-color-scheme: dark) :root:not([data-tema="claro"])` e `:root[data-tema="escuro"]` repetem os mesmos literais de propósito. **Aplicar as duas substituições, idênticas.**

```css
    /* Superfícies e bordas: mesma luminância de antes, com a tinta marinha da
       marca no lugar do slate. */
    --cor-fundo: #0e1823;
    --cor-superficie: #182a3c;
    --cor-suave: #1e3349;
    --cor-realce: #32567b;
    --cor-borda: #32567b;
    --cor-borda-suave: #27425e;

    /* Texto: os cinco degraus, levemente frios para assentar sobre o marinho. */
    --cor-forte: #f3f5f6;
    --cor-firme: #e4e8eb;
    --cor-medio: #cfd5da;
    --cor-apoio: #97a4b0;
    --cor-tenue: #647485;

    /* Ação: no escuro o botão deixa de inverter e passa a ser azul de marca,
       clareado. O valor tem de satisfazer DUAS regras que puxam para lados
       opostos — texto branco sobre ele ≥ 4,5:1 (WCAG 1.4.3) e o próprio botão
       ≥ 3:1 contra o fundo (WCAG 1.4.11, contraste de componente). A janela vai
       de #1d66af a #2175ca; #1f70c1 fica no meio, com 5,07:1 e 3,53:1. */
    --cor-acao: #1f70c1;
    --cor-sobre-acao: #ffffff;

    /* O dourado no escuro. Continua só filete e anel. */
    --cor-detalhe: #c0a670;
```

- [ ] **Passo 2: Rodar o teste de contraste**

Run: `npx dotenv -e .env.test -- vitest run tests/tema.test.ts`
Expected: PASS. Inclui o teste "os dois blocos escuros não divergem", que falha se você aplicar a substituição em só um deles.

- [ ] **Passo 3: Ver com os próprios olhos, nos dois temas**

Run: `npx playwright test tema.spec.ts`
Expected: PASS, 5 testes.

- [ ] **Passo 4: Conferir a suíte inteira**

Run: `npx playwright test`
Expected: 68 passam.

- [ ] **Passo 5: Commitar**

```bash
git add src/app/globals.css
git commit -m "Poe a paleta da marca no tema escuro"
```

---

### Task 5: Alvos de toque de 44px

**Files:**
- Modify: `src/app/globals.css` (camada base)
- Test: `tests/e2e/aparencia.spec.ts`

**Interfaces:**
- Consumes: a escala da tarefa 2.
- Produces: piso de altura para controles, do qual a tarefa 7 depende.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/e2e/aparencia.spec.ts`:

```ts
test('nenhum controle é menor que 44px no celular', async ({ page }) => {
  // 44px é o mínimo que a diretriz de toque recomenda, e aqui não é teoria:
  // quem usa este sistema o faz em pé, no corredor, com uma mão só e às vezes
  // com luva. Alvo pequeno vira toque errado, e toque errado num registro de
  // medicação é o pior tipo de erro que este sistema pode induzir.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  const pequenos: string[] = []
  for (const controle of await page.locator('button, a, select, input:not([type=hidden])').all()) {
    if (!(await controle.isVisible())) continue
    const caixa = await controle.boundingBox()
    if (caixa && caixa.height < 44) {
      pequenos.push(`${await controle.evaluate((el) => el.tagName)} ${caixa.height.toFixed(0)}px`)
    }
  }

  expect(pequenos, pequenos.join('\n')).toEqual([])
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test aparencia.spec.ts -g "44px"`
Expected: FAIL, listando os controles pequenos da tela de login.

- [ ] **Passo 3: Implementação mínima**

Em `src/app/globals.css`, na camada base que já existe (a mesma que fixa a cor da borda), acrescentar:

```css
  /**
   * Piso de toque. `2.75rem` e não `44px`: em `rem` ele acompanha a raiz, então
   * fica em 44px no celular e afrouxa para ~41px no desktop, onde o alvo é um
   * ponteiro e não um dedo.
   *
   * `min-height` e não `height`: o controle pode crescer com o conteúdo, e um
   * botão de duas linhas não deve ser espremido de volta.
   */
  button,
  select,
  input:not([type='hidden']),
  textarea {
    min-height: 2.75rem;
  }
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx playwright test aparencia.spec.ts`
Expected: PASS

Se um link (`<a>`) aparecer na lista de pequenos, ele precisa de `py-` suficiente na tela onde vive — link não recebe piso por regra base, porque link dentro de parágrafo não deve virar bloco de 44px. Ajuste a tela, não a regra.

- [ ] **Passo 5: Commitar**

```bash
git add src/app/globals.css tests/e2e/aparencia.spec.ts
git commit -m "Poe piso de 44px nos alvos de toque"
```

---

### Task 6: Os ícones

**Files:**
- Create: `src/components/icones.tsx`
- Test: `src/components/icones.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `export function Icone({ nome, className }: { nome: NomeIcone; className?: string }): JSX.Element` e `export type NomeIcone`, usados pelas tarefas 7 e 8.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/components/icones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CAMINHOS, type NomeIcone } from './icones'

describe('icones', () => {
  it('tem os quinze nomes que o sistema usa', () => {
    const esperados: NomeIcone[] = [
      'residente', 'prontuario', 'medicacao', 'turno', 'financeiro',
      'auditoria', 'funcionario', 'documento', 'alerta', 'sucesso',
      'erro', 'busca', 'voltar', 'sair', 'tema',
    ]
    expect(Object.keys(CAMINHOS).sort()).toEqual([...esperados].sort())
  })

  it('todo caminho é SVG válido e nenhum vem vazio', () => {
    // Um `d` vazio renderiza nada e não quebra: o ícone some da tela sem erro.
    // É o tipo de defeito que só aparece quando alguém pergunta "cadê o ícone".
    for (const [nome, caminho] of Object.entries(CAMINHOS)) {
      expect(caminho.length, `${nome} veio vazio`).toBeGreaterThan(10)
      expect(caminho, `${nome} não parece um path`).toMatch(/^[Mm]/)
    }
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.test -- vitest run src/components/icones.test.ts`
Expected: FAIL — `Failed to load url ./icones`.

- [ ] **Passo 3: Implementação mínima**

Criar `src/components/icones.tsx`. Os caminhos vêm do Lucide (https://lucide.dev), licença ISC. Copiar o `d` de cada ícone do site; a lista abaixo dá o ícone Lucide correspondente a cada nome do sistema:

| `NomeIcone` | Ícone Lucide |
|---|---|
| `residente` | `user-round` |
| `prontuario` | `clipboard-list` |
| `medicacao` | `pill` |
| `turno` | `clock` |
| `financeiro` | `wallet` |
| `auditoria` | `scroll-text` |
| `funcionario` | `users-round` |
| `documento` | `file-text` |
| `alerta` | `triangle-alert` |
| `sucesso` | `circle-check` |
| `erro` | `circle-x` |
| `busca` | `search` |
| `voltar` | `arrow-left` |
| `sair` | `log-out` |
| `tema` | `sun-moon` |

```tsx
/**
 * Os ícones do sistema, copiados à mão do Lucide (https://lucide.dev).
 *
 * Copyright (c) 2022 Lucide Contributors — licença ISC.
 *
 * **Copiados em vez de instalados**, num projeto que já é cuidadoso com cadeia
 * de suprimento: sem dependência nova, sem pergunta sobre o que ela arrasta
 * junto, sem pergunta de bundle — o que está aqui é o que vai para o navegador
 * —, e auditável, porque são caminhos SVG legíveis num arquivo.
 *
 * **Ícone nunca vai sozinho.** Ou acompanha rótulo em texto, ou recebe
 * `rotulo`, que vira `aria-label`. Ícone sem nome acessível é decoração que a
 * equipe de plantão precisa adivinhar — e adivinhar num plantão é o que este
 * sistema existe para evitar.
 */

export const CAMINHOS = {
  residente: 'M18 20a6 6 0 0 0-12 0M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  // … copiar o `d` de cada ícone da tabela acima
} as const

export type NomeIcone = keyof typeof CAMINHOS

export function Icone({
  nome,
  rotulo,
  className = 'size-5',
}: {
  nome: NomeIcone
  rotulo?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Sem rótulo, o ícone é decoração e sai da árvore de acessibilidade — o
      // texto ao lado já diz o que ele significa.
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx dotenv -e .env.test -- vitest run src/components/icones.test.ts`
Expected: PASS, 2 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/components/icones.tsx src/components/icones.test.ts
git commit -m "Acrescenta os icones, copiados do Lucide"
```

---

### Task 7: Os primitivos de interface

**Files:**
- Create: `src/components/ui/botao.tsx`, `src/components/ui/cartao.tsx`, `src/components/ui/etiqueta.tsx`
- Test: `tests/e2e/aparencia.spec.ts`

**Interfaces:**
- Consumes: `Icone` e `NomeIcone` da tarefa 6; as classes de escala da tarefa 2.
- Produces:
  - `Botao({ children, variante, tipo, icone, ...props }): JSX.Element` — `variante: 'primario' | 'secundario' | 'perigo'`, padrão `'primario'`; `tipo: 'submit' | 'button'`, padrão `'submit'`; `icone?: NomeIcone`. Repassa o resto para `<button>`.
  - `Cartao({ titulo, children, acao }): JSX.Element` — `titulo?: string`, `acao?: React.ReactNode`.
  - `Etiqueta({ children, tom }): JSX.Element` — `tom: 'neutro' | 'alerta' | 'sucesso' | 'perigo'`.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/e2e/aparencia.spec.ts`:

```ts
test('o botão primário usa a cor da marca e tem contraste de componente', async ({ page }) => {
  // Duas regras, e a segunda é a que costuma escapar: o texto sobre o botão
  // precisa de 4,5:1 (WCAG 1.4.3), e o próprio botão precisa de 3:1 contra o
  // fundo (WCAG 1.4.11). Um botão legível por dentro e invisível por fora
  // passa no primeiro e reprova no segundo.
  await page.goto('/login')
  const botao = page.getByRole('button', { name: 'Entrar' })

  const cores = await botao.evaluate((el) => ({
    fundo: getComputedStyle(el).backgroundColor,
    texto: getComputedStyle(el).color,
    pagina: getComputedStyle(document.body).backgroundColor,
  }))

  const lum = (cor: string) => {
    const [r, g, b] = (cor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const c = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
  }
  const razao = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  expect(razao(cores.texto, cores.fundo)).toBeGreaterThanOrEqual(4.5)
  expect(razao(cores.fundo, cores.pagina)).toBeGreaterThanOrEqual(3)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test aparencia.spec.ts -g "botão primário"`
Expected: FAIL no segundo `expect` — o botão de login hoje é `bg-acao` direto no markup, sem garantia de contraste de componente.

- [ ] **Passo 3: Criar os três primitivos**

`src/components/ui/botao.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { Icone, type NomeIcone } from '@/components/icones'

/**
 * O botão do sistema.
 *
 * Existe para que "como é um botão primário" tenha uma resposta só. Antes
 * disto, cada tela repetia `w-full rounded bg-acao py-2 text-sobre-acao` — e
 * repetição é onde a divergência entra sem ninguém decidir.
 *
 * `type="submit"` por padrão porque quase todo botão daqui está num formulário
 * com Server Action. O padrão do HTML já é esse; explicitá-lo evita que alguém
 * o troque por engano ao acrescentar um `onClick`.
 */
const VARIANTES = {
  primario: 'bg-acao text-sobre-acao hover:opacity-90',
  secundario: 'border border-borda bg-superficie text-firme hover:bg-realce',
  perigo: 'border border-perigo-borda bg-perigo-fundo text-perigo-forte hover:opacity-90',
} as const

export function Botao({
  children,
  variante = 'primario',
  tipo = 'submit',
  icone,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'type'> & {
  variante?: keyof typeof VARIANTES
  tipo?: 'submit' | 'button'
  icone?: NomeIcone
}) {
  return (
    <button
      type={tipo}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 text-suporte font-medium transition disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {icone && <Icone nome={icone} />}
      {children}
    </button>
  )
}
```

`src/components/ui/cartao.tsx`:

```tsx
/**
 * A superfície do sistema.
 *
 * `rounded-lg` e não `rounded`: o raio de 4px que estava em 103 lugares é o
 * padrão do Tailwind, não uma escolha — e lê como formulário de intranet.
 */
export function Cartao({
  titulo,
  acao,
  children,
}: {
  titulo?: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-secao font-semibold text-forte">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}
```

`src/components/ui/etiqueta.tsx`:

```tsx
/**
 * Estado curto: "aberta", "fechada", "atrasada", "sem registro".
 *
 * Os tons saem dos tokens semânticos que já existem — e o dourado não está
 * entre eles de propósito: ele é filete e anel, nunca estado. Ver §3 da spec.
 */
const TONS = {
  neutro: 'bg-realce text-firme',
  alerta: 'bg-alerta-realce text-alerta',
  sucesso: 'bg-sucesso-fundo text-sucesso-forte',
  perigo: 'bg-perigo-fundo text-perigo-forte',
} as const

export function Etiqueta({
  children,
  tom = 'neutro',
}: {
  children: React.ReactNode
  tom?: keyof typeof TONS
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-legenda font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}
```

- [ ] **Passo 4: Usar o `Botao` na tela de login**

Em `src/app/login/formulario.tsx`, trocar o `<button>` cru:

```tsx
<Botao disabled={enviando} className="w-full">
  {enviando ? 'Entrando…' : 'Entrar'}
</Botao>
```

E acrescentar o import: `import { Botao } from '@/components/ui/botao'`

- [ ] **Passo 5: Rodar e ver passar**

Run: `npx playwright test aparencia.spec.ts`
Expected: PASS

- [ ] **Passo 6: Commitar**

```bash
git add src/components/ui tests/e2e/aparencia.spec.ts src/app/login/formulario.tsx
git commit -m "Acrescenta os primitivos Botao, Cartao e Etiqueta"
```

---

### Task 8: A guarda que força a adoção, e a adoção

**Files:**
- Modify: `tests/tema.test.ts` (guarda nova)
- Modify: os `.tsx` de `src/app` e `src/components` que ainda usam `<button>` cru

**Interfaces:**
- Consumes: `Botao` da tarefa 7.
- Produces: nada. Fecha a etapa 2.

**Por que uma guarda, e não uma lista de arquivos:** a mesma razão que fez a guarda contra cor crua existir. Uma lista fica desatualizada no dia em que alguém cria a próxima tela; um teste que varre o diretório não fica.

- [ ] **Passo 1: Escrever a guarda que falha**

Acrescentar a `tests/tema.test.ts`, dentro do `describe('guarda contra cor crua')` ou num `describe` novo:

```ts
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
```

- [ ] **Passo 2: Rodar e ver falhar, com a lista do que falta**

Run: `npx dotenv -e .env.test -- vitest run tests/tema.test.ts -t "botão cru"`
Expected: FAIL, listando arquivo e linha de cada `<button>` restante. **Essa lista é a lista de trabalho do passo seguinte.**

- [ ] **Passo 3: Trocar cada um pelo primitivo**

Para cada linha da lista, substituir `<button type="submit" className="…">` por `<Botao>`, escolhendo a variante:

- ação principal do formulário → padrão (`primario`)
- "Cancelar", "Voltar", alternador → `variante="secundario"`
- "Excluir", "Desligar", "Suspender" → `variante="perigo"`

O botão de tema (`src/components/botao-tema.tsx`) usa `tipo="button"`, porque não está num formulário e um `submit` ali enviaria o formulário ao redor.

- [ ] **Passo 4: Rodar a guarda até ficar verde**

Run: `npx dotenv -e .env.test -- vitest run tests/tema.test.ts`
Expected: PASS

- [ ] **Passo 5: Conferir que nenhum fluxo quebrou**

Run: `npx playwright test`
Expected: 68 passam. Um `<Botao>` com `tipo` errado quebra o envio de formulário, e é aqui que isso aparece.

- [ ] **Passo 6: Rodar tudo antes de fechar**

```bash
npx tsc --noEmit && npx eslint && npm test
```
Expected: tsc e eslint limpos; os testes de unidade passam.

- [ ] **Passo 7: Commitar**

```bash
git add src tests
git commit -m "Adota o primitivo Botao em todas as telas, com guarda"
```

---

## Auto-revisão

**Cobertura da spec:**

| Seção da spec | Tarefa |
|---|---|
| §2 identidade medida | 3 e 4 (os valores) |
| §3 regra do dourado | 3 e 4 (`--cor-detalhe`), 7 (`Etiqueta` não o usa) |
| §4 paleta em tokens | 3 e 4 |
| §4.4 escuro medido, não derivado por regra | 4 |
| §5.1 Geist | 1 |
| §5.2 densidade por dispositivo | 2 |
| §5.2 escala tipográfica | 2 |
| §6 ícones | 6 |
| §7 etapa 1 | 1–5 |
| §7 etapa 2 | 6–8 |
| §7 etapa 3 | **fora deste plano** — depende dos vetores da marca |
| §9 alvo de toque | 5 |
| §9 densidade verificada | 2 |
| §9 contraste | 3 e 4, pelo teste que já existe |

**Lacuna consciente:** a spec (§9) pede um teste E2E que confira que a tabela de auditoria "continua mostrando o mesmo número de linhas por tela". A tarefa 2 verifica o `font-size` da raiz, que é a **causa** da densidade, e não a contagem de linhas — que depende do conteúdo do banco e tornaria o teste frágil. A troca é deliberada: verifica-se a regra, não o efeito que varia com o dado.

**Nomes conferidos entre tarefas:** `Icone`/`NomeIcone`/`CAMINHOS` (tarefa 6) são consumidos com esses nomes na 7. `Botao`/`variante`/`tipo` (tarefa 7) aparecem com esses nomes na 8. As classes `text-secao`, `text-suporte` e `text-legenda` (tarefa 2) são usadas nos primitivos da 7.
