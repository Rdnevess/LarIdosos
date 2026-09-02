# Dependências e vulnerabilidades

**O que este documento é:** o dono do número que o `npm audit` devolve. Até
31/08/2026 esse número não tinha dono — e por isso ele cresceu sem que ninguém
decidisse nada.

## Por que o documento existe

O único registro escrito sobre vulnerabilidade de dependência era o item 5 das
pendências da Fase 3, sobre a moderada do `uuid` herdada do `exceljs`. Ele não
escondia as outras: a última seção dele, "o que não confundir", nomeia
`next`, `postcss`, `sharp`, `prisma`, `@prisma/config` e `deepmerge-ts` — mas as
nomeia **para dizer que não eram culpa da Fase 3**. Era uma nota de defesa, e
não um inventário. Nenhum documento respondia "quantas são, quais chegam ao
servidor, e o que se faz com elas".

Em 31/08/2026 a resposta era: **13 vulnerabilidades — 1 crítica, 7 altas, 5
moderadas.**

## O número que importa é o de produção

`npm audit` conta a árvore inteira, e a maior parte dela nunca sai desta
máquina: `vitest`, `vite`, `esbuild` e `@vitest/mocker` são de teste, e o
`output: 'standalone'` do Next nem os enxerga.

A crítica ilustra bem a diferença. Era `vitest <3.2.6` — *"when Vitest UI server
is listening, arbitrary file can be read and executed"*. **Nenhum script deste
projeto levanta o Vitest UI**; ele só sobe com `vitest --ui`, digitado à mão.
Uma crítica no topo do relatório, e exposição zero no servidor.

Por isso existe `npm run auditoria`, que é `npm audit --omit=dev`. É o número a
olhar antes de uma implantação. O total continua valendo para a máquina de quem
desenvolve — a crítica do Vitest UI seria real para quem usasse a interface —,
mas os dois não são a mesma pergunta e não devem ser lidos como se fossem.

## O que foi feito em 31/08/2026

De **13 (1 crítica, 7 altas)** para **0**, e de **8 em produção** para **0**,
sem trocar nenhuma biblioteca e sem subir de major nada que rode no servidor.

### `overrides`, para as transitivas

Quatro dependências vulneráveis chegavam por pais que ainda não as tinham
atualizado. `overrides` no `package.json` fixa a versão corrigida sem esperar o
pai:

| override | de | para | por quê |
|---|---|---|---|
| `postcss` | 8.4.31 | 8.5.26 | o `next` fixa **exatamente** 8.4.31, e o `15.5.24` também fixa. Quatro avisos, dois altos. O `@tailwindcss/postcss` já rodava 8.5.26 no mesmo build. |
| `sharp` | 0.34.5 | 0.35.4 | quatro CVEs de libvips, herdadas pelo `sharp` como dependência opcional do `next`. |
| `deepmerge-ts` | 7.1.5 | 8.0.2 | esgotamento de pilha; chega pelo `@prisma/config`, que chega pelo `prisma`. |
| `uuid` | 8.3.2 | 11.1.1 | falta de checagem de limites de *buffer*; chega pelo `exceljs`, que em 01/09/2026 virou dependência de desenvolvimento e mesmo assim mantém o override — ver abaixo. |

### `vitest`, de 2.1.9 para 3.2.7

Major, e **só de desenvolvimento**. Fecha a crítica e arrasta `vite` e
`esbuild` para versões corrigidas. Os 671 testes passaram sem uma linha de
configuração alterada.

### Duas aprovações de script que sobravam

O `package.json` tem um campo `allowScripts`: o npm 11 não roda `postinstall` de
dependência sem aprovação nominal, e ele é a lista das aprovadas. Duas entradas
não correspondiam mais a nada na árvore — `sharp@0.34.5`, porque a 0.35 usa
binário pré-compilado e não tem script de instalação nenhum, e `esbuild@0.21.5`,
que saiu com o `vitest` antigo.

