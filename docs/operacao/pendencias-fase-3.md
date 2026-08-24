# Pendências da Fase 3

Registro do que ficou em aberto ao fechar o financeiro e a prestação de contas.
Mesmo formato dos de Fase 1, 2A e 2B: nenhum item impede o uso, e todos estão
aqui para não dependerem da memória de ninguém.

O item **4 já foi resolvido** e continua neste documento em vez de sumir dele:
ele reverte uma decisão que estava escrita e defendida como deliberada, e
apagar o registro apagaria junto o motivo de ela ter mudado.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Fidelidade do `.xlsx` ao modelo do órgão | aberto — só se confirma abrindo os dois | na primeira entrega real, com o órgão |
| 2. O PDF não é pixel a pixel igual ao `.xlsx` | aberto, deliberado | não se resolve sem 400 MB de conversor |
| 3. Categorias de despesa como lista aberta | aberto, deliberado | se a conciliação virar sopa de categorias |
| 4. "à disposição dos condôminos" na declaração | resolvido | 24/08/2026 |
| 5. Vulnerabilidade moderada em `uuid`, via `exceljs` | aberto, sem exposição | quando o `exceljs` atualizar |
| 6. O layout extraído carrega categorias do exemplo | aberto — contornado | no extrator, se o modelo mudar |

## 1. A fidelidade do `.xlsx` só se confirma abrindo os dois lado a lado

**Situação:** o layout foi extraído do modelo real — nomes de folha, faixas de
merge, larguras de coluna e rótulos fixos — e o renderizador o reconstrói
célula a célula. Há teste conferindo as seis folhas, a ausência de fórmula, a
data como data, o crescimento além das 22 linhas e o total batendo com o
documento.

**O que os testes não conseguem afirmar:** que o arquivo *parece* com o modelo.
Fonte, negrito, borda, alinhamento vertical, altura de linha e área de
impressão não foram extraídos — o script leva geometria e texto, não estilo. O
documento sai correto e legível; não sai visualmente idêntico.

**Como resolver:** na primeira entrega real, abrir o gerado e o modelo lado a
lado, e anotar as diferenças que o órgão notar. Só então vale acrescentar
extração de estilo — antes disso seria trabalho contra uma lista imaginada.

**O que não fazer:** ajustar estilo por palpite. Cada propriedade a mais no
layout é uma a mais para regerar quando o modelo mudar.

## 2. O PDF não é pixel a pixel igual ao `.xlsx`

**Situação:** os dois saem do mesmo documento em memória, com os mesmos números
e os mesmos textos, mas o PDF é desenhado do zero pelo `pdfkit` — tabela com
largura própria, paginação própria, tipografia própria.

**Por que está assim:** converter o `.xlsx` com LibreOffice ou Chromium daria
fidelidade perfeita e custaria uns 400 MB na imagem Docker mais um subprocesso,
num VPS único que também roda banco e aplicação.

**Por que não é problema:** **o que vai ao órgão é o `.xlsx`.** O PDF serve ao
arquivo interno, à conferência e à assinatura física — usos em que "os mesmos
números, legíveis e assináveis" é exatamente o requisito.

**Quando revisitar:** se o órgão passar a exigir PDF. Aí a conta muda, e vale
pagar os 400 MB.

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

## 5. Vulnerabilidade moderada em `uuid`, herdada do `exceljs`

**Situação:** `npm audit` aponta uma vulnerabilidade moderada em `uuid`, que
chega como dependência do `exceljs` — a primeira dependência de produção nova
desde a Fase 1.

**Qual é a exposição:** o aviso vale para a chamada com um *buffer* fornecido
pelo chamador. O código deste projeto nunca gera UUID pelo `exceljs`, e o
`exceljs` só é usado para escrever a planilha da prestação a partir de dados do
próprio banco.

**O que fazer:** atualizar quando o `exceljs` publicar versão com a
dependência corrigida. Não vale trocar de biblioteca por causa disto.

**O que não confundir:** as outras vulnerabilidades que o `npm audit` lista em
produção (`next`, `postcss`, `sharp`, `prisma`, `@prisma/config`,
`deepmerge-ts`) **são anteriores** à Fase 3. O `pdfkit` não acrescentou nenhuma.

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
