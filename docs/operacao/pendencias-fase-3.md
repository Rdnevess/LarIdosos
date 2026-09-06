# Pendências da Fase 3

Registro do que ficou em aberto ao fechar o financeiro e a prestação de contas.
Mesmo formato dos de Fase 1, 2A e 2B: nenhum item impede o uso, e todos estão
aqui para não dependerem da memória de ninguém.

O item **4 já foi resolvido** e continua neste documento em vez de sumir dele:
ele reverte uma decisão que estava escrita e defendida como deliberada, e
apagar o registro apagaria junto o motivo de ela ter mudado.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Fidelidade do `.xlsx` ao modelo do órgão | resolvido por eliminação | 01/09/2026, o `.xlsx` saiu |
| 2. O PDF não é pixel a pixel igual ao `.xlsx` | resolvido por eliminação | 01/09/2026, o `.xlsx` saiu |
| 3. Categorias de despesa como lista aberta | aberto, deliberado | se a conciliação virar sopa de categorias |
| 4. "à disposição dos condôminos" na declaração | resolvido | 24/08/2026 |
| 5. Vulnerabilidade moderada em `uuid`, via `exceljs` | resolvido | 31/08/2026, por `override` |
| 6. O layout extraído carrega categorias do exemplo | aberto — contornado | no extrator, se o modelo mudar |
| 7. O backup ficou bem mais pesado | aberto — agrava o item 1 da Fase 1 | no teste de restauração, no VPS |
| 8. Ninguém confere se o anexo é o que diz ser | aberto, deliberado | é trabalho de quem confere |
| 9. As letras do PDF não são as do modelo | aberto, deliberado | se o órgão recusar por isso |
| 10. Rótulo mais largo que a célula é truncado | aberto, medido | se o órgão notar |

## 1. A fidelidade do `.xlsx` ao modelo do órgão — resolvido por eliminação

**Resolvido em 01/09/2026, por eliminação.** O item perguntava se o `.xlsx`
gerado parecia com o modelo do órgão — e a resposta só se confirmava abrindo
os dois lado a lado. O `.xlsx` saiu do sistema (`Remove a exportacao em
xlsx`), e o item perdeu o objeto: não há mais planilha para comparar.

**Para onde a pergunta migrou:** para o PDF. Ele passou a reproduzir a grade
do modelo célula a célula — mesmas faixas de mescla, larguras de coluna,
rótulos fixos e bordas que o `.xlsx` reproduzia — e agora é ele o documento
entregue ao órgão. A conferência continua sendo a mesma coisa que era antes,
só que contra outro arquivo: humana, olho no olho, contra
`docs/convenio/Modelo Prestacao Contas.pdf`. Nenhum teste automatizado faz
essa checagem — não há `poppler` nesta máquina para abrir um PDF como imagem.

**Onde ficou o que essa conferência já encontrou:** os itens 9 e 10 registram
as duas diferenças que apareceram na primeira rodada — tipografia e
transbordo de rótulo.

## 2. O PDF não é pixel a pixel igual ao `.xlsx` — resolvido por eliminação

**Resolvido em 01/09/2026, por eliminação.** Sem `.xlsx`, não sobra um
segundo documento para o PDF divergir dele.

**O que continua valendo:** a decisão que sustentava este item. Não embarcar
um conversor de 400 MB (LibreOffice ou Chromium) continua certo — só que a
fidelidade que o PDF tem hoje contra o modelo do órgão não veio de converter
um formato no outro. Veio de o renderizador desenhar a mesma grade que o
`.xlsx` desenhava, célula a célula, a partir do mesmo layout extraído do
modelo real. O problema que o conversor resolveria — dois documentos que
podem divergir — deixou de existir por um caminho mais barato que pagar os
400 MB.

## 3. Categoria de despesa era lista aberta sem conserto — resolvido

