# Pendências da identidade visual

Registro do que ficou em aberto ao fechar a identidade visual. Mesmo formato dos
de Fase 1, 2A, 2B e 3: nenhum item impede o uso, e todos estão aqui para não
dependerem da memória de ninguém.

Esta não é uma fase numerada — é a travessia que repintou o sistema inteiro sem
acrescentar uma tela. Por isso o documento tem um item que os outros não têm: o
**6**, que não é pendência de código e sim o que separou as adoções que
terminaram das que ficaram pelo meio.

O item **2 foi revertido** e continua aqui em vez de sumir, pelo mesmo motivo do
item 4 do documento da Fase 3: ele desfaz uma decisão que estava escrita e
defendida na spec, e apagar o registro apagaria junto o motivo de ela ter caído.

O item **1 foi resolvido no mesmo dia em que este documento nasceu**, e isso não
é pressa: escrevê-lo foi o que tornou o tamanho do problema visível — 202
lugares, contados — e um problema contado é um problema que cabe numa branch.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. A escala tipográfica está declarada e não adotada | resolvido | 26/08/2026 |
| 2. Densidade por dispositivo — tentada e revertida | revertido, destravado | pode voltar; o item 1 era a trava |
| 3. O dourado da marca não tem um único chamador | metade resolvido | filete em 27/08/2026; anel na etapa 3 |
| 4. Nove dos quinze ícones não têm chamador | aberto, esperado | conforme as telas pedirem |
| 5. Logo e favicon — a etapa 3 está pela metade | aberto, bloqueado | quando os vetores da marca chegarem |
| 6. Só existe guarda para o que já foi adotado | resolvido | 26 e 27/08/2026, por dois meios diferentes |

## 1. A escala tipográfica está declarada e não adotada — resolvido

**Resolvido em 26/08/2026.** O registro do problema fica abaixo, inteiro, porque
o item 6 depende dele para fazer sentido.

**Situação:** os cinco degraus existem em `globals.css` e o markup continua
falando Tailwind cru. A contagem de hoje:

| Degrau | Chamadores | Tailwind cru equivalente | Usos |
|---|---|---|---|
| `text-titulo` | 0 | `text-2xl` | 1 |
| `text-secao` | 1, no `Cartao` | `text-lg` | 26 |
| `text-corpo` | 0 | `text-base` | 19 |
| `text-suporte` | 1, no `Botao` | `text-sm` | 148 |
| `text-legenda` | 1, na `Etiqueta` | `text-xs` | 7 |

Os três chamadores que existem estão **dentro dos próprios primitivos**. Fora
deles a escala não tem um único uso: 202 tamanhos crus, espalhados por 31
arquivos, contra 3.

**Por que ficou assim:** a escala entrou pela Task 2 do plano, que a declarou e
parou aí — a adoção estava implícita, e implícito não acontece. Os primitivos
nasceram com o mesmo defeito e só se resolveram porque alguém foi atrás; a
diferença é que eles tinham uma guarda de teste esperando por eles. A escala não
tem. Ver o item 6.

**Como resolver:** a varredura é mecânica — `text-2xl` → `text-titulo`,
`text-lg` → `text-secao`, `text-base` → `text-corpo`, `text-sm` →
`text-suporte`, `text-xs` → `text-legenda`. **Cada par tem o mesmo valor e a
mesma altura de linha**, então a troca não muda um pixel hoje: ela não é
melhoria visual, é o pré-requisito do item 2 e o fim da decisão de tamanho
repetida em cada tela. Os 148 `text-sm` estão concentrados — seis arquivos
carregam 72 deles, e a ficha do residente sozinha tem 19.

**O único que exige decisão** é o `text-xl` do `<h1>` da tela de login
(`src/app/login/formulario.tsx`): 1,25rem, que cai entre `text-secao`
(1,125rem) e `text-titulo` (1,5rem). A escala tem cinco degraus de propósito, e
acrescentar um sexto para acomodar um caso desfaz o motivo de ela existir — o
título do login sobe para `text-titulo` ou desce para `text-secao`, e a única
resposta errada é criar o degrau.

**O que não fazer:** trocar aos poucos, conforme se mexe em cada tela. Meia
adoção é pior que nenhuma: deixa duas telas vizinhas dizendo a mesma coisa de
dois jeitos, e ninguém consegue afirmar qual está certa. Ou se varre tudo com a
guarda do item 6 atrás, ou não se começa.

### Resolvido em 26/08/2026

A varredura foi feita de uma vez, com a guarda escrita antes dela e vista
falhando com a lista dos 202 lugares. Hoje o Tailwind cru tem zero usos e a
escala tem 204 no markup: os 201 que a varredura trocou, mais os três que já
viviam nos primitivos. O 202º achado era um comentário — o de `campo.tsx`, que
citava o degrau pelo nome e foi renomeado junto, para não envelhecer.

**Um único pixel mudou**, e foi o caso que este registro previa: o `<h1>` do
login subiu de 1,25rem para `text-titulo` (1,5rem). O motivo está escrito ao
lado dele no código — é o `<h1>` da tela, e é ali que quem abre o sistema
reconhece o Lar. O sexto degrau que acomodaria os 1,25rem não foi criado.

