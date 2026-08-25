# Tema escuro, acessível de qualquer página

**Data:** 2026-08-24
**Status:** Design aprovado, aguardando plano de implementação

## 1. Contexto e objetivo

O sistema tem hoje um tema só, claro. Cada superfície é declarada à mão na tela — `bg-white` no cartão, `text-slate-800` no título, `border-slate-300` no campo —, somando **421 usos de cor em 31 arquivos**, sobre **25 classes distintas**.

Um tema escuro pela metade já existiu aqui e foi removido (commit `ca240ab`). Ele vinha do template inicial do Next: pintava o `body` de quase branco quando o sistema operacional estava em modo escuro, mas nenhuma outra superfície reagia. Os campos, que não declaravam cor própria, herdavam texto quase branco sobre cartão branco — contraste de 1,17:1. Quem usava o sistema com o Windows em modo escuro não conseguia ler o que estava digitando no login. O comentário que substituiu aquele bloco no `globals.css` registra a conclusão: *"um tema escuro de verdade é trabalho de repintar cada superfície, e não de trocar duas variáveis que quase nada consulta"*.

Este documento descreve esse trabalho.

### Objetivo

Um tema escuro completo, alternável a partir de qualquer página do sistema, que não deixe nenhuma superfície para trás.

### Critérios de sucesso

- Em qualquer tela — inclusive login, erro e "não encontrado" — existe um controle visível para alternar o tema.
- A escolha sobrevive à navegação e ao recarregar, no mesmo aparelho.
- Quem nunca escolheu vê o sistema no tema do próprio sistema operacional.
- Nenhuma tela fica pela metade: não há superfície, borda ou campo que continue claro no tema escuro.
- Todo par texto/fundo do tema escuro atinge 4,5:1 (WCAG AA), com as exceções decorativas declaradas nominalmente.
- O tema claro sai **byte a byte igual ao de hoje**, com uma exceção intencional, descrita em §4.
- Tela nova nasce nos dois temas por construção: reintroduzir cor crua no código quebra o teste.

### Fora de escopo

Documentos gerados (PDF da prestação de contas, `.xlsx` do contador) continuam claros: são impressos ou abertos em outro programa, e não têm tema.

## 2. Abordagem

Três caminhos foram considerados:

| Caminho | Por que não |
|---|---|
| Variante `dark:` do Tailwind em cada classe | Dobra a sopa de classes e transfere para toda tela futura a obrigação de lembrar das duas metades. É exatamente o modo de falhar que o `globals.css` documenta: basta esquecer uma. |
| Componentes de superfície (`<Cartao>`, `<Texto>`) donos da cor | Melhor a longo prazo, mas é refatoração de UI muito maior que tema escuro — mexe na estrutura dos 31 arquivos, não só nas strings. |
| **Tokens semânticos** (escolhido) | As classes cruas viram papéis uma única vez. O tema escuro passa a ser um bloco que redefine 26 variáveis, e nenhuma tela é reescrita de novo. |

O custo do caminho escolhido é um diff grande e mecânico, de uma vez só. O risco é renomear sem pensar — `text-slate-500` aparece 96 vezes e nem sempre quer dizer a mesma coisa —, e por isso o mapa da §3 foi decidido classe por classe, a partir dos contextos reais de uso, antes de qualquer substituição automática.

## 3. O mapa de tokens

Cada valor da coluna "Claro" é a cor exata usada hoje. **Não há fusão de tons**: onde o código distingue `slate-600` de `slate-700`, os tokens também distinguem. O nome bruto é `--cor-*`; o `@theme inline` o expõe a Tailwind como `--color-*`, que gera as classes utilitárias.

O `@theme` precisa ser `inline`: sem isso, Tailwind resolve o valor da variável uma vez, no `:root`, e redefini-la num seletor aninhado não teria efeito nenhum. É a diferença entre um tema que troca e um tema que só parece trocar.

### 3.1 Superfícies e bordas

