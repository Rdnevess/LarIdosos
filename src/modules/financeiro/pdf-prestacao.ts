import PDFDocument from 'pdfkit'
import type { DocumentoPrestacao } from './documento-prestacao'
import { LAYOUT, type LayoutFolha, type EstiloBorda } from './layout-prestacao'
import {
  caixaDa,
  faixaDe,
  xDaColuna,
  yDaLinha,
  alturaDaLinha,
  linhasQueCabem,
  type Caixa,
} from './grade-prestacao'
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
 * Piso da redução de fonte que `desenharFolha` aplica a uma célula de linha
 * única que não coube nem transbordando. Abaixo disto o texto fica
 * ilegível, e é melhor aceitar um resíduo de estouro do que encolher a
 * fonte a ponto de não servir para nada — nenhuma célula do modelo precisa
 * chegar perto disto na prática (a única que reduz hoje, `1-Capa A11`, para
 * em ~45pt, vindo de 48pt).
 */
const TAMANHO_MINIMO_FONTE = 6

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
 * A largura de desenho de uma célula não mesclada, alinhada à esquerda,
 * estendida para a direita através das vizinhas vazias da mesma linha — o
 * jeito do Excel deixar um texto mais largo que a própria célula "vazar"
 * visualmente para a célula ao lado, sem mover o dado de nenhuma das duas.
 *
 * Só é chamada quando o texto já provou não caber na largura própria da
 * célula: estender sempre, mesmo quando cabia, deslocaria a posição de um
 * texto que já estava correto (a caixa de desenho cresce, e alinhamento
 * `center`/`right` usa a largura para calcular onde começa).
 *
 * Pára no primeiro obstáculo: uma vizinha mesclada — o Excel não atravessa o
 * limite de uma mescla, vazia ou não —, uma vizinha com texto próprio
 * (rótulo ou valor), o que evita engolir o conteúdo dela, ou uma borda
 * vertical entre a vizinha e a célula anterior. Esta última pegou um caso
 * real: `C34`/`C51`, a razão social do rodapé (`desenharRodape` abaixo), não
 * têm mescla nem vizinha ocupada até `L` — nada as impediria de transbordar
 * por cima da caixa da assinatura (`G`-`L`) se a única regra fosse mescla e
 * texto. O que segura a extensão em `F` é a borda entre `F` e `G`, a mesma
 * que faz daquela faixa uma caixa visual à parte; sem checar borda, um nome
 * de instituição longo o bastante saía inteiro em cima da linha de
 * assinatura, sem provocar sequer o encolhimento de fonte que preveniria
 * isso. Sem vizinha livre nem borda no caminho, ou no fim da faixa de
 * colunas do modelo, a largura pára aí — é o caso da capa (`1-Capa A11`),
 * que já está mesclada até a última coluna e por isso nunca chega a chamar
 * esta função; ver `desenharFolha`.
 */