Não é limpeza cosmética. Uma aprovação órfã é uma autorização esperando o pacote
voltar: no dia em que `sharp@0.34.5` reaparecesse na árvore por qualquer
caminho, o `postinstall` dele rodaria pré-aprovado, sem ninguém decidir.

## O preço de um `override`, escrito antes que alguém o descubra

Um `override` **mente para o pai**. O `next` declara que quer `postcss` 8.4.31;
passa a receber 8.5.26 e não é consultado. Se o pai usar uma API que a versão
nova removeu, isso não aparece na instalação — aparece em execução, e talvez só
na tela que usa aquele caminho.

É por isso que cada um dos cinco foi verificado rodando, e não lendo número de
versão:

- `npm run build` compila (é o `postcss` do `next` fazendo o trabalho dele);
- os 671 testes unitários passam;
- as 90 travessias de ponta a ponta passam, nos quatro projetos do Playwright —
  são elas que exercitam o CSS pelo pipeline real e o download da prestação de
  contas, que é o `exceljs` chamando o `uuid`;
- `prisma generate` e `prisma migrate deploy` rodam (é o `deepmerge-ts`
  carregando a configuração);
- `typecheck` e `lint` limpos.

**Quando um pai atualizar, tire o `override` dele em vez de acumular.** A lista
existe para encolher; uma que só cresce vira uma segunda árvore de dependências,
mantida à mão e sem ninguém olhando.

**Isso quase enganou o override do `uuid`, em 01/09/2026.** A tarefa que tirou
a exportação em `.xlsx` do sistema moveu o `exceljs` de `dependencies` para
`devDependencies` — ele continua no projeto, só que agora serve o extrator de
layout (`scripts/extrair-layout-prestacao.ts`), não o servidor. Por um
instante pareceu que a regra acima mandava tirar o override: `npm run
auditoria`, que só olha produção, zerou sem ele. Mas o `exceljs` não
atualizou — só mudou de seção no `package.json`, e a árvore inteira, que "continua
valendo para a máquina de quem desenvolve" (acima), voltou a acusar duas
moderadas (`uuid <11.1.1`, GHSA-w5hq-g745-h8pq) assim que o override saiu. O
override ficou. A condição de saída continua sendo a original: o `exceljs`
publicar uma versão que não arraste o `uuid@8.3.2` — não o `exceljs` mudar de
lugar na árvore.

## O que continua aberto

Nada, quanto a aviso de vulnerabilidade. Fica registrada uma observação que não
é vulnerabilidade e vai confundir alguém:

**Nesta máquina Windows, o `sharp` não carrega** — e o `@next/swc-win32-x64-msvc`
também não. Os dois falham com *"uma política de Controle de Aplicativo bloqueou
este arquivo"* ao abrir o binário nativo. É política da máquina, é anterior a
esta mudança, e não é do `sharp`: o `next build` avisa e segue pelo compilador
alternativo. Não afeta a imagem Docker, que é Linux.

Vale notar por que isso nunca doeu: **o projeto não usa `next/image` em lugar
nenhum**, e `public/` está vazio. O `sharp` entra como dependência opcional do
`next` e nunca é chamado. O endpoint `/_next/image` fica de fora do `matcher` do
`middleware.ts` — quer dizer, é alcançável sem sessão —, mas sem
`images.remotePatterns` configurado o Next só otimiza caminho local, e não há
caminho local para otimizar. Uma imagem forjada, que é o que as CVEs de libvips
exigem, não tem por onde entrar.

## Como conferir

```bash
npm run auditoria   # produção: o número da implantação
npm audit           # árvore inteira: inclui teste e build
```

Antes de aceitar qualquer correção que o `npm audit` sugira, repare se ela vem
com `--force`: com `--force` ela troca major de dependência direta, e aí não é
mais atualização, é decisão. Sem `--force`, ainda assim rode o build e a suíte.
