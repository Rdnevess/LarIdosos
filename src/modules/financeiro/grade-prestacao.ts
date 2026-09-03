import type { LayoutFolha } from './layout-prestacao'

/**
 * A geometria da grade: onde cada célula do modelo cai na página.
 *
 * Módulo **puro**, como `faixas.ts`, `turno.ts` e `tendencia.ts`: sem pdfkit,
 * sem banco, sem leitura de arquivo. É aqui que mora a aritmética que decide
 * se o documento sai fiel, e regra assim precisa ser testável sozinha.
 */

export const LARGURA_PAGINA = 595
export const ALTURA_PAGINA = 842

export type Caixa = { x: number; y: number; largura: number; altura: number }

/**
 * Largura de coluna do Excel em pontos de PDF.
 *
 * O Excel mede em caracteres da fonte padrão; a fórmula do OOXML converte para
 * pixels a 96 DPI, e o PDF trabalha a 72. Para a largura 8,14 do modelo dá
 * 46,49 pt, e as doze colunas somam 557,8 pt contra 561 pt de largura útil —
 * a planilha foi desenhada para caber na A4, e esse encaixe é a confirmação de
 * que a conta está certa.
 */
export function larguraDaColuna(largura: number): number {
  return (largura * 7 + 5) * 0.75
}

/** Quebra "A11" em coluna 1 e linha 11. Só a faixa A..L nos interessa. */
function partesDa(celula: string): { coluna: number; linha: number } {
  const [, letras, digitos] = celula.match(/^([A-Z]+)(\d+)$/) ?? []
  if (!letras || !digitos) throw new Error(`Célula fora do formato: ${celula}`)
  let coluna = 0
  for (const letra of letras) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return { coluna, linha: Number(digitos) }
}

export function xDaColuna(layout: LayoutFolha, coluna: number): number {
  let x = layout.margens.esquerda
  for (const c of layout.larguras) {
    if (c.coluna >= coluna) break
    x += larguraDaColuna(c.largura)
  }
  return x
}

export function alturaDaLinha(layout: LayoutFolha, linha: number): number {
  return layout.alturas.find((a) => a.linha === linha)?.altura ?? layout.alturaPadrao
}

/**
 * O topo da linha, em coordenada de PDF.
 *
 * O `y` da planilha cresce para baixo e o do PDF para cima. A inversão fica
 * aqui, uma vez só: espalhá-la pelo renderizador produziria uma folha de
 * cabeça para baixo no dia em que alguém esquecesse de inverter.
 */
export function yDaLinha(layout: LayoutFolha, linha: number): number {
  let percorrido = 0
  for (let n = 1; n < linha; n++) percorrido += alturaDaLinha(layout, n)
  return ALTURA_PAGINA - layout.margens.topo - percorrido
}

/** A faixa mesclada que contém a célula, ou a própria célula. */
export function faixaDe(layout: LayoutFolha, celula: string): string {
  const alvo = partesDa(celula)
  for (const faixa of layout.merges) {
    const [inicio, fim] = faixa.split(':')
    const a = partesDa(inicio)
    const b = partesDa(fim)
    if (
      alvo.coluna >= a.coluna && alvo.coluna <= b.coluna &&
      alvo.linha >= a.linha && alvo.linha <= b.linha
    ) {
      return faixa
    }
  }
  return celula
}

/** A caixa da célula — ou da faixa mesclada que a contém. */
export function caixaDa(layout: LayoutFolha, celula: string): Caixa {
  const faixa = faixaDe(layout, celula)
  const [inicio, fim] = faixa.includes(':') ? faixa.split(':') : [faixa, faixa]
  const a = partesDa(inicio)
  const b = partesDa(fim)

  const x = xDaColuna(layout, a.coluna)
  const direita = xDaColuna(layout, b.coluna) + larguraDaColuna(
    layout.larguras.find((c) => c.coluna === b.coluna)?.largura ?? 0
  )

  const topo = yDaLinha(layout, a.linha)
  let altura = 0
  for (let n = a.linha; n <= b.linha; n++) altura += alturaDaLinha(layout, n)

  return { x, y: topo - altura, largura: direita - x, altura }
}

/**
 * Quantas linhas de altura fixa cabem entre `primeiraLinha` e o fim da página.
 *
 * É o que decide o transbordo: com sessenta despesas a folha vira três
 * páginas, e a conta de quantas cabem em cada uma mora aqui, longe do pdfkit.
 */
export function linhasQueCabem(
  layout: LayoutFolha,
  primeiraLinha: number,
  alturaLinha: number
): number {
  const disponivel = yDaLinha(layout, primeiraLinha) - layout.margens.baixo
  return Math.max(0, Math.floor(disponivel / alturaLinha))
}
