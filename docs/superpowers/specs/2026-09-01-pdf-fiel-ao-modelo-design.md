# O PDF fiel ao modelo do órgão — design

A exportação passa a ser **só em PDF** — o `.xlsx` sai —, e o PDF passa a
reproduzir o modelo do órgão em vez de desenhar um layout próprio.

**O que está errado hoje:** o `.xlsx` reproduzia a *geometria* do modelo
(mesclas, larguras, posição dos rótulos) e nunca a *aparência* dele. As 1.074
células com borda do arquivo original nunca foram capturadas — nem pelo
extrator, nem por consequência pelo `.xlsx`, nem pelo PDF, que sempre desenhou
um layout inteiramente seu. Quem abre os dois lado a lado vê dois documentos
diferentes.

**O alvo é concreto e está no repositório de trabalho:**
`docs/convenio/Modelo Prestacao Contas.pdf` — seis páginas A4 retrato, com
fontes e sem imagem, que é o `.xlsx` do órgão impresso. É contra ele que a
fidelidade se confere.

## 1. O que este documento decide

| Decisão | Quem decidiu |
|---|---|
| A exportação em `.xlsx` sai por completo | o dono do projeto, 01/09/2026 |
| O CSV do contador **fica** | o dono do projeto, 01/09/2026 |
| Fidelidade de grade, bordas e hierarquia | o dono do projeto, 01/09/2026 |
| Tipografia aproximada pelas fontes embutidas do PDF | o dono do projeto, 01/09/2026 |
| Transbordo repete o cabeçalho da folha | o dono do projeto, 01/09/2026 |
| `layout-prestacao.ts` e o extrator **sobrevivem e crescem** | este documento |
| `exceljs` desce para dependência de desenvolvimento | este documento |
| A geometria vira módulo puro, testável sem pdfkit | este documento |
| A conferência visual é humana; a de geometria é automática | este documento |

## 2. O que sai, o que fica, o que nasce

### 2.1 Sai

- `src/modules/financeiro/xlsx-prestacao.ts` e `xlsx-prestacao.test.ts`
- O valor `'xlsx'` de `FormatoExportacao`, do mapa `MIME` e do array `FORMATOS`
  da rota `/api/prestacoes/[id]/[formato]`
- O link "Baixar .xlsx" de `src/app/(app)/financeiro/prestacoes/page.tsx`
- As asserções sobre `.xlsx` em `exportar.test.ts`

`/api/prestacoes/<id>/xlsx` passa a devolver 404, pelo mesmo caminho que já
recusa qualquer formato desconhecido.

### 2.2 Desce de nível

`exceljs` vai de `dependencies` para `devDependencies`. O servidor deixa de
precisar dele; o extrator, que roda à mão, continua precisando para ler o
modelo do órgão.

Consequência a verificar durante a implementação: o `override` de `uuid` no
`package.json` existia por causa do `exceljs`. Com ele fora da árvore de
produção, o override provavelmente pode sair também — **confirme com
`npm run auditoria` antes de remover**, e mantenha se ainda houver aviso.

### 2.3 Fica e cresce

`layout-prestacao.ts` e `scripts/extrair-layout-prestacao.ts` **não são
apagados**. Eles deixam de servir ao `.xlsx` e passam a ser a base da
fidelidade do PDF.

### 2.4 Nasce

Dois módulos, com a mesma separação que `tendencia.ts` e o componente do
gráfico já usam neste projeto — regra pura de um lado, desenho do outro:

- **`grade-prestacao.ts`**: converte o layout em caixas de página. Sem pdfkit,
  sem banco, sem I/O. É onde a aritmética mora e onde ela é testada.
- O renderizador dentro de `pdf-prestacao.ts`, reescrito: recebe as caixas e
  desenha bordas e texto.

## 3. O layout ampliado

O tipo `LayoutFolha` hoje é `{ nome, merges, larguras, rotulos, faixaDados }`.
Ganha quatro dimensões:

```ts
export type EstiloBorda = 'thin' | 'medium' | 'thick' | 'double' | 'hair'

export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  rotulos: Record<string, string>
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }

  /** Altura em pontos. Linha sem altura declarada usa `alturaPadrao`. */
  alturas: { linha: number; altura: number }[]
  alturaPadrao: number

  /** Célula → os lados que têm borda, e o estilo de cada um. */
  bordas: Record<string, { topo?: EstiloBorda; esquerda?: EstiloBorda; baixo?: EstiloBorda; direita?: EstiloBorda }>

  /** Célula → tipografia. `familia` é o nome do original, mapeado no desenho. */
  fontes: Record<string, { familia: string; tamanho: number; negrito: boolean; italico: boolean }>

  /** Célula → alinhamento. */
  alinhamentos: Record<string, { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'middle' | 'bottom'; quebra?: boolean }>

  /** Margens de impressão da folha, em pontos. Diferem entre folhas. */
  margens: { esquerda: number; direita: number; topo: number; baixo: number }
}
```