**Resolvido** em 04/09/2026, seguindo o que este próprio item prescrevia:
**não** fechar a lista. Fechá-la obrigaria um *deploy* para cadastrar categoria
nova, num sistema operado por uma equipe pequena que não tem quem faça
*deploy* — seria trocar um problema de organização por um de dependência
técnica.

O que faltava era o resto da receita: o item mandava "desativar as duplicadas e
reclassificar os lançamentos", e o sistema só sabia desativar. Desativar
sozinho não resolve nada: os lançamentos continuam apontando para a duplicada,
e o nome dela continua saindo na conciliação da prestação — que é exatamente
onde a sopa aparece.

**O que passou a existir:**

1. **Guarda contra duplicata textual, na criação.** "Energia", "energia" e
   "ENERGIA " caem no mesmo nome normalizado (sem caixa, sem acento, sem espaço
   sobrando) e a segunda é recusada, com a mensagem nomeando a que já existe.
   Nome genuinamente novo continua entrando sem pedir licença a ninguém — a
   lista segue aberta. A comparação inclui a categoria desativada: sem isso,
   desativar "Energia" e cadastrá-la de novo devolveria as duas à base.

2. **Mesclagem, na tela de cadastros.** Move os lançamentos de uma categoria
   para outra e desativa a de origem, sem precisar de alguém com acesso ao
   banco.

**O que a mesclagem não faz, de propósito:** lançamento de prestação **FECHADA**
fica onde está. Um documento já protocolado mostrou "Luz" e continua mostrando
"Luz"; reescrever isso seria falsificar o que foi entregue ao órgão. A operação
devolve quantos foram reclassificados e quantos ficaram — "0 lançamentos
reclassificados. 1 ficou onde estava, em prestação fechada." —, porque engolir
esse número faria a tela mentir por omissão sobre uma limpeza que não foi
total.

**Continua valendo como rede:** a conciliação lista as categorias. Se elas
voltarem a se repetir com nomes *diferentes* ("Energia" e "Conta de luz"), que
nenhuma normalização pega, o documento entregue ao órgão mostra isso na cara — é
o próprio relatório que denuncia, e a mesclagem é o que conserta.

**Fica registrado o que não foi feito:** origem de receita tem a mesma forma e o
mesmo risco — o agrupamento da prestação usa `rotuloPrestacao`, e duas origens
com rótulos que só diferem por acento partiriam o subtotal do mesmo jeito. Não
recebeu a guarda nem a mesclagem, porque estava fora do que este item pedia.

## 4. "à disposição dos condôminos" na declaração — resolvido

**Resolvido em 24/08/2026.** A declaração agora termina dizendo que os
documentos ficam "identificados e **à disposição do órgão conveniador**".

**O que estava errado:** a declaração de guarda e conservação, copiada do
modelo do órgão, dizia "à disposição dos **condôminos**". Condômino é dono de
apartamento, não órgão conveniador — a frase veio de outro modelo, por cópia.

**Por que ficou aberta até aqui:** é a redação que o órgão já tinha recebido e
aceitado, e mudar o texto de um documento oficial é decisão da instituição, não
do sistema. O dono do projeto confirmou o erro e autorizou a correção.

**Onde ficou:** `src/modules/financeiro/textos-prestacao.ts`, na função
`montarDeclaracao`, com o comentário no lugar registrando a mudança e a data.

**Duas outras decisões da mesma redação, essas já tomadas:** a primeira linha
do modelo — uma nota de trabalho de quem montou o arquivo, que sairia impressa
em toda prestação — **saiu**, e há teste conferindo que não sobrevive em lugar
nenhum; e **"Conte Corrente" virou "Conta Corrente"**, erro de digitação sem
mudança de sentido.

## 5. Vulnerabilidade moderada em `uuid`, herdada do `exceljs` — resolvido

**Situação:** `npm audit` aponta uma vulnerabilidade moderada em `uuid`, que
chega como dependência do `exceljs` — a primeira dependência de produção nova
desde a Fase 1.

