import PDFDocument from 'pdfkit'
import type { DocumentoPrestacao } from './documento-prestacao'
import { LAYOUT, type LayoutFolha, type EstiloBorda } from './layout-prestacao'
import { caixaDa, faixaDe, xDaColuna, yDaLinha, alturaDaLinha, linhasQueCabem } from './grade-prestacao'
import { formatarData, formatarMoeda } from '@/lib/ptbr'

/**
 * O modelo do órgão, desenhado célula a célula para impressão e assinatura.
 *
 * **É o único formato que vai ao órgão desde 01/09/2026** — o `.xlsx` saiu
 * (ver o cabeçalho de `exportar.ts`). Este renderizador não desenha mais
 * texto corrido a partir de uma margem fixa: ele lê a grade extraída do
 * modelo (`layout-prestacao.ts`) e a geometria pura que a converte em pontos
 * de PDF (`grade-prestacao.ts`), e desenha cada rótulo na caixa da sua
 * célula, com as bordas do original.
 *
 * `pdfkit`, e não conversão do modelo `.xlsx`: converter com LibreOffice ou
 * Chromium daria fidelidade perfeita e custaria uns 400 MB na imagem Docker
 * mais um subprocesso, num VPS único.
 *
 * As fontes são as cinco embutidas do PDF que `fonteDoPdf` mapeia a partir
 * das do modelo — nenhum arquivo de fonte a embarcar. Elas usam WinAnsi, que
 * cobre os acentos do português; o teste da capa confere um trecho acentuado
 * decodificado de volta do PDF.
 */

type Doc = InstanceType<typeof PDFDocument>

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

type LadoBorda = 'topo' | 'baixo' | 'esquerda' | 'direita'
/** Um traço a desenhar: início, fim e o estilo da borda que ele representa. */
type Segmento = [x1: number, y1: number, x2: number, y2: number, estilo: EstiloBorda]

/** "B33" -> { coluna: 2, linha: 33 }. Espelha `partesDa`, privada em grade-prestacao.ts. */
function partesDaCelula(celula: string): { coluna: number; linha: number } {
  const [, letras, digitos] = celula.match(/^([A-Z]+)(\d+)$/) ?? []
  if (!letras || !digitos) throw new Error(`Célula fora do formato: ${celula}`)
  let coluna = 0
  for (const letra of letras) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return { coluna, linha: Number(digitos) }
}