**A guarda pegou o primeiro infrator antes de qualquer tela:** o comentário que
eu havia escrito no login para registrar a decisão citava a classe morta pelo
nome, e a guarda — que é por linha, como as outras três — acusou. O comentário
passou a falar pelo valor. É o comportamento certo, e as outras três guardas
fariam o mesmo.

**Uma armadilha ficou registrada em `campo.tsx`:** aquele degrau é o único que
precisa valer 16px **absolutos**, e não relativos — abaixo disso o iOS dá zoom
ao focar o campo. Quem baixar a raiz no celular quebra o campo sem quebrar teste
nenhum. Vale para o item 2.

**Verificado:** 568 testes de unidade, 73 E2E, `tsc` e `eslint` limpos.

## 2. A densidade por dispositivo foi tentada e revertida

**Situação:** a §5.2 da spec decidiu que a raiz cairia para 15px no desktop e a
escala inteira em `rem` acompanharia — uma regra só entregando densidade no
desktop e legibilidade no celular. Entrou na Task 2 e saiu no mesmo dia
(`198a720`, 26/08/2026).

**Por que caiu:** ela só funciona depois do item 1. Com 148 `text-sm` ainda no
markup, baixar a raiz para 15px encolhia o texto corrente de 14px para 13,1px —
menor do que era antes da branch, numa branch cujo objetivo declarado era
legibilidade. A regra estava certa; a ordem é que estava errada.

**Onde ficou registrado:** no comentário da regra de 16px em `globals.css`, com
a condição de volta escrita ao lado. O `aparencia.spec.ts` passou a exigir 16px
em qualquer dispositivo, e o teste foi renomeado para o que ele agora verifica.

**Quando volta:** depois do item 1 — que fechou em 26/08/2026. **A trava saiu**,
e a densidade por dispositivo pode voltar quando alguém quiser: hoje a escala
inteira está em `rem` e adotada, então baixar a raiz no desktop encolhe tudo na
proporção pretendida, que era o efeito original.

**A condição que a volta tem de respeitar:** o campo de formulário precisa de
16px absolutos no celular, ou o iOS dá zoom ao focar (está escrito em
`campo.tsx`). O bloco revertido mexia só a partir de `min-width: 640px` e por
isso não esbarrava nisso — se voltar assim, continua não esbarrando. Baixar a
raiz no celular é que quebraria, e sem quebrar teste nenhum.

**A verificação que a spec pediu e não existe:** a §9 previa um E2E conferindo
que a tabela de auditoria mantém o mesmo número de linhas por tela no desktop. A
troca foi deliberada e está na auto-revisão do plano — verifica-se o `font-size`
da raiz, que é a **causa** da densidade, e não a contagem de linhas, que depende
do conteúdo do banco e tornaria o teste frágil. A decisão continua valendo
quando a densidade voltar.

## 3. O dourado da marca não tem um único chamador — metade resolvido

**Situação:** `--cor-detalhe` está nos três blocos do tema — `#ae9050` no claro,
`#c0a670` nos dois escuros — e exposto a Tailwind como `--color-detalhe`. Não há
uma só classe `text-detalhe`, `bg-detalhe` ou `border-detalhe` no sistema. O
dourado é a cor de assinatura da marca, e a interface nunca o mostra.

**Por que ficou assim:** a §3 restringe o dourado a filete e anel, e o anel da
marca depende da etapa 3 (item 5). O token entrou junto com a paleta, no lugar
certo, e ficou esperando o chamador que a etapa 3 traria.

**O que dá para fazer já:** o filete sob o cabeçalho não depende de vetor
nenhum. O `<header>` de `src/app/(app)/layout.tsx` hoje é `border-b
bg-superficie`, sem cor de borda própria — cai na regra geral das bordas sem
cor. É uma classe.

**O que não fazer:** espalhá-lo para justificar o token. A §3 dá três motivos
para a restrição, e o terceiro é o que decide: o sistema já tem uma família
âmbar que significa "atenção" — caixa de aviso, etiqueta de prestação aberta,
filete do mapa do turno. Dourado e âmbar lado a lado numa tela de plantão são a
mesma cor para quem passa os olhos.

### O filete entrou em 27/08/2026

O `<header>` do layout autenticado passou a levar `border-detalhe`. Um pixel, e
não dois: o dourado sobre o neutro quente já é mudança de matiz, e não só de
valor, e a essa espessura ele assina sem gritar numa tela que a equipe olha o
dia inteiro. O motivo está escrito ao lado dele no código.

**O teste não compara com hexadecimal escrito à mão:** ele lê `--cor-detalhe` da
raiz e exige que a borda do cabeçalho seja exatamente aquilo, nos dois temas.
Assim vale para os dois sem duplicar literal, e continua certo no dia em que
alguém reafinar o dourado — o que ele prende é a ligação, não o valor.

**E ele traz o controle que o impede de ser cego:** os dois temas são medidos e
os dourados têm de sair diferentes. Sem isso, uma emulação de tema que não
surtisse efeito faria o teste medir o claro duas vezes e passar nas três
asserções — o mesmo defeito que a guarda contra `<button>` cru teve ao nascer.