| Token | Classe | Claro | Escuro | Papel (usos hoje) |
|---|---|---|---|---|
| `--cor-fundo` | `bg-fundo` | `#f8fafc` slate-50 | `#0f172a` | Fundo da página, no `min-h-screen` (2) |
| `--cor-superficie` | `bg-superficie` | `#ffffff` white | `#1e293b` | Cartão e cabeçalho (55) |
| `--cor-suave` | `bg-suave` | `#f8fafc` slate-50 | `#334155` | Painel embutido e hover de linha (5) |
| `--cor-realce` | `bg-realce` | `#f1f5f9` slate-100 | `#475569` | Hover do item de navegação (1) |
| `--cor-borda` | `border-borda` | `#cbd5e1` slate-300 | `#475569` | Borda de campo e de cartão (28) |
| `--cor-borda-suave` | `border-borda-suave` | `#e2e8f0` slate-200 | `#334155` | Filete da linha do tempo (3) |

`fundo` e `suave` têm a mesma cor no claro e cores diferentes no escuro. Não é uma fusão desfeita: é a mesma cor cumprindo dois papéis. No claro, um painel slate-50 dentro de uma página slate-50 se distingue pela borda; no escuro, se os dois fossem iguais o painel desapareceria dentro da página.

### 3.2 Texto — cinco degraus

| Token | Classe | Claro | Escuro | Papel (usos hoje) |
|---|---|---|---|---|
| `--cor-forte` | `text-forte` | `#1e293b` slate-800 | `#f1f5f9` | Títulos, nomes, valores (101) |
| `--cor-firme` | `text-firme` | `#334155` slate-700 | `#e2e8f0` | Rótulo de campo, botão secundário (21) |
| `--cor-medio` | `text-medio` | `#475569` slate-600 | `#cbd5e1` | Link sublinhado, texto secundário (44) |
| `--cor-apoio` | `text-apoio` | `#64748b` slate-500 | `#94a3b8` | Legenda, "nenhum registro" (96) |
| `--cor-tenue` | `text-tenue` | `#94a3b8` slate-400 | `#64748b` | A setinha `›` das listas (2) |

### 3.3 Ação

| Token | Classe | Claro | Escuro | Papel (usos hoje) |
|---|---|---|---|---|
| `--cor-acao` | `bg-acao` | `#1e293b` slate-800 | `#e2e8f0` | Fundo do botão primário (10) |
| `--cor-sobre-acao` | `text-sobre-acao` | `#ffffff` white | `#0f172a` | Texto sobre o botão primário (10) |

O botão primário inverte no escuro. Se não invertesse, um botão slate-800 sobre uma página `#0f172a` seria quase invisível — este é o caso que mais justifica o token: a inversão acontece num lugar, não em dez.

### 3.4 Semânticos

| Token | Classe | Claro | Escuro | Papel |
|---|---|---|---|---|
| `--cor-alerta` | `text-alerta` | `#78350f` amber-900 | `#fde68a` amber-200 | Texto do aviso |
| `--cor-alerta-suave` | `text-alerta-suave` | `#92400e` amber-800 | `#fcd34d` amber-300 | Segunda linha do aviso |
| `--cor-alerta-fundo` | `bg-alerta-fundo` | `#fffbeb` amber-50 | `#422006` amber-950 | Caixa de aviso |
| `--cor-alerta-realce` | `bg-alerta-realce` | `#fef3c7` amber-100 | `#78350f` amber-900 | Etiqueta "aberta" da prestação |
| `--cor-alerta-borda` | `border-alerta-borda` | `#fcd34d` amber-300 | `#92400e` amber-800 | Borda da caixa de aviso |
| `--cor-alerta-borda-forte` | `border-alerta-borda-forte` | `#f59e0b` amber-500 | `#b45309` amber-700 | Filete do mapa do turno |
| `--cor-perigo` | `text-perigo` | `#dc2626` red-600 | `#f87171` red-400 | Erro, `*` de obrigatório |
| `--cor-perigo-forte` | `text-perigo-forte` | `#991b1b` red-800 | `#fca5a5` red-300 | Alerta clínico |
| `--cor-perigo-fundo` | `bg-perigo-fundo` | `#fef2f2` red-50 | `#450a0a` red-950 | Caixa de alerta clínico |
| `--cor-perigo-borda` | `border-perigo-borda` | `#ef4444` red-500 | `#b91c1c` red-700 | Borda do alerta clínico |
| `--cor-sucesso` | `text-sucesso` | `#15803d` green-700 | `#4ade80` green-400 | Confirmação |
| `--cor-sucesso-forte` | `text-sucesso-forte` | `#14532d` green-900 | `#86efac` green-300 | Etiqueta "fechada" |
| `--cor-sucesso-fundo` | `bg-sucesso-fundo` | `#dcfce7` green-100 | `#052e16` green-950 | Fundo da etiqueta "fechada" |