**Qual é a exposição:** o aviso vale para a chamada com um *buffer* fornecido
pelo chamador. O código deste projeto nunca gera UUID pelo `exceljs`, e o
`exceljs` só é usado para escrever a planilha da prestação a partir de dados do
próprio banco.

**Como se resolveu:** em 31/08/2026, por `override` no `package.json` —
`uuid` fixado em 11.1.1 sem esperar o `exceljs`, que continua em 4.4.0, ainda a
versão mais recente publicada. A espera prevista aqui — "atualizar quando o
`exceljs` publicar versão com a dependência corrigida" — não tinha prazo, e não
precisava ser esperada.

**O que este item não via:** ele registrava uma vulnerabilidade porque era a que
a Fase 3 trouxe, e a última seção nomeava as outras para dizer que não eram
dela. Era verdade, e não era um inventário. Quando alguém finalmente contou, em
31/08/2026, eram **13, com uma crítica e sete altas**. Todas fechadas no mesmo
dia.

**Onde isso mora agora:** `docs/operacao/dependencias.md`. Vulnerabilidade de
dependência não é assunto de fase — ela chega pela árvore, e não pela travessia
que por acaso estava aberta quando o aviso apareceu. Este item fica como
registro do que a Fase 3 acrescentou; o número vivo está lá, com
`npm run auditoria`.

## 6. O layout extraído carrega categorias do exemplo preenchido

**Situação:** o extrator copia rótulos de células fora das faixas de dados. Na
folha de conciliação, o modelo não tem faixa de dados declarada, e as linhas do
exemplo — categorias como "Salário", "Diária", "Taxa bancária" — foram
extraídas junto com os rótulos de verdade.

**Por que não vazou nada:** são palavras genéricas, sem nome de pessoa, de
empresa, CPF, CNPJ ou valor. A barreira do `layout-prestacao.test.ts` fez o
trabalho dela.

**Como está contornado:** a folha de conciliação é **composta**, não copiada. O
renderizador reaproveita apenas os rótulos de verdade, calcula a posição deles
pelo volume real, e escreve os dados da prestação. Há teste conferindo que
"Salário", "Diária" e "Taxa bancária" não sobrevivem ao arquivo gerado.

**Onde se resolve de verdade:** ensinar o extrator a reconhecer a faixa de
dados da conciliação, como já reconhece a de despesas e a de receitas. Vale
fazer se o modelo do órgão mudar e a extração precisar ser refeita.

**O que não fazer:** editar o arquivo gerado à mão. Ele diz, no topo, que é
gerado; uma edição manual se perde na primeira regeração e ninguém lembra por
quê.

## 7. O volume de backup ficou bem mais pesado

**Situação:** os anexos comprobatórios vão para o mesmo volume `lar_uploads` do
anexo de residente. Uma dúzia de notas por mês, mais os comprovantes e um
extrato por conta, passam a ser a maior parte do que o backup protege.

**Por que isso importa:** o item 1 das pendências da Fase 1 registra que a
metade documental do backup **nunca foi exercitada** — nem no VPS, nem na
verificação parcial de 23/08/2026, que cobriu só o que não dependia de Docker.
Essa metade acabou de ficar bem maior, e continua sendo a que ninguém testou.

**O que fazer:** nada aqui. É razão a mais para o teste de restauração da Fase 1
deixar de ser hipótese, e não uma tarefa própria.

## 8. Ninguém confere se o anexo é o que diz ser

**Situação:** um comprovante de pagamento enviado no campo do documento fiscal
entra no apêndice na posição do documento fiscal, e o sistema não tem como
notar. O mesmo vale para a nota de outra despesa, ou para um PDF em branco.

**Qual é a exposição:** a contagem de cobertura no cartão da prestação mostra
que **há** um arquivo, nunca que ele é o arquivo certo. Quem confere continua
sendo quem confere.