**A barreira de dados não se mexe.** O extrator continua recolhendo só
geometria, estilo e rótulo fixo — nenhum valor da faixa de dados. O teste que
prova que nenhum CPF ou CNPJ escapou continua valendo, e passa a varrer também
os campos novos: um `Record` de bordas não pode conter texto, e um de fontes
não pode conter nome de pessoa.

## 4. Da planilha para a página

### 4.1 A conversão, e por que ela fecha

O modelo é **A4 retrato, escala 100%**, sem "ajustar à página" — conferido no
`pageSetup` das seis folhas. Então a grade não é reescalada: cada célula tem
um tamanho absoluto em pontos.

**Coluna.** O Excel mede largura em caracteres. A conversão do OOXML, para a
fonte padrão de 11pt, é `pixels = largura × 7 + 5`, e o PDF mede em pontos a
72 por polegada contra os 96 da tela:

```
pontos = (largura × 7 + 5) × 0,75
```

Todas as doze colunas do modelo têm largura 8,14, o que dá **46,49 pt** cada,
e **557,8 pt** somadas. A largura útil da capa é `595 − 2 × 17 = 561 pt`.
Cabe, com três pontos de folga. Isso não é coincidência: a planilha foi
desenhada para caber na A4, e é a confirmação de que a conversão está certa.

**São doze colunas, e não o que o `columnCount` diz.** O ExcelJS relata
`columnCount` de 12 a 20 conforme a folha, mas isso conta coluna formatada e
vazia. Medido: em todas as seis folhas, **a última coluna com conteúdo e a
última com borda são a 12**. O extrator recolhe até a última coluna com
conteúdo ou borda, e não até o `columnCount` — recolher até 20 acrescentaria
oito colunas vazias que estourariam a largura da página.

**Linha.** A altura de linha do Excel **já é em pontos** — nada a converter.
Linha sem altura declarada usa o `alturaPadrao` da folha (13,5 na capa, 14,25
na contra-capa, 12,75 nas de lançamento).

**Margens.** Vêm em polegadas e diferem por folha: a capa usa 0,236″ nas
laterais e 0,394″ em cima e embaixo; as folhas de lançamento usam 0,25″ e
0,75″. Multiplicadas por 72, viram pontos.

### 4.2 O módulo puro

```ts
export type Caixa = { x: number; y: number; largura: number; altura: number }

/** A caixa de uma célula ou de uma faixa mesclada, em pontos de página. */
export function caixaDa(layout: LayoutFolha, celula: string): Caixa

/** Quantas linhas da faixa de dados cabem antes de estourar a página. */
export function linhasQueCabem(layout: LayoutFolha, primeiraLinha: number): number

/** A faixa mesclada que contém a célula, ou ela mesma. */
export function faixaDe(layout: LayoutFolha, celula: string): string
```

**Medido, não suposto.** O pdfkit expõe a página com origem no canto superior
esquerdo e `y` crescendo para baixo — a mesma direção da planilha. Confirmado
lendo o content stream de um PDF mínimo: a biblioteca já abre com
`1 0 0 -1 0 841.89 cm`, o flip vertical, antes de expor coordenadas a quem
chama. A documentação do formato PDF descreve a origem crua como o canto
inferior esquerdo, mas o pdfkit não expõe esse eixo — e não há inversão
nenhuma a fazer no módulo puro.

## 5. O renderizador

Para cada folha, desenha na ordem: bordas, depois texto. Bordas antes para que
o texto nunca fique por baixo de uma linha.

**Bordas.** Cada lado com estilo vira um segmento. Uma célula mesclada desenha
a borda do seu perímetro, não das células internas.

**O modelo usa um estilo só.** Medido: 1.431 lados com borda nas seis folhas,
**todos `thin`, todos na cor padrão** — nenhum `medium`, `thick`, `double` ou
`hair`, nenhuma cor própria. Então o renderizador precisa de uma espessura
(0,5 pt) e de uma cor (preto) para ficar fiel hoje.

A tabela de espessuras abaixo existe mesmo assim, porque o extrator lê o que
estiver no arquivo e um modelo revisado pode trazer outro estilo — mas os
valores diferentes de `thin` são **caminho não exercitado**, e o teste que os
cobre é sintético, não vem do modelo:

| estilo | espessura |
|---|---|
| `hair` | 0,25 pt |
| `thin` | 0,5 pt — o único que o modelo usa |
| `medium` | 1 pt |
| `thick` | 1,5 pt |
| `double` | duas linhas de 0,5 pt, separadas por 1 pt |

**Texto.** Cada rótulo e cada valor é desenhado na caixa da sua célula, com o
alinhamento dela. Texto que não cabe na largura da caixa é reduzido até caber
ou quebrado, conforme o `quebra` do alinhamento — nunca transborda para a
célula vizinha.