Os valores do escuro são um ponto de partida, medido pelo teste da §6.2. O que não atingir 4,5:1 é ajustado antes de fechar, e o ajuste vale para a tabela acima.

## 4. As bordas sem cor

Há ~75 lugares com `border`, `border-t`, `border-l-2` ou `divide-y` **sem classe de cor**: `rounded border bg-white p-4`, `mt-4 border-t pt-4`. No Tailwind v3 essas caíam em `gray-200`. No Tailwind v4 — confirmado na 4.3.3 instalada, cujo `preflight.css` não define mais um padrão para todos os elementos — elas caem no `currentColor` do CSS, ou seja, na cor do texto herdada.

Duas consequências:

1. **Hoje**, no claro, essas bordas saem quase pretas em vez do cinza discreto que o markup pretendia. É efeito colateral da migração para a v4, não decisão de design.
2. **No escuro**, elas virariam riscos claros e duros sobre superfície escura.

A correção é uma regra só, na camada base do `globals.css`, fixando a cor padrão da borda no token `--cor-borda` — o mesmo remendo que o guia de migração da v4 recomenda para quem quer o comportamento da v3. Ela resolve os ~75 lugares de uma vez, inclusive os `divide-y`, e continua sendo sobrescrita por qualquer `border-*` explícito.

**Esta é a única mudança visível no tema claro**: as bordas sem cor deixam de ser quase pretas e passam a ser slate-300. Está registrada aqui porque contraria o critério "byte a byte igual", e conscientemente.

## 5. A engrenagem

### 5.1 O CSS decide, em três blocos

```
:root                                         → tema claro
@media (prefers-color-scheme: dark)
  :root:not([data-tema="claro"])              → escuro para quem nunca escolheu
:root[data-tema="escuro"]                     → escuro para quem escolheu
```

A escolha explícita ganha do sistema operacional nos dois sentidos: quem está no Windows escuro e prefere claro fica no claro (`[data-tema="claro"]` desarma o `@media`), e quem está no Windows claro e prefere escuro fica no escuro. Quem nunca clicou herda o sistema. Nada disso precisa de JavaScript.

Cada bloco também declara `color-scheme` (`light` ou `dark`). Sem isso, o seletor nativo de data continua branco estourado dentro de uma tela escura — e este sistema usa `date` e `datetime-local` o tempo todo: prontuário, sinais vitais, lançamentos financeiros.

### 5.2 O cookie evita o pisca

Um cookie `tema`, com valor `claro` ou `escuro`, guarda a escolha por aparelho. Ausente significa "siga o sistema operacional".

O layout raiz o lê no servidor e emite `<html data-tema="escuro">` já na resposta. Como o atributo chega junto com o HTML, nunca existe o lampejo branco antes de escurecer que assombra as implementações baseadas em `localStorage`. Sem cookie, nenhum atributo é emitido, e o `@media` assume.

Guardar no aparelho, e não no usuário, foi escolha deliberada: funciona já na tela de login, onde ainda não há usuário; dispensa migração no banco; e num Lar onde a mesma estação é compartilhada entre plantões, o tema pertence mais à tela do corredor do que a quem está logado nela.

Ler cookie no layout raiz torna toda rota dinâmica. Não há perda aqui: o grupo `(app)` já é dinâmico por ler a sessão, e `/login` também.

### 5.3 O botão não depende de hidratação

O controle renderiza **os dois rótulos** — `☾ Escuro` e `☀ Claro` — e o mesmo CSS dos três blocos mostra exatamente um. Isso resolve um problema real: quando não há cookie, o servidor não tem como saber a preferência do sistema operacional, e qualquer rótulo escolhido em JavaScript daria divergência de hidratação ou um piscar do ícone na primeira pintura.

No clique — e só no clique, quando o navegador já sabe de tudo — o componente:

1. lê o tema efetivo (`data-tema` se houver, senão `matchMedia`);
2. escreve o oposto em `document.documentElement.dataset.tema`, o que troca o tema na hora, sem ida ao servidor;
3. grava o cookie (`path=/`, um ano, `SameSite=Lax`) para que o próximo SSR concorde com o que a pessoa está vendo.