**O que fazer:** nada. Reconhecer conteúdo de PDF é problema de outra ordem, e
o valor de resolvê-lo não paga o que custaria.

## 9. As letras do PDF não eram as do modelo — resolvido

**Resolvido** em 04/09/2026, com fontes de licença livre (SIL OFL 1.1)
embarcadas em `src/modules/financeiro/fontes/`.

O modelo do órgão usa quatro tipografias, e o PDF saía nas embutidas do
formato. A troca agora é por **clones metricamente compatíveis**:

| O modelo usa | O PDF usa | Métrica |
|---|---|---|
| Arial | Arimo | idêntica |
| Times New Roman | Tinos | idêntica |
| Calibri | Carlito | idêntica |
| Algerian | Cinzel | aproximada |

"Metricamente compatível" não é detalhe de gosto: cada letra ocupa exatamente a
mesma largura da original, e é isso que permitiu trocar o desenho das letras
**sem mexer em uma única coordenada da grade**, que foi medida contra o modelo.

Algerian é decorativa e não tem clone. Cinzel entra por cumprir o mesmo papel:
capitulares que fazem a razão social ler como timbre, e não como corpo em
negrito. É a única troca em que o desenho é escolha, e não equivalência.

**O que a troca consertou de quebra:** em Helvetica, "PRESTAÇÃO DE CONTAS"
pedia 584,9 pt numa caixa de 553,9 e encolhia para 45 pt. Carlito herda a
métrica do Calibri: o mesmo texto pede 468,8 pt e sai inteiro em 48. O item 10
dava esse encolhimento como o único desfecho possível — ele deixou de ser
necessário, e o piso de redução continua no código como rede.

**O que custou:** o documento passou de ~16 KB para ~42 KB, que é o peso dos
subconjuntos embutidos, e some perto do apêndice de anexos. O extrator de texto
dos testes precisou virar `pdf.js`: com fonte embarcada o pdfkit escreve índice
de glifo, e o extrator antigo decodificava hexadecimal como WinAnsi — as oito
verificações que sustentam a barreira anti-vazamento passariam a ler lixo.

**O que se declarou:** `next.config.ts` lista os arquivos em
`outputFileTracingIncludes`. Nada os importa — eles entram por `readFileSync`,
que o rastreamento do Next não enxerga —, e sem a declaração o
`.next/standalone` sai sem eles e o PDF quebra só em produção.

## 10. Rótulo mais largo que a célula era truncado — resolvido

**Resolvido** em 04/09/2026, e por um caminho diferente do que este item
previa. Fica registrado porque a premissa errada custou uma rodada.

O que estava escrito aqui era que as 11 colunas à direita de `A34`/`A51`
estavam vazias e serviriam de espaço para o transbordo. Não estavam: o próprio
renderizador escreve a razão social na coluna vizinha, e a truncagem cortava
palavra inteira sem aviso — "Unidade Executora:" saía "Unidad", e a capa saía
"PRESTAÇÃO DE" sem "CONTAS". A reticência que este item citava nunca chegava a
aparecer: com `lineBreak: false`, o `ellipsis` do pdfkit não atua.

Medido no modelo do órgão, o que decidiu o desfecho: nas linhas 34 e 51 não há
mescla **nem borda vertical entre A e F**. As bordas são `A.esquerda`,
`F.direita`, `G.esquerda`, `L.direita` — aos olhos é uma caixa A–F, e G–L é a
caixa da assinatura. A caixa que o leitor enxerga é delimitada por **borda, não
por coluna**. É a mesma razão pela qual `A5`/`A6`, mescladas A:L, já saíam
inteiras desde o começo.

