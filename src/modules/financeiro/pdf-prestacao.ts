import PDFDocument from 'pdfkit'
import type { DocumentoPrestacao } from './documento-prestacao'
import { LAYOUT, type LayoutFolha, type EstiloBorda, type LadosComBorda } from './layout-prestacao'
import { caixaDa, faixaDe } from './grade-prestacao'

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

/**
 * Os lados de borda de cada faixa, com os das células-membro unidos na âncora.
 *
 * O Excel guarda a borda de uma caixa mesclada espalhada pelas células do
 * perímetro, não inteira na âncora: numa faixa `A1:L2`, `A1` carrega `topo` e
 * `esquerda`, mas `direita` mora em `L1`/`L2` e `baixo` seguiria em `A2`/`L2`
 * se a caixa o tivesse. Desenhar só o que a âncora tem, sozinha, perde os
 * lados que vieram de outra célula do mesmo merge — a caixa sai faltando
 * lado. Por isso a união: cada célula do `bordas` extraído contribui os
 * lados que carrega para a âncora da sua faixa, e é a âncora que desenha.
 *
 * **A união é por OR simples, lado a lado — não rastreia extensão.** Ela
 * pressupõe que, quando um lado aparece em alguma célula da faixa, ele cobre
 * TODO aquele trecho do perímetro (a linha inteira do topo, a coluna inteira
 * da esquerda etc.), porque é isso que desenha: um traço do começo ao fim da
 * caixa. Numa faixa com borda parcial — um lado presente só numa parte do
 * perímetro, como `esquerda` só na primeira de três linhas — o traço sairia
 * do tamanho da faixa inteira onde o modelo só tinha borda num pedaço dela.
 * Vale para as três folhas que esta função desenha hoje (testado em
 * `pdf-prestacao.test.ts`, que varre as seis folhas do `LAYOUT` atrás de
 * violação); já existe borda parcial fora do que é desenhado hoje, listada
 * como violação conhecida nesse teste.
 */
function bordasDaFolha(layout: LayoutFolha): Map<string, LadosComBorda> {
  const porAncora = new Map<string, LadosComBorda>()

  for (const [celula, lados] of Object.entries(layout.bordas)) {
    const ancora = faixaDe(layout, celula).split(':')[0]
    const atual = porAncora.get(ancora) ?? {}
    porAncora.set(ancora, {
      topo: atual.topo ?? lados.topo,
      baixo: atual.baixo ?? lados.baixo,
      esquerda: atual.esquerda ?? lados.esquerda,
      direita: atual.direita ?? lados.direita,
    })
  }

  return porAncora
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
 */
function desenharFolha(
  doc: Doc,
  layout: LayoutFolha,
  valores: Record<string, string>
): void {
  for (const [celula, lados] of bordasDaFolha(layout)) {
    const c = caixaDa(layout, celula)

    const segmentos: [number, number, number, number, EstiloBorda][] = []
    if (lados.topo) segmentos.push([c.x, c.y, c.x + c.largura, c.y, lados.topo])
    if (lados.baixo) {
      segmentos.push([c.x, c.y + c.altura, c.x + c.largura, c.y + c.altura, lados.baixo])
    }
    if (lados.esquerda) segmentos.push([c.x, c.y, c.x, c.y + c.altura, lados.esquerda])
    if (lados.direita) {
      segmentos.push([c.x + c.largura, c.y, c.x + c.largura, c.y + c.altura, lados.direita])
    }

    for (const [x1, y1, x2, y2, estilo] of segmentos) {
      doc.lineWidth(ESPESSURA[estilo]).moveTo(x1, y1).lineTo(x2, y2).stroke()
    }
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

    // Despesas, Receitas e Conciliação são as três folhas com faixa de dados
    // que cresce pelo volume de lançamentos — ficam para a próxima tarefa,
    // que decide como `linhasQueCabem` pagina cada uma. Por ora entram em
    // branco, só para o documento ter as seis folhas do modelo.
    doc.addPage() // 3-Despesas
    doc.addPage() // 4-Receitas
    doc.addPage() // 5-Conciliação

    doc.addPage() // 6-Encerramento
    desenharFolha(doc, LAYOUT['6-Encerramento'], valoresDoEncerramento(documento))

    doc.end()
  })
}
