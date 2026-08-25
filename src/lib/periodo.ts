/**
 * As bordas de período que os filtros de tela usam.
 *
 * Existem porque quatro telas montavam o fim do período à mão como
 * `T23:59:59` — sem milissegundos. Um registro gravado às 23:59:59.500 ficava
 * de fora do filtro, e ficava **em silêncio**: a tela mostra o período pedido e
 * simplesmente não lista a linha. Numa trilha de auditoria e num fechamento
 * financeiro, sumir sem avisar é o pior jeito de errar.
 *
 * Hora local, e não UTC: o sistema roda com `TZ=America/Sao_Paulo` (ver
 * `docker-compose.yml`), e o dia que a equipe digita é o do calendário dela.
 */

const ULTIMO_MILISSEGUNDO: [number, number, number, number] = [23, 59, 59, 999]

/** `'2026-08-25'` → 25/08/2026 às 23:59:59.999, hora local. */
export function fimDoDia(diaIso: string): Date {
  const [ano, mes, dia] = diaIso.split('-').map(Number)
  return new Date(ano, mes - 1, dia, ...ULTIMO_MILISSEGUNDO)
}

/**
 * O fim do último dia do mês. `mes` é 1–12, como a pessoa escreve, e não 0–11
 * como o `Date` conta — o dia `0` do mês seguinte é o último do mês pedido, o
 * que faz fevereiro bissexto sair certo sem tabela de dias escrita à mão.
 */
export function fimDoMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 0, ...ULTIMO_MILISSEGUNDO)
}