/** { coluna: 2, linha: 33 } -> "B33". O inverso de `partesDaCelula`. */
function celulaDaParte(coluna: number, linha: number): string {
  let c = coluna
  let letras = ''
  while (c > 0) {
    const resto = (c - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    c = Math.floor((c - 1) / 26)
  }
  return `${letras}${linha}`
}

/**
 * Agrupa uma sequência de estilos (um por célula do perímetro, na ordem) em
 * trechos contíguos de mesmo estilo. `undefined` fecha o trecho corrente sem
 * abrir um novo. É o rastreamento de extensão: em vez de perguntar "esse
 * lado aparece em alguma célula da faixa?", pergunta "em quais células,
 * exatamente, ele aparece?" — e cada resposta contígua vira um trecho.
 */
function trechosContiguos(
  estilos: (EstiloBorda | undefined)[]
): { de: number; ate: number; estilo: EstiloBorda }[] {
  const trechos: { de: number; ate: number; estilo: EstiloBorda }[] = []
  let de = -1
  let atual: EstiloBorda | undefined

  estilos.forEach((estilo, indice) => {
    if (atual && estilo === atual) return
    if (atual) trechos.push({ de, ate: indice - 1, estilo: atual })
    atual = estilo
    de = atual ? indice : -1
  })
  if (atual) trechos.push({ de, ate: estilos.length - 1, estilo: atual })

  return trechos
}

/** As coordenadas do traço para um trecho contíguo de um lado do perímetro. */
function segmentoDoTrecho(
  layout: LayoutFolha,
  lado: LadoBorda,
  celulaInicio: { coluna: number; linha: number },
  celulaFim: { coluna: number; linha: number },
  estilo: EstiloBorda
): Segmento {
  if (lado === 'topo' || lado === 'baixo') {
    const x1 = xDaColuna(layout, celulaInicio.coluna)
    const x2 = xDaColuna(layout, celulaFim.coluna + 1)
    const y =
      lado === 'topo'
        ? yDaLinha(layout, celulaInicio.linha)
        : yDaLinha(layout, celulaInicio.linha + 1)
    return [x1, y, x2, y, estilo]
  }

  const y1 = yDaLinha(layout, celulaInicio.linha)
  const y2 = yDaLinha(layout, celulaFim.linha + 1)
  const x =
    lado === 'esquerda'
      ? xDaColuna(layout, celulaInicio.coluna)
      : xDaColuna(layout, celulaInicio.coluna + 1)
  return [x, y1, x, y2, estilo]
}

/**
 * Os segmentos de borda da folha, rastreando a extensão real de cada lado —
 * não a união simples por OR.
 *
 * O Excel guarda a borda de uma caixa mesclada espalhada pelas células do
 * perímetro, não inteira na âncora: numa faixa `A1:L2`, `A1` carrega `topo` e
 * `esquerda`, mas `direita` mora em `L1`/`L2`. Por isso o percurso é sempre
 * pelo perímetro inteiro da faixa (célula a célula, lado a lado), nunca só
 * pela âncora sozinha.
 *
 * **A versão anterior parava aí**: unia por OR simples, e desenhava um traço
 * do começo ao fim da caixa sempre que o lado aparecia em QUALQUER célula do
 * perímetro. Essa suposição — presença em uma célula cobre o perímetro
 * inteiro — quebra em `3-Despesas`/`4-Receitas B33:G33`: medido na XML crua
 * do `.xlsx` do órgão, `B33:E33` têm `borderId=14` com topo, mas `F33:G33`
 * têm `borderId=5`, sem topo. É borda parcial de verdade, não ruído de
 * extração — e a união por OR desenharia o traço esticado até `G`, tinta que
 * o modelo não tem.
 *
 * Esta versão percorre cada lado do perímetro célula a célula e agrupa em
 * trechos contíguos de mesmo estilo (`trechosContiguos`) — o traço de
 * `B33:G33 topo` sai de `B` a `E` e para, porque é onde o modelo para. Onde
 * o lado cobre o perímetro inteiro com um único estilo (as três folhas já
 * desenhadas hoje: capa, contra-capa, encerramento), o único trecho é o
 * perímetro inteiro, e o segmento sai idêntico ao que a união por OR já
 * desenhava — o rastreamento não muda essas folhas, só as que têm borda
 * parcial de verdade.
 */
function segmentosDeBorda(layout: LayoutFolha): Segmento[] {
  const segmentos: Segmento[] = []
  const ancoras = new Set(Object.keys(layout.bordas).map((celula) => faixaDe(layout, celula)))

  for (const ancora of ancoras) {
    const [inicio, fim] = ancora.includes(':') ? ancora.split(':') : [ancora, ancora]
    const a = partesDaCelula(inicio)
    const b = partesDaCelula(fim)

    const colunas = Array.from({ length: b.coluna - a.coluna + 1 }, (_, i) => a.coluna + i)
    const linhas = Array.from({ length: b.linha - a.linha + 1 }, (_, i) => a.linha + i)

    const perimetros: { lado: LadoBorda; celulas: { coluna: number; linha: number }[] }[] = [
      { lado: 'topo', celulas: colunas.map((coluna) => ({ coluna, linha: a.linha })) },
      { lado: 'baixo', celulas: colunas.map((coluna) => ({ coluna, linha: b.linha })) },
      { lado: 'esquerda', celulas: linhas.map((linha) => ({ coluna: a.coluna, linha })) },
      { lado: 'direita', celulas: linhas.map((linha) => ({ coluna: b.coluna, linha })) },
    ]

    for (const { lado, celulas } of perimetros) {
      const estilos = celulas.map((c) => layout.bordas[celulaDaParte(c.coluna, c.linha)]?.[lado])
      for (const trecho of trechosContiguos(estilos)) {
        segmentos.push(
          segmentoDoTrecho(layout, lado, celulas[trecho.de], celulas[trecho.ate], trecho.estilo)
        )
      }
    }
  }

  return segmentos
}

/**
 * Desenha uma folha do modelo: bordas primeiro, texto depois.
 *
 * Bordas antes de propósito — um texto desenhado antes ficaria por baixo da
 * linha da célula seguinte.
 *
 * As coordenadas de `caixaDa` já vêm no sistema de eixos do pdfkit: origem
 * no canto superior esquerdo, `y` crescendo para baixo — a mesma direção da
 * planilha. Não há inversão de eixo a fazer aqui; ver o comentário de
 * `yDaLinha` em `grade-prestacao.ts` sobre como isso foi medido.
 *
 * Exportada para o teste desenhar uma folha isolada, sem passar pelo
 * documento inteiro: a partir de Despesas e Receitas, o buffer de
 * `gerarPdfPrestacao` já não serve para isolar segmentos de uma folha só,
 * porque mais de uma desenha conteúdo de verdade.
 */
export function desenharFolha(
  doc: Doc,
  layout: LayoutFolha,
  valores: Record<string, string>
): void {
  for (const [x1, y1, x2, y2, estilo] of segmentosDeBorda(layout)) {
    doc.lineWidth(ESPESSURA[estilo]).moveTo(x1, y1).lineTo(x2, y2).stroke()
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
      .text(texto, c.x + 2, c.y + 2, {
        width: c.largura - 4,
        height: c.altura,
        align: alinhamento?.horizontal ?? 'left',
        lineBreak: alinhamento?.quebra ?? false,
        ellipsis: true,
      })
  }
}

/**
 * Um recorte do layout, limitado às linhas `[deLinha, ateLinha]`.
 *
 * `alturas`, `larguras` e `margens` ficam intactas de propósito: a posição
 * de uma linha (`yDaLinha`, em `grade-prestacao.ts`) é a soma acumulada das
 * alturas desde a linha 1, então cortar `alturas` fora do recorte moveria
 * tudo para cima. Só `merges`, `rótulos`, `bordas`, `fontes` e
 * `alinhamentos` — o que é célula, não geometria de página — é filtrado.
 *
 * É o que permite `desenharFolha` redesenhar só um pedaço da folha: o
 * cabeçalho numa página de transbordo, uma linha de dado por vez, o rodapé —
 * sem duplicar a lógica de bordas e texto que ela já tem.
 */
function recorteDeLinhas(layout: LayoutFolha, deLinha: number, ateLinha: number): LayoutFolha {
  const linhaDaCelula = (celula: string) => Number(/\d+/.exec(celula)![0])
  const dentro = (celula: string) => {
    const linha = linhaDaCelula(celula)
    return linha >= deLinha && linha <= ateLinha
  }
  const filtrar = <T,>(registro: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(registro).filter(([celula]) => dentro(celula)))

  return {
    ...layout,
    merges: layout.merges.filter((faixa) => {
      const [inicio, fim] = faixa.split(':')
      return dentro(inicio) && dentro(fim)
    }),
    rotulos: filtrar(layout.rotulos),
    bordas: filtrar(layout.bordas),
    fontes: filtrar(layout.fontes),
    alinhamentos: filtrar(layout.alinhamentos),
    faixaDados: undefined,
  }
}

/**
 * O cabeçalho da folha de lançamentos: linhas 1 até a última antes da faixa
 * de dados — órgão destinatário, "DESPESAS"/"RECEITAS" e a régua de colunas
 * ("Item", "Credor", "CNPJ/CPF", "CH/OB", "Data", "Valor (R$)").
 *
 * Redesenhado em toda página de transbordo: sem ele, quem folheia a página 4
 * não sabe que coluna está lendo.
 */
function recorteDeCabecalho(layout: LayoutFolha): LayoutFolha {
  return recorteDeLinhas(layout, 1, layout.faixaDados!.primeiraLinha - 1)
}

/** Os valores do cabeçalho de uma folha de lançamentos. */
function valoresDoCabecalho(documento: DocumentoPrestacao): Record<string, string> {
  return {
    A1: documento.oficio.orgaoDestinatario,
    A6: documento.capa.razaoSocial,
  }
}

/**
 * Uma linha de despesa ou receita, já no formato comum que a folha desenha —
 * mesma forma que `montarFolhaDeLancamentos` usava no gerador do `.xlsx`
 * (`git show master:src/modules/financeiro/xlsx-prestacao.ts`), de onde as
 * posições de coluna abaixo foram recuperadas.
 */
type LinhaDeLancamento = {
  descricao: string
  documento: string
  complemento: string
  data: Date
  valor: number
}

function linhasDeDespesas(documento: DocumentoPrestacao): LinhaDeLancamento[] {
  return documento.despesas.map((despesa) => ({
    descricao: despesa.credor,
    documento: despesa.documento,
    complemento: despesa.formaPagamento,
    data: despesa.data,
    valor: despesa.valor,
  }))
}

function linhasDeReceitas(documento: DocumentoPrestacao): LinhaDeLancamento[] {
  return documento.receitas.map((receita) => ({
    descricao: receita.origem,
    documento: receita.documento,
    complemento: '',
    data: receita.data,
    valor: receita.valor,
  }))
}

/**
 * Uma linha da faixa de dados: item, credor/origem, documento, forma de
 * pagamento (só quando há uma — "CH/OB" fica em branco em receitas), data e
 * valor, nas colunas que o gerador da planilha já tinha resolvido: `A`
 * (item), `B:E` (credor), `F:G` (documento), `H` (complemento), `I:J`
 * (data), `K:L` (valor).
 *
 * `linha` ausente é uma linha em branco: o modelo nunca encolhe abaixo das
 * vinte e duas linhas, e a borda da grade sai mesmo sem dado — só o texto
 * que falta.
 */
function desenharLinhaDeDado(
  doc: Doc,
  layout: LayoutFolha,
  numeroDaLinha: number,
  indiceGlobal: number,
  linha: LinhaDeLancamento | undefined
): void {
  const recorte = recorteDeLinhas(layout, numeroDaLinha, numeroDaLinha)
  const valores: Record<string, string> = {}

  if (linha) {
    valores[`A${numeroDaLinha}`] = String(indiceGlobal + 1)
    valores[`B${numeroDaLinha}`] = linha.descricao
    valores[`F${numeroDaLinha}`] = linha.documento
    if (linha.complemento) valores[`H${numeroDaLinha}`] = linha.complemento
    valores[`I${numeroDaLinha}`] = formatarData(linha.data)
    valores[`K${numeroDaLinha}`] = formatarMoeda(linha.valor)
  }

  desenharFolha(doc, recorte, valores)
}

/**
 * O rodapé de uma folha de lançamentos: total, "Unidade Executora" e as duas
 * assinaturas — sai só na última página, depois da última linha de dado.
 *
 * As posições vêm do mesmo gerador: o total ancora em `J`, não em `K` como
 * as linhas de dado (a faixa do total é `J33:L33`, a da linha é `K11:L11`;
 * escrever em `K` poria o número numa célula secundária do merge, que o
 * pdfkit também descartaria — `caixaDa` resolve pela âncora). A razão social
 * vai para `B`, uma linha abaixo do total; presidente e tesoureiro, quatro
 * linhas abaixo, em `A` e `G`. Os rótulos fixos do modelo ("Total", "Unidade
 * Executora:", as linhas de assinatura, "Presidente"/"Tesoureiro") já vêm do
 * `layout.rotulos` do recorte — não precisam ser repetidos aqui.
 */
function desenharRodape(
  doc: Doc,
  layout: LayoutFolha,
  documento: DocumentoPrestacao,
  linhas: LinhaDeLancamento[]
): void {
  const { ultimaLinha } = layout.faixaDados!
  const linhaTotal = ultimaLinha + 1
  const total = linhas.reduce((soma, linha) => soma + linha.valor, 0)

  const recorte = recorteDeLinhas(layout, linhaTotal, linhaTotal + 5)
  desenharFolha(doc, recorte, {
    [`J${linhaTotal}`]: formatarMoeda(total),
    [`B${linhaTotal + 1}`]: documento.capa.razaoSocial,
    [`A${linhaTotal + 4}`]: documento.oficio.presidente,
    [`G${linhaTotal + 4}`]: documento.oficio.tesoureiro,
  })
}

/**
 * Uma folha cuja faixa de dados cresce com o volume — despesas e receitas.
 *
 * **Nunca encolhe abaixo do modelo.** Um mês com três lançamentos imprime as
 * vinte e duas linhas, as demais em branco com suas bordas: é o que o órgão
 * está acostumado a receber, e a regra vem do gerador da planilha que saiu.
 *
 * **Transborda repetindo o cabeçalho.** Quando a página enche, abre página e
 * redesenha o cabeçalho da folha — as linhas que trazem "Item, Credor,
 * CNPJ/CPF, Data, Valor". Sem isso, quem folheia a página 4 não sabe que
 * coluna está lendo. O rodapé com total e assinaturas sai só na última.
 *
 * A numeração do "Item" é global, não por página: o lançamento 23 continua
 * contando a partir do 22 da página anterior, não reinicia em 1.
 *
 * Exportada pelo mesmo motivo que `desenharFolha`: o teste de extensão da
 * borda parcial de `B33:G33` precisa isolar só Despesas, sem Receitas
 * desenhando no mesmo buffer.
 */
export function desenharFolhaDeLancamentos(
  doc: Doc,
  layout: LayoutFolha,
  documento: DocumentoPrestacao,
  linhas: LinhaDeLancamento[]
): void {
  const { primeiraLinha, ultimaLinha } = layout.faixaDados!
  const doModelo = ultimaLinha - primeiraLinha + 1
  const usadas = Math.max(linhas.length, doModelo)
  const alturaLinha = alturaDaLinha(layout, primeiraLinha)
  const porPagina = Math.min(doModelo, linhasQueCabem(layout, primeiraLinha, alturaLinha))

  if (porPagina <= 0) {
    throw new Error(`Layout ${layout.nome}: nenhuma linha de dado cabe na página`)
  }

  for (let inicio = 0; inicio < usadas; inicio += porPagina) {
    if (inicio > 0) doc.addPage()

    desenharFolha(doc, recorteDeCabecalho(layout), valoresDoCabecalho(documento))

    for (let i = 0; i < porPagina; i++) {
      const indiceGlobal = inicio + i
      desenharLinhaDeDado(doc, layout, primeiraLinha + i, indiceGlobal, linhas[indiceGlobal])
    }

    const ultimaFatia = inicio + porPagina >= usadas
    if (ultimaFatia) desenharRodape(doc, layout, documento, linhas)
  }
}

/** A linha de uma célula do modelo — só os dígitos de "A20", sem a coluna. */
function linhaDaCelula(celula: string): number {
  return partesDaCelula(celula).linha
}

/**
 * Traduz a aparência de uma linha do modelo — bordas, fontes, alinhamentos e
 * as faixas mescladas que a ancoram — para a linha onde a conciliação
 * realmente a desenha.
 *
 * A conciliação é composta, não copiada: o volume real de origens de receita
 * e de despesas quase nunca cai na mesma linha do exemplo que o layout
 * extraiu, então a posição de saída (`linhaAlvo`) e a linha de onde o estilo
 * vem (`linhaModelo`) são números diferentes na maioria das folhas. `rotulos`
 * sai vazio de propósito — herdar texto do modelo aqui reabriria a fuga de
 * conteúdo alheio que esta folha existe para fechar; quem chama fornece o
 * texto de cada célula por fora, em `valores`.
 *
 * Exportada para o teste chamar esta função sozinha e conferir `rotulos`
 * vazio direto no retorno — a camada interna da garantia anti-vazamento,
 * sem passar por `desenharFolha`/`valores` (a camada externa, que já tem
 * teste próprio e não deve ser a única a detectar uma regressão aqui).
 */
export function linhaTraduzida(layout: LayoutFolha, linhaModelo: number, linhaAlvo: number): LayoutFolha {
  const traduzir = <T,>(registro: Record<string, T>): Record<string, T> => {
    const resultado: Record<string, T> = {}
    for (const [celula, valor] of Object.entries(registro)) {
      const partes = partesDaCelula(celula)
      if (partes.linha !== linhaModelo) continue
      resultado[celulaDaParte(partes.coluna, linhaAlvo)] = valor
    }
    return resultado
  }

  const traduzirFaixa = (faixa: string): string | null => {
    const [inicio, fim] = faixa.split(':')
    if (linhaDaCelula(inicio) !== linhaModelo || linhaDaCelula(fim) !== linhaModelo) return null
    const a = partesDaCelula(inicio)
    const b = partesDaCelula(fim)
    return `${celulaDaParte(a.coluna, linhaAlvo)}:${celulaDaParte(b.coluna, linhaAlvo)}`
  }

  return {
    ...layout,
    merges: layout.merges.map(traduzirFaixa).filter((faixa): faixa is string => faixa !== null),
    rotulos: {},
    bordas: traduzir(layout.bordas),
    fontes: traduzir(layout.fontes),
    alinhamentos: traduzir(layout.alinhamentos),
    faixaDados: undefined,
  }
}

/** Desenha uma linha da conciliação com o estilo de `linhaModelo`, na posição `linhaAlvo`. */
function desenharLinhaComposta(
  doc: Doc,
  layout: LayoutFolha,
  linhaModelo: number,
  linhaAlvo: number,
  valores: Record<string, string>
): void {
  desenharFolha(doc, linhaTraduzida(layout, linhaModelo, linhaAlvo), valores)
}

/** Os valores do cabeçalho da conciliação: dados bancários e o período. */
function valoresDoCabecalhoDaConciliacao(documento: DocumentoPrestacao): Record<string, string> {
  const { conciliacao } = documento
  return {
    A1: documento.capa.razaoSocial,
    A7: `Período de ${formatarData(conciliacao.periodo.de)} a ${formatarData(conciliacao.periodo.ate)}`,
    A10: conciliacao.banco,
    E10: conciliacao.agencia,
    I10: conciliacao.conta,
  }
}

/**
 * A conciliação: a única folha composta do modelo — suas linhas dependem de
 * quantas origens de receita e quantas despesas a competência teve.
 *
 * **Composta, nunca copiada.** O layout extraído traz, da linha 13 em diante,
 * o exemplo preenchido de outra prestação — as categorias "Salário",
 * "Diária", "Taxa bancária", "Serviço reforma cozinha" de outra instituição.
 * São genéricas, e por isso passaram pela barreira de CPF/CNPJ do extrator,
 * mas continuam sendo conteúdo alheio. Por isso `desenharLinhaComposta` nunca
 * herda `layout.rotulos` na zona dinâmica: cada rótulo legítimo (`rotulo`,
 * abaixo) é lido de uma célula fixa do modelo, mas colocado na linha que o
 * volume real calcula, nunca na linha onde o exemplo o deixou.
 *
 * **A ordem é a de `montarConciliacao`** em
 * `git show master:src/modules/financeiro/xlsx-prestacao.ts`, o gerador da
 * planilha que saiu: saldo anterior, recebimentos (uma linha por origem),
 * total de saldo mais receitas, despesas (cabeçalho credor/categoria, uma
 * linha por despesa), total de despesas, saldo disponível, unidade executora
 * e as assinaturas invertidas — tesoureiro à esquerda, presidente à direita,
 * o oposto do rodapé das folhas de lançamento.
 *
 * **Os intervalos do modelo** (recebimentos entre as linhas 15 e 18,
 * despesas entre 24 e 46) vêm de `layout.merges`: são as faixas `B15:F15` a
 * `B18:F18`, e `B24:E24` a `B46:E46`. Uma linha que passe do fim desse
 * intervalo herda o estilo da última — é a mesma célula que fecha a caixa no
 * modelo, só repetida.
 */
export function desenharConciliacao(
  doc: Doc,
  layout: LayoutFolha,
  documento: DocumentoPrestacao
): void {
  const { conciliacao: dados } = documento
  const rotulo = (celula: string) => layout.rotulos[celula] ?? ''

  desenharFolha(
    doc,
    recorteDeLinhas(layout, 1, 12),
    valoresDoCabecalhoDaConciliacao(documento)
  )

  let linha = 13

  desenharLinhaComposta(doc, layout, 13, linha, {
    [`A${linha}`]: rotulo('A13'),
    [`J${linha}`]: formatarMoeda(dados.saldoAnterior),
  })
  linha++

  desenharLinhaComposta(doc, layout, 14, linha, {
    [`A${linha}`]: rotulo('A14'),
    [`J${linha}`]: formatarMoeda(dados.totalReceitas),
  })
  linha++

  const primeiraLinhaRecebimento = 15
  const ultimaLinhaRecebimentoDoModelo = 18
  dados.recebimentosPorOrigem.forEach((recebimento, indice) => {
    const linhaModelo = Math.min(primeiraLinhaRecebimento + indice, ultimaLinhaRecebimentoDoModelo)
    desenharLinhaComposta(doc, layout, linhaModelo, linha, {
      [`B${linha}`]: recebimento.rotulo,
      [`J${linha}`]: formatarMoeda(recebimento.valor),
    })
    linha++
  })

  linha++ // linha em branco, como o gerador da planilha deixava antes do total
  desenharLinhaComposta(doc, layout, 20, linha, {
    [`A${linha}`]: rotulo('A20'),
    [`J${linha}`]: formatarMoeda(dados.saldoAnterior + dados.totalReceitas),
  })
  linha += 2

  desenharLinhaComposta(doc, layout, 22, linha, {
    [`A${linha}`]: rotulo('A22'),
  })
  linha++

  // B23 vem em branco no modelo; a coluna é a do credor, texto fixo aqui.
  desenharLinhaComposta(doc, layout, 23, linha, {
    [`B${linha}`]: 'Credor',
    [`F${linha}`]: rotulo('F23'),
  })
  linha++

  const primeiraLinhaDespesa = 24
  const ultimaLinhaDespesaDoModelo = 46
  dados.despesasDetalhadas.forEach((despesa, indice) => {
    const linhaModelo = Math.min(primeiraLinhaDespesa + indice, ultimaLinhaDespesaDoModelo)
    desenharLinhaComposta(doc, layout, linhaModelo, linha, {
      [`B${linha}`]: despesa.credor,
      [`F${linha}`]: despesa.categoria,
      [`J${linha}`]: formatarMoeda(despesa.valor),
    })
    linha++
  })

  linha++ // linha em branco, como o gerador da planilha deixava antes do total
  desenharLinhaComposta(doc, layout, 47, linha, {
    [`A${linha}`]: rotulo('A47'),
    [`J${linha}`]: formatarMoeda(dados.totalDespesas),
  })
  linha += 2

  desenharLinhaComposta(doc, layout, 49, linha, {
    [`A${linha}`]: rotulo('A49'),
    [`J${linha}`]: formatarMoeda(dados.saldoDisponivel),
  })
  linha += 2

  desenharLinhaComposta(doc, layout, 51, linha, {
    [`A${linha}`]: rotulo('A51'),
    [`B${linha}`]: documento.capa.razaoSocial,
  })
  linha += 3

  // A conciliação assina na ordem inversa das folhas de lançamento: tesoureiro
  // à esquerda, presidente à direita. É como o modelo faz.
  desenharLinhaComposta(doc, layout, 54, linha, {
    [`A${linha}`]: rotulo('A54'),
    [`G${linha}`]: rotulo('G54'),
  })
  desenharLinhaComposta(doc, layout, 55, linha + 1, {
    [`A${linha + 1}`]: documento.oficio.tesoureiro,
    [`G${linha + 1}`]: documento.oficio.presidente,
  })
  desenharLinhaComposta(doc, layout, 56, linha + 2, {
    [`A${linha + 2}`]: rotulo('A56'),
    [`G${linha + 2}`]: rotulo('G56'),
  })
}

/** Os valores da capa: célula do modelo → texto desta prestação. */
function valoresDaCapa(documento: DocumentoPrestacao): Record<string, string> {
  return {
    A1: documento.capa.razaoSocial,
    A3: `CNPJ: ${documento.capa.cnpj} - ${documento.capa.endereco}`,
    A23: documento.capa.mesPorExtenso.toUpperCase(),
    A29: String(documento.capa.ano),
    A51: `Conta Corrente nº ${documento.capa.conta}`,
  }
}

/** Os valores da contra-capa: o ofício de encaminhamento e as assinaturas. */
function valoresDaContraCapa(documento: DocumentoPrestacao): Record<string, string> {
  return {
    A1: documento.capa.razaoSocial,
    A5: `${documento.oficio.cidade}, ${documento.oficio.dataPorExtenso}.`,
    A8: documento.oficio.orgaoDestinatario,
    A16: documento.oficio.texto,
    A39: documento.oficio.presidente,
    G39: documento.oficio.tesoureiro,
  }
}

/** Os valores do encerramento: a declaração de guarda e as assinaturas. */
function valoresDoEncerramento(documento: DocumentoPrestacao): Record<string, string> {
  return {
    A1: documento.capa.razaoSocial,
    A8: documento.capa.razaoSocial,
    A11: documento.encerramento.texto,
    A23: `${documento.oficio.cidade}, ${documento.encerramento.dataPorExtenso}.`,
    A29: documento.encerramento.tesoureiro,
    G29: documento.encerramento.presidente,
  }
}

export function gerarPdfPrestacao(documento: DocumentoPrestacao): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Sem compressão em teste: é o que deixa o teste ler os segmentos de texto
    // do buffer sem embarcar um leitor de PDF só para isso.
    const doc = new PDFDocument({
      size: 'A4',
      // A margem agora é de cada folha, e já está embutida na caixa que
      // `caixaDa` devolve — o documento nasce sem margem própria.
      margin: 0,
      compress: process.env.NODE_ENV !== 'test',
      info: {
        Title: `Prestação de Contas — ${documento.capa.mesPorExtenso} de ${documento.capa.ano}`,
        Author: documento.capa.razaoSocial,
      },
    })

    const pedacos: Buffer[] = []
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco))
    doc.on('end', () => resolve(Buffer.concat(pedacos)))
    doc.on('error', reject)

    desenharFolha(doc, LAYOUT['1-Capa'], valoresDaCapa(documento))

    doc.addPage()
    desenharFolha(doc, LAYOUT['2-Contra-Capa'], valoresDaContraCapa(documento))

    doc.addPage()
    desenharFolhaDeLancamentos(doc, LAYOUT['3-Despesas'], documento, linhasDeDespesas(documento))

    doc.addPage()
    desenharFolhaDeLancamentos(doc, LAYOUT['4-Receitas'], documento, linhasDeReceitas(documento))

    doc.addPage()
    desenharConciliacao(doc, LAYOUT['5-Conciliação'], documento)

    doc.addPage() // 6-Encerramento
    desenharFolha(doc, LAYOUT['6-Encerramento'], valoresDoEncerramento(documento))

    doc.end()
  })
}