O conserto foi mover a razão social do rodapé uma coluna à direita, liberando
`B` para o rótulo (que pede 87,4 pt e ganha os 93,0 pt de A+B, em 10 pt), e
ensinar o transbordo a parar na borda — sem isso, um nome longo vazava de `F`
para dentro da caixa da assinatura. A capa se resolvia encolhendo a fonte até
caber, que era o que a spec mandava desde sempre — **e deixou de precisar** em
04/09/2026: com Carlito no lugar do Helvetica, o título passou a caber em 48 pt
(ver item 9). O encolhimento continua no código, agora só como rede.

Sobra um caso de bom senso: uma razão social muito mais longa que a atual
encolhe até o piso de 6 pt. A do sistema hoje pede 119,5 pt e cabe folgada em
10 pt nos 186 pt de C–F. Encolher só atinge nome atípico, e encolher é melhor
do que cortar.

## 11. O total da prestação era recomputado no renderizador — resolvido

**Resolvido** em 04/09/2026. `documento-prestacao.ts` afirmava que os totais
são calculados ali e em nenhum outro lugar, e não era verdade: `desenharRodape`
refazia a soma da folha com um `reduce` próprio sobre as mesmas linhas.

**O que se mediu antes de mexer:** os números concordavam. Em 400 mil sorteios,
`formatarMoeda` arredonda igual a `duasCasas`, e a soma de valores com duas
casas não chega perto de uma fronteira de arredondamento. Nada saía errado no
papel — o problema era a segunda regra de agregação, livre para discordar da
primeira assim que alguém mexesse só num lado: uma categoria que deixa de
entrar, um estorno que passa a abater.

O total agora viaja como parâmetro, e um teste prende o invariante: um
documento cujo total declarado **não** bate com a soma das linhas, e o rodapé
tem que imprimir o declarado. Provado vermelho reintroduzindo o `reduce`.

Fica registrada a distinção que o comentário passou a fazer: **somar** é
percorrer lançamentos, e mora num lugar só; **combinar** totais já fechados
("Total de Saldo + Receitas" é `saldoAnterior + totalReceitas`) continua no
renderizador, porque não tem como discordar da regra.

## 12. `ESPESSURA.double` desenha um traço só

A spec pede dois traços para a borda `double`; o renderizador desenha um, com
0,5 de espessura. Inalcançável hoje, e o teste `o modelo usa um estilo de borda
só` prova por quê: as 1431 bordas do modelo são todas `thin`. Se o órgão
revisar o modelo e trouxer `double`, aquele teste falha primeiro — o aviso
chega antes do documento errado.

## 13. A exclusão por posição não protege a folha de conciliação

`acharFaixaDados` só roda para `FOLHAS_QUE_CRESCEM` (`3-Despesas` e
`4-Receitas`), então a barreira que exclui conteúdo por posição nunca se aplica
a `5-Conciliação`. Há 18 categorias alheias no layout versionado hoje.
Inofensivas — a coluna de credor veio vazia no modelo do órgão — mas é uma
camada de proteção montada no lugar errado, e a inocência é circunstancial.

**O que fazer:** exige reextrair o layout, o que só é possível com o arquivo do
órgão em mãos.

## 14. Depois de um envio sem JavaScript, o resumo fica fora de vista

**Situação:** se alguém envia um formulário antes de a página hidratar, o
`<form>` da ação de servidor vai pelo caminho nativo: o navegador faz a
navegação inteira e a ação executa normalmente. Duas coisas medidas com o
JavaScript desligado, o que torna esse caminho o único possível (o teste está
em `tests/e2e/financeiro.spec.ts`, `describe('sem JavaScript')`):

1. **A seção volta fechada.** `open` é estado do DOM, e a navegação o descarta.
2. **A mensagem está no documento.** O `useActionState` do React é
   progressivamente aprimorado: sem JavaScript a ação roda e o estado volta
   renderizado.

Então o resumo não se perde — fica **fora de vista**, dentro da seção
recolhida, e a pessoa não tem por que saber que precisa reabrir.