**Tipografia.** As cinco famílias do modelo mapeadas para as fontes embutidas
do PDF, sem embutir arquivo e sem questão de licença:

| No modelo | No PDF |
|---|---|
| Arial | Helvetica |
| Calibri | Helvetica |
| Times New Roman | Times-Roman |
| Algerian | Times-Bold |
| qualquer outra | Helvetica |

Negrito e itálico usam a variante correspondente. **Tamanho e peso são
preservados exatamente**; só o desenho das letras difere. É a decisão do dono
do projeto, e o §9 registra o que ela custa.

## 6. Transbordo

O modelo tem uma página por folha, com 22 linhas na faixa de dados de Despesas
e de Receitas. Quando o mês tem mais lançamentos do que cabe:

1. a faixa cresce até a última linha que couber na página;
2. a próxima linha abre página nova;
3. a página nova **repete a faixa de cabeçalho da folha** — em Despesas, as
   linhas 1 a 10, com "Item, Credor, CNPJ/CPF, CH/OB, Data, Valor";
4. o rodapé — total, "Unidade Executora" e assinaturas — sai **só na última**.

**A folha nunca encolhe abaixo do modelo.** Um mês com três despesas continua
imprimindo as 22 linhas, as demais em branco com suas bordas, porque é o que o
órgão está acostumado a receber. Essa regra já existe no gerador atual e
sobrevive.

## 7. O apêndice não muda

Os anexos comprobatórios continuam sendo concatenados depois das folhas, na
ordem da folha de despesas, pulados em silêncio quando faltam. `juntarAnexos`
e `anexos-prestacao.ts` não são tocados — eles operam sobre o buffer pronto, e
não sabem como as folhas foram desenhadas.

A contagem de páginas do apêndice passa a depender do volume, porque as folhas
podem ser mais de seis. O teste que afere "sem anexo nenhum, a saída tem
exatamente as folhas de hoje" precisa deixar de cravar seis e passar a medir a
base antes — o teste da travessia E2E já faz assim.

## 8. Como se verifica

### 8.1 Por máquina — a geometria

- **A conversão**: largura 8,14 dá 46,49 pt; doze colunas cabem na largura útil
  de cada uma das seis folhas, com a margem daquela folha.
- **A caixa de uma célula mesclada** é a união das células, e não a primeira.
- **A linha 1 fica no alto da página**: sem inversão de eixo — o pdfkit já
  expõe `y` crescendo para baixo a partir do topo, igual à planilha.
- **Cada borda extraída vira um segmento desenhado** — a contagem de segmentos
  do PDF bate com a contagem de lados com estilo no layout.
- **O transbordo**: 22 lançamentos dão uma página; 60 dão três, com o cabeçalho
  repetido e o rodapé só na última.
- **A folha não encolhe**: três lançamentos ainda produzem as 22 linhas.

### 8.2 Por olho — e é humana

O PDF gerado, aberto lado a lado com `docs/convenio/Modelo Prestacao Contas.pdf`.

**Esta parte não pode ser automatizada nesta máquina**, e o documento registra
isso em vez de fingir: não há `poppler` instalado, então nem o modelo nem a
saída podem ser abertos como imagem pelo processo que implementa. A geometria
se prova contra o `.xlsx`, que é preciso e legível por máquina; a aparência se
confere olhando.

## 9. O que fica em aberto, de propósito

**As letras não são as do original.** O título da capa era Algerian 16 e passa
a ser Times negrito 16. Tamanho, peso e posição são idênticos; o desenho das
letras não. Foi decisão explícita, para não depender de embutir uma fonte do
Windows num documento distribuído — questão de licença antes de ser técnica.
Se o órgão recusar por isso, o caminho é obter os arquivos e o direito de
embuti-los, e o renderizador aceita a troca sem mudança estrutural.

**O layout continua carregando o exemplo preenchido.** É o item 6 das
pendências da Fase 3, e ele fica **mais importante** agora: o extrator passa a
recolher bordas, fontes e alinhamento de um arquivo que tem dados de outra
prestação. A barreira continua sendo recolher só estilo e rótulo fixo — mas há
mais superfície por onde algo alheio poderia passar, e o teste que varre isso
precisa crescer junto.

**Fidelidade não é conformidade.** Reproduzir a aparência do modelo não garante
que o órgão aceite o documento; garante que ele se pareça com o que eles
mandaram. A confirmação continua sendo da primeira entrega real.

## 10. Fora de escopo

- **Embutir as fontes originais.** Ver §9.
- **Reescrever o extrator para outro formato de modelo.** Ele lê `.xlsx`
  porque é o que o órgão distribui.
- **Converter `.xlsx` em PDF com um conversor externo.** É o que a pendência 2
  da Fase 3 recusou ao aceitar os 400 MB de um LibreOffice; a decisão não muda.
- **O CSV do contador.** Fica exatamente como está.
- **O apêndice dos anexos.** Ver §7.