**O que continua aberto:** o anel da marca, que é o outro lugar onde a §3
autoriza o dourado. Esse depende dos vetores (item 5).

## 4. Nove dos quinze ícones não têm chamador

**Situação:** `icones.tsx` traz quinze desenhos copiados do Lucide. Seis são
usados, todos na navegação: `turno`, `residente`, `alerta`, `funcionario`,
`financeiro` e `auditoria`. Os outros nove — `prontuario`, `medicacao`,
`documento`, `sucesso`, `erro`, `busca`, `voltar`, `sair`, `tema` — não têm um
uso. O `Botao` aceita a prop `icone`, e nenhuma das 16 chamadas a passa.

**Por que isto não é o mesmo problema do item 1:** um degrau tipográfico sem
chamador é uma decisão não tomada — o tamanho está sendo escolhido à mão em
outro lugar, tela a tela. Um ícone sem chamador é um desenho na prateleira: não
há decisão concorrente rodando em paralelo, o custo é de bytes, e o nome já está
escolhido para quando a tela pedir.

**A regra que vale ao gastá-los**, e está escrita no código: o ícone acompanha o
rótulo e nunca o substitui. Ícone sozinho vira adivinhação para quem está de
plantão, e o E2E exige as duas coisas — que o SVG exista e que o texto continue
lá.

**Quando remover:** se um deles seguir sem chamador ao fechar a próxima fase,
não era inventário — era palpite, e aí sai.

## 5. Logo e favicon — a etapa 3 está pela metade

**Situação:** o nome entrou. "Lar Dona Francisca" está no `<title>`, no cabeçalho
de toda tela autenticada e no login, com E2E conferindo. A logo e o favicon não:
`src/app/favicon.ico` é o do template, intocado desde o commit de fundação
(`93731ac`, 18/08/2026).

**Por que está bloqueado:** os arquivos vetoriais da marca não chegaram. A §7 da
spec já contava com isso — a etapa 3 é a última exatamente por depender deles, e
não por ser a menos importante.

**O que entra quando chegarem:** o SVG da logo, o favicon derivado dele, o anel
do item 3, e a reconferência dos hexes — que a §10 deixou aberta de propósito,
porque a paleta de hoje foi medida sobre imagens provisórias de baixa resolução.

**O que continua fora do repositório:** o material de referência em `exemplo/`,
que está no `.gitignore` e fica. Algumas dessas imagens mostram residentes, e
foto de idoso em ILPI é dado pessoal. O que entra é o SVG — desenho, não
fotografia.

## 6. Só existe guarda para o que já foi adotado

Este item não é pendência de código. É o que os cinco anteriores têm em comum, e
está escrito porque decide como fechá-los.

Três coisas têm guarda de teste atrás de si em `tests/tema.test.ts`: os tokens
de cor (guarda contra cor crua, herdada do tema escuro), o `Botao` (guarda
contra `<button>` cru) e a superfície de cartão (guarda contra `rounded border
bg-superficie` escrito à mão). **As três estão adotadas até o fim** — `<Botao>`
em 14 arquivos, a classe `.cartao` em 18 além do próprio primitivo, e nenhuma
cor crua em lugar nenhum.

Duas entraram sem guarda: a escala tipográfica e o dourado. **A escala só tinha
chamador dentro dos próprios primitivos, e o dourado não tinha nenhum.**

Não é coincidência, e a lição é barata: o que não tem guarda não é adotado, por
mais que o plano afirme que será.

**A metade da escala está fechada.** Em 26/08/2026 a guarda contra `text-sm` e
família entrou na mesma branch que a varredura, e antes dela — no mesmo arquivo
e no mesmo formato das outras três, com o par de controles negativos que a
guarda contra `<button>` cru só ganhou depois de nascer cega: um confirma que
ela barra a forma crua, outro que ela não barra nem o degrau da escala nem a
cor. As cores entraram nesse controle de propósito, porque `text-` é prefixo de
tamanho e de cor ao mesmo tempo, e uma guarda gulosa apagaria a paleta inteira.

A prova de que ela não nasceu cega veio no mesmo dia: o primeiro achado dela
não foi uma tela, foi um comentário recém-escrito que citava a classe morta pelo
nome.

**O dourado é o caso em que a guarda não serve** — e por isso ele precisou de
outra coisa. Guarda é varredura: procura uma forma proibida em todo lugar e
acusa onde ela aparece. Não se varre "alguém usou o filete", porque ausência de
uso não é defeito quando o uso é pontual por decisão; uma guarda assim acusaria
as 30 telas que corretamente não têm dourado nenhum.

O que o dourado ganhou em 27/08/2026 é o oposto de uma guarda: um teste que
**prende um uso nomeado**, o filete do cabeçalho, e exige que ele venha do
token nos dois temas. Guarda proíbe uma forma em toda parte; este teste fixa uma
forma num lugar. Os dois protegem, e não se substituem.

E os dois lados do dourado continuam cobertos pelo inverso, que já existia: o
teste de contraste barraria o dourado como texto no dia em que alguém tentasse.