**Este item já foi registrado errado duas vezes, e o registro fica.** Primeiro
como "fica escondida" (certo, mas por suposição). Depois "corrigido" para "se
perde", com base numa falha de E2E lida às pressas — e essa versão era falsa.
O teste com JavaScript desligado é o que resolveu, porque transforma um
intermitente sob carga em algo determinístico.

**Qual é a exposição:** a operação acontece de verdade, então nada se corrompe.
O que não chega é o que ela informa. Para "Registro salvo." não faz diferença.
Para as duas mesclagens faz: a mensagem carrega quantos lançamentos ficaram
para trás por estarem em prestação fechada ("0 lançamentos reclassificados. 1
ficou onde estava, em prestação fechada."). Sem lê-la, quem operou conclui que
a duplicada sumiu do documento — e ela continua nas competências já entregues.

**A falha intermitente do E2E tem causa e conserto.** Era o clique chegando
antes do React, e apareceu em dois arquivos independentes —
`financeiro.spec.ts` e `residentes.spec.ts` —, sempre na suíte cheia e nunca
isolado. `useHidratado` (em `src/lib/hidratacao.ts`) marca o `<form>` com
`data-hidratado="sim"` quando o React assume, e `esperarHidratacao` (em
`tests/e2e/hidratacao.ts`) espera por ele.

O marcador vive no código de produção de propósito: o teste não tem como
observar de fora um estado que só o cliente conhece. A primeira versão do
ajudante esperava por `networkidle`, que fazia a intermitência sumir sem dizer
nada sobre hidratação — trocar uma aproximação que funciona por um fato é o que
separa um teste estável de um teste com sorte.

**O que fazer:** manter a seção aberta quando a resposta trouxer resultado de
ação. Exige que o `<details>` deixe de ser não-controlado, o que num componente
de servidor não é imediato. Enquanto não for feito, a operação continua correta
e o resumo é que pode passar despercebido.

## 15. A falha intermitente da suíte unitária — resolvida, e o método fica

**Resolvida** em 05/09/2026. Durante horas a suíte falhou com **1 teste** em
cerca de uma rodada a cada quatro, e nunca era capturada pelo nome: a saída
rolava, restava a contagem, e as rodadas seguintes vinham verdes. Seis rodadas
instrumentadas seguidas não reproduziram.

**O que a capturou:** rodar a suíte **logo depois de uma operação de git que
mexe em arquivos**, com relatório em JSON gravado em disco em vez de lido da
tela. Reproduziu na primeira tentativa.

**O que era:** `pdf-prestacao.test.ts :: a razao social vai para a celula da
capa` estourando o limite padrão de 5000 ms, com **6799 ms**. Não é falha de
asserção — é tempo.

**Por que não é o código:** medido no mesmo dia, importar os módulos leva
~750 ms e `gerarPdfPrestacao` leva ~450 ms, tanto a frio quanto quente. A
importação a frio do `pdf.js` leva 165 ms. Nada disso soma cinco segundos. O
resto é máquina fria — cache de arquivo invalidado pela operação de git, que é
exatamente a condição em que reproduziu.

**O conserto:** `testTimeout: 20_000` em `vitest.config.ts`, com o número
justificado no comentário. Não esconde travamento: são 25x o tempo do teste
mais pesado com a máquina quente. A causa real é que o padrão de 5 s é
apertado para uma suíte em que **todo teste começa truncando o banco**.

**O que fica de método, e vale mais que o conserto:** contagem de falha não é
diagnóstico. Duas vezes eu registrei "1 teste falhou, não sei qual" e segui
adiante; a terceira só rendeu porque gravei o relatório em arquivo e forcei a
condição suspeita em vez de esperar a sorte. Se voltar a acontecer com outro
teste, o caminho é esse:

```
npx vitest run --reporter=json --outputFile=<arquivo>.json
```

e ler `numFailedTests` mais `assertionResults[].fullName` e `.duration` — a
duração distingue estouro de tempo de falha de asserção, que é a primeira
bifurcação do diagnóstico.
