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

## 3. Categoria de despesa é lista aberta, e pode virar sopa

**Situação:** qualquer pessoa com papel COORDENACAO ou ADMINISTRATIVO cadastra
categoria nova, sem aprovação. Nada impede "Energia", "Luz" e "Conta de luz"
coexistirem.

**Por que está assim:** a alternativa — lista fechada no código — obrigaria um
*deploy* para cadastrar uma categoria nova, num sistema operado por uma equipe
pequena que não tem quem faça *deploy*. Seria trocar um problema de organização
por um de dependência técnica.

**Como saber se deu errado:** a conciliação da prestação lista as categorias.
Se elas começarem a se repetir com nomes diferentes, o documento entregue ao
órgão mostra isso na cara — é o próprio relatório que denuncia.

**O que fazer então:** desativar as duplicadas e reclassificar os lançamentos,
não fechar a lista.

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
para dentro da caixa da assinatura. A capa se resolve encolhendo a fonte até
caber, que era o que a spec mandava desde sempre.

Sobra um caso de bom senso: uma razão social muito mais longa que a atual
encolhe até o piso de 6 pt. A do sistema hoje pede 119,5 pt e cabe folgada em
10 pt nos 186 pt de C–F. Encolher só atinge nome atípico, e encolher é melhor
do que cortar.

## 11. O total da prestação é recomputado em dois lugares a mais

`documento-prestacao.ts:16` afirma que o total não é calculado em nenhum outro
lugar. Não é verdade: `desenharRodape` e `desenharConciliacao`, em
`pdf-prestacao.ts`, refazem a soma na hora de desenhar. Hoje as três contas
concordam, então nada sai errado no papel — o defeito é a afirmação, que
autoriza a próxima pessoa a confiar num invariante que o código não mantém.

**O que fazer:** passar o total já somado para quem desenha, e então o
comentário volta a ser verdade. Enquanto isso não acontece, o errado é o
comentário, não o cálculo.

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