function larguraComTransbordo(
  layout: LayoutFolha,
  celula: string,
  textos: Record<string, string>,
  caixa: Caixa
): number {
  const { coluna, linha } = partesDaCelula(celula)
  const ultimaColuna = Math.max(...layout.larguras.map((c) => c.coluna))

  let colunaFim = coluna
  for (let c = coluna + 1; c <= ultimaColuna; c++) {
    const anterior = celulaDaParte(c - 1, linha)
    const vizinha = celulaDaParte(c, linha)
    if (faixaDe(layout, vizinha) !== vizinha) break // vizinha mesclada: o Excel para aqui
    if (textos[vizinha]) break // vizinha com texto proprio: nao pode ser engolida
    if (layout.bordas[anterior]?.direita || layout.bordas[vizinha]?.esquerda) break // borda vertical: fim da caixa visual
    colunaFim = c
  }

  return xDaColuna(layout, colunaFim + 1) - caixa.x
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
    const horizontal = alinhamento?.horizontal ?? 'left'
    const vertical = alinhamento?.vertical ?? 'top'
    const quebra = alinhamento?.quebra ?? false

    doc.font(fonteDoPdf(fonte?.familia ?? 'Arial', fonte?.negrito ?? false, fonte?.italico ?? false))

    // Texto de linha única (quebra: false) que não cabe: o modelo original
    // não corta — ele transborda para a célula vazia ao lado (o jeito do
    // Excel, `larguraComTransbordo` acima) ou, quando não há para onde
    // transbordar (célula já mesclada até o fim, como `1-Capa A11`), reduz a
    // fonte até caber. É a §5 da spec ("reduzido até caber ou quebrado").
    //
    // A versão anterior truncava com reticências e o comentário afirmava que
    // a reticência aparecia, avisando quem conferisse que faltou espaço. Na
    // prática ela não avisa nada: o pdfkit grava o glifo no byte WinAnsi
    // 0x85, mas com `lineBreak: false` e uma `width` explícita o pdfkit
    // ainda quebra por palavra (o `lineBreak: false` só afeta o cálculo da
    // largura padrão quando nenhuma é informada — não existe outro uso dele
    // no código-fonte do pdfkit), e o truncamento medido cortava a palavra
    // inteira ("Unidade Executora:" virava "Unidad", a capa virava
    // "PRESTAÇÃO DE" sem "CONTAS") sem sobrar sinal legível de que faltou
    // espaço. Sem truncamento nenhum, o problema desaparece: caber de
    // verdade é melhor do que avisar que não coube.
    let largura = c.largura
    let tamanho = fonte?.tamanho ?? 10
    doc.fontSize(tamanho)

    if (!quebra) {
      const cabeNaCelula = () => doc.widthOfString(texto) <= largura - 4

      if (!cabeNaCelula() && horizontal === 'left' && faixaDe(layout, celula) === celula) {
        largura = larguraComTransbordo(layout, celula, textos, c)
      }

      while (!cabeNaCelula() && tamanho > TAMANHO_MINIMO_FONTE) {
        tamanho -= 1
        doc.fontSize(tamanho)
      }
    }

    // O alinhamento vertical do modelo era recolhido, validado e nunca lido
    // aqui — todo texto saía encostado no topo da caixa (c.y + 2), mesmo em
    // blocos mesclados de várias linhas onde o modelo centraliza. A altura
    // real do texto (heightOfString, sem `height` para não truncar a medida)
    // decide quanto sobra para empurrar para baixo.
    const alturaTexto = doc.heightOfString(texto, {
      width: largura - 4,
      align: horizontal,
      lineBreak: quebra,
    })
    const y =
      vertical === 'middle'
        ? c.y + Math.max(0, (c.altura - alturaTexto) / 2)
        : vertical === 'bottom'
          ? c.y + Math.max(0, c.altura - alturaTexto - 2)
          : c.y + 2

    // Este bloqueio protege qualquer célula de linha única que, mesmo depois
    // de transbordar e reduzir até o piso de `TAMANHO_MINIMO_FONTE`, continue
    // mais larga do que a própria caixa — o pdfkit quebra em duas linhas
    // (nenhum `options.lineBreak` impede isso, como o comentário logo acima
    // explica) e, com `height: c.altura`, a segunda linha simplesmente SOME:
    // o mesmo sumiço sem aviso que este bloqueio existe para fechar, só que
    // por falta de altura em vez de reticência. `height` nunca fica menor do
    // que o necessário para a própria altura medida — a caixa pode
    // extravasar visualmente a linha do modelo por alguns pontos, mas
    // nenhuma linha de texto é descartada. Só para `quebra: false`: um
    // parágrafo (`quebra: true`) que já é maior do que a caixa é truncamento
    // intencional, não este bloqueio.
    //
    // Não é mais o caso de `A34`/`A51` ("Unidade Executora:"). A instrução
    // original de fazê-la transbordar "para a vizinha vazia" presumia uma
    // vizinha que não existia — a razão social ocupava `B34`/`B51`. A medição
    // mostrou outra coisa: nessas linhas não há mescla nem borda vertical
    // entre `A` e `F` (só `A.esquerda`, `F.direita`, depois `G.esquerda`,
    // `L.direita`) — a caixa que o leitor enxerga é delimitada por borda, não
    // por coluna, e é por isso que o rodapé tem `A`-`F` inteiro para
    // trabalhar. Com a razão social movida para `C` (`desenharRodape`
    // abaixo), `B` fica livre: o rótulo transborda para lá e cabe em 10pt,
    // sem chegar perto deste piso.
    const alturaMinima = quebra ? c.altura : Math.max(c.altura, alturaTexto)

    doc.text(texto, c.x + 2, y, {
      width: largura - 4,
      height: alturaMinima,
      align: horizontal,
      lineBreak: quebra,
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
 * vai para `C`, uma linha abaixo do total — não para `B`: `A34`/`A51` não têm
 * mescla nem borda vertical até `F` (ver o comentário de `alturaMinima` em
 * `desenharFolha`), e deixar `B` livre é o que permite "Unidade Executora:"
 * transbordar e sair inteira em 10pt. Presidente e tesoureiro, quatro linhas
 * abaixo, em `A` e `G`. Os rótulos fixos do modelo ("Total", "Unidade
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
    [`C${linhaTotal + 1}`]: documento.capa.razaoSocial,
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
 *
 * **Transborda como `desenharFolhaDeLancamentos`.** Acima de 28 origens mais
 * despesas somadas o conteúdo passava do papel — medido desenhando de
 * verdade e lendo o content stream: 27 linhas cabem (y=827,10), 29 não
 * (y=852,60 contra 841,89 de altura da A4). O que se repete na página nova é
 * o **cabeçalho** (linhas 1 a 12: "Discriminação", "Saldo" e os dados
 * bancários) — mesmo motivo das folhas de lançamento: quem folheia precisa
 * saber que coluna está lendo. O **rodapé** (saldo disponível, unidade
 * executora e as duas assinaturas) sai só na última página, e nunca é
 * partido no meio: antes de desenhar a primeira linha dele, o código confere
 * se a ÚLTIMA linha do bloco inteiro ainda cabe — como as linhas avançam em
 * sequência, se a última cabe todas as anteriores cabem também. O par
 * "( - ) Despesas" / cabeçalho "Credor" (linhas 22-23 do modelo) não recebeu
 * a mesma proteção: nenhuma delas é o que a revisão mediu vazando, e a
 * simples quebra por linha do restante do corpo já resolve a única regressão
 * mostrada.
 */
export function desenharConciliacao(
  doc: Doc,
  layout: LayoutFolha,
  documento: DocumentoPrestacao
): void {
  const { conciliacao: dados } = documento
  const rotulo = (celula: string) => layout.rotulos[celula] ?? ''

  const cabecalho = () =>
    desenharFolha(doc, recorteDeLinhas(layout, 1, 12), valoresDoCabecalhoDaConciliacao(documento))

  cabecalho()

  let linha = 13

  /** A linha `linhaAlvo`, com sua própria altura do modelo, cabe na página corrente? */
  const cabe = (linhaAlvo: number): boolean =>
    linhasQueCabem(layout, linhaAlvo, alturaDaLinha(layout, linhaAlvo)) >= 1

  const novaPagina = (): void => {
    doc.addPage()
    cabecalho()
    linha = 13
  }

  /**
   * Desenha uma linha composta na posição corrente e avança `linha`. Antes
   * de desenhar, abre página nova se a linha não couber — a mesma decisão
   * que `desenharFolhaDeLancamentos` toma por página inteira, aqui por
   * linha, porque a conciliação mistura linhas fixas com duas listas de
   * tamanho variável.
   *
   * `valoresDe` recebe a posição FINAL (depois de qualquer quebra de
   * página) para montar as chaves de célula — nunca a `linha` capturada no
   * momento da chamada, que ficaria presa ao valor de antes da quebra.
   */
  const linhaComposta = (linhaModelo: number, valoresDe: (linhaAlvo: number) => Record<string, string>): void => {
    if (!cabe(linha)) novaPagina()
    desenharLinhaComposta(doc, layout, linhaModelo, linha, valoresDe(linha))
    linha++
  }

  linhaComposta(13, (l) => ({
    [`A${l}`]: rotulo('A13'),
    [`J${l}`]: formatarMoeda(dados.saldoAnterior),
  }))

  linhaComposta(14, (l) => ({
    [`A${l}`]: rotulo('A14'),
    [`J${l}`]: formatarMoeda(dados.totalReceitas),
  }))

  const primeiraLinhaRecebimento = 15
  const ultimaLinhaRecebimentoDoModelo = 18
  dados.recebimentosPorOrigem.forEach((recebimento, indice) => {
    const linhaModelo = Math.min(primeiraLinhaRecebimento + indice, ultimaLinhaRecebimentoDoModelo)
    linhaComposta(linhaModelo, (l) => ({
      [`B${l}`]: recebimento.rotulo,
      [`J${l}`]: formatarMoeda(recebimento.valor),
    }))
  })

  linha++ // linha em branco, como o gerador da planilha deixava antes do total
  linhaComposta(20, (l) => ({
    [`A${l}`]: rotulo('A20'),
    [`J${l}`]: formatarMoeda(dados.saldoAnterior + dados.totalReceitas),
  }))
  linha++ // segunda linha em branco (o original fazia linha += 2 depois do total)

  linhaComposta(22, (l) => ({
    [`A${l}`]: rotulo('A22'),
  }))

  // B23 vem em branco no modelo; a coluna é a do credor, texto fixo aqui.
  linhaComposta(23, (l) => ({
    [`B${l}`]: 'Credor',
    [`F${l}`]: rotulo('F23'),
  }))

  const primeiraLinhaDespesa = 24
  const ultimaLinhaDespesaDoModelo = 46
  dados.despesasDetalhadas.forEach((despesa, indice) => {
    const linhaModelo = Math.min(primeiraLinhaDespesa + indice, ultimaLinhaDespesaDoModelo)
    linhaComposta(linhaModelo, (l) => ({
      [`B${l}`]: despesa.credor,
      [`F${l}`]: despesa.categoria,
      [`J${l}`]: formatarMoeda(despesa.valor),
    }))
  })

  linha++ // linha em branco, como o gerador da planilha deixava antes do total
  linhaComposta(47, (l) => ({
    [`A${l}`]: rotulo('A47'),
    [`J${l}`]: formatarMoeda(dados.totalDespesas),
  }))
  linha++ // segunda linha em branco (o original fazia linha += 2 depois do total)

  // Reserva atômica do rodapé: saldo disponível, unidade executora e as duas
  // assinaturas nunca podem ficar espalhadas por páginas diferentes. `linha`
  // já é a posição do saldo disponível; o bloco usa mais sete linhas depois
  // dela (branco, unidade executora, dois brancos, e as três linhas de
  // assinatura) — se a última delas couber, todas as anteriores cabem.
  if (!cabe(linha + 7)) novaPagina()

  linhaComposta(49, (l) => ({
    [`A${l}`]: rotulo('A49'),
    [`J${l}`]: formatarMoeda(dados.saldoDisponivel),
  }))

  linha++ // linha em branco antes da unidade executora

  linhaComposta(51, (l) => ({
    [`A${l}`]: rotulo('A51'),
    [`C${l}`]: documento.capa.razaoSocial,
  }))

  linha += 2 // duas linhas em branco antes das assinaturas

  // A conciliação assina na ordem inversa das folhas de lançamento: tesoureiro
  // à esquerda, presidente à direita. É como o modelo faz.
  linhaComposta(54, (l) => ({
    [`A${l}`]: rotulo('A54'),
    [`G${l}`]: rotulo('G54'),
  }))
  linhaComposta(55, (l) => ({
    [`A${l}`]: documento.oficio.tesoureiro,
    [`G${l}`]: documento.oficio.presidente,
  }))
  linhaComposta(56, (l) => ({
    [`A${l}`]: rotulo('A56'),
    [`G${l}`]: rotulo('G56'),
  }))
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