O botão é `<button>` de verdade, com `aria-label` estável ("Alternar tema claro e escuro") — o rótulo visível muda com o CSS, mas o nome acessível não pisca junto. Como o rótulo visível é decidido por CSS, o texto oculto continua no DOM: os dois rótulos existem, e o escondido leva `aria-hidden` para não ser lido em voz alta.

### 5.4 Duas colocações cobrem tudo

| Onde | Cobre |
|---|---|
| Cabeçalho de `src/app/(app)/layout.tsx`, ao lado de "Sair" | Todas as telas autenticadas, mais `error.tsx` e `not-found.tsx`, que renderizam dentro desse layout |
| Canto do cartão de `src/app/login/formulario.tsx` | A tela de login, única rota fora do grupo `(app)` |

## 6. Como se verifica

### 6.1 Fluxo, no Playwright

`tests/e2e/tema.spec.ts`: alternar o tema na tela de login; entrar; conferir que `/residentes` continua escura depois de navegar entre abas; recarregar e conferir que continua; alternar de volta e conferir que voltou. As asserções olham `html[data-tema]` **e** a cor computada do fundo — a segunda é o que distingue "o atributo mudou" de "a tela mudou".

### 6.2 Contraste, no Vitest

Um teste sobre a própria tabela da §3: para cada par texto/fundo que o sistema realmente produz, calcular a razão de contraste WCAG e exigir 4,5:1 no tema escuro. Pares medidos: cada um dos cinco degraus de texto sobre `superficie` e sobre `fundo`; `sobre-acao` sobre `acao`; `alerta` e `alerta-suave` sobre `alerta-fundo`; `alerta` sobre `alerta-realce`; `perigo` sobre `superficie` e sobre `perigo-fundo`; `sucesso` sobre `superficie` e sobre `sucesso-fundo`.

Exceção declarada: `--cor-tenue` é a setinha `›` das listas, marcada `aria-hidden`, puramente decorativa. Fica registrada no teste como exceção nominal, e não como falha silenciada.

O mesmo teste mede o tema claro. Ele passa hoje, e serve de linha de base: se algum ajuste futuro rebaixar o claro, o teste avisa.

O teste não redeclara as cores: ele lê o `globals.css` como texto e extrai os pares `--cor-*: #rrggbb` de cada bloco. Uma tabela de cores duplicada em TypeScript passaria a medir a si mesma no dia em que o CSS mudasse sozinho. Assim há uma fonte só, e o que se mede é exatamente o que o navegador recebe.

### 6.3 Guarda contra cor crua

Um teste que varre `src/**/*.tsx` e falha ao encontrar `bg-white`, `text-slate-*`, `bg-amber-*` e companhia. É o "esquecer uma" — o defeito que o `globals.css` documenta — transformado em erro de teste em vez de confiança na memória de quem escreve a próxima tela.

## 7. Arquivos

| Arquivo | O que acontece |
|---|---|
| `src/app/globals.css` | Os 26 tokens em três blocos, o `@theme inline`, a regra base das bordas, `color-scheme`, e as regras de campo apontando para tokens |
| `src/lib/tema.ts` | Novo. Nome do cookie, tipo `Tema`, leitura e validação do valor |
| `src/app/layout.tsx` | Lê o cookie e emite `data-tema` no `<html>` |
| `src/components/botao-tema.tsx` | Novo. O controle, componente de cliente |
| `src/app/(app)/layout.tsx` | Recebe o botão, e é repintado |
| `src/app/login/formulario.tsx` | Recebe o botão, e é repintado |
| 29 outros `.tsx` | Repintados: as 26 classes cruas viram tokens |
| `tests/e2e/tema.spec.ts` | Novo. §6.1 |
| `tests/tema.test.ts` | Novo. §6.2 e §6.3 |

As regras de `input`, `select` e `textarea` no `globals.css` mantêm a intenção original — cor explícita, nunca herdada, para que o texto digitado nunca dependa do que o `body` faz — e passam a apontar para tokens. A segunda barreira continua de pé; a diferença é que agora ela escurece junto com o resto, em vez de ser o motivo de o texto sumir.
