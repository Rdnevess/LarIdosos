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

| # | Estado | Onde se resolve |
|---|---|---|
| 1. A escala tipográfica está declarada e não adotada | aberto | numa varredura dos 31 arquivos |
| 2. Densidade por dispositivo — tentada e revertida | revertido | volta depois do 1, e não antes |
| 3. O dourado da marca não tem um único chamador | aberto | filete agora; anel na etapa 3 |
| 4. Nove dos quinze ícones não têm chamador | aberto, esperado | conforme as telas pedirem |
| 5. Logo e favicon — a etapa 3 está pela metade | aberto, bloqueado | quando os vetores da marca chegarem |
| 6. Só existe guarda para o que já foi adotado | aberto | ao fechar o 1 e o 3 |

## 1. A escala tipográfica está declarada e não adotada

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
(`src/app/login/formulario.tsx`, linha 18): 1,25rem, que cai entre `text-secao`
(1,125rem) e `text-titulo` (1,5rem). A escala tem cinco degraus de propósito, e
acrescentar um sexto para acomodar um caso desfaz o motivo de ela existir — o
título do login sobe para `text-titulo` ou desce para `text-secao`, e a única
resposta errada é criar o degrau.

**O que não fazer:** trocar aos poucos, conforme se mexe em cada tela. Meia
adoção é pior que nenhuma: deixa duas telas vizinhas dizendo a mesma coisa de
dois jeitos, e ninguém consegue afirmar qual está certa. Ou se varre tudo com a
guarda do item 6 atrás, ou não se começa.

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

**Quando volta:** depois do item 1, e não antes.

**A verificação que a spec pediu e não existe:** a §9 previa um E2E conferindo
que a tabela de auditoria mantém o mesmo número de linhas por tela no desktop. A
troca foi deliberada e está na auto-revisão do plano — verifica-se o `font-size`
da raiz, que é a **causa** da densidade, e não a contagem de linhas, que depende
do conteúdo do banco e tornaria o teste frágil. A decisão continua valendo
quando a densidade voltar.

## 3. O dourado da marca não tem um único chamador

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

Duas entraram sem guarda: a escala tipográfica e o dourado. **A escala só tem
chamador dentro dos próprios primitivos; o dourado não tem nenhum.**

Não é coincidência, e a lição é barata: o que não tem guarda não é adotado, por
mais que o plano afirme que será. Ao fechar o item 1, a guarda contra `text-sm`
e família entra na mesma branch — no mesmo arquivo e no mesmo formato das outras
três, com o par de controles negativos que a guarda contra `<button>` cru só
ganhou depois de nascer cega: um que confirma que ela barra a forma crua, outro
que confirma que ela não barra o degrau da escala.

**O dourado é o caso em que a guarda não serve.** Não se testa "alguém usou o
filete" — ausência de uso não é defeito quando o uso é pontual por decisão. O
que o protege é o inverso, e já existe: o teste de contraste barraria o dourado
como texto no dia em que alguém tentasse.
