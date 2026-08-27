/**
 * A paginação das listas, que é do sistema e não de uma tela.
 *
 * A trilha de auditoria já paginava sozinha desde a Fase 1, com o parser de
 * número dentro do próprio `page.tsx`. Quando a segunda lista precisou da
 * mesma regra, ela veio para cá em vez de ser copiada — é o mesmo motivo pelo
 * qual a janela de edição virou `janela-edicao.ts` antes da segunda entidade:
 * duas cópias da mesma regra divergem, e esta decide o que a pessoa vê.
 *
 * **Tudo aqui é resguardo contra a barra de endereço.** Página e tamanho
 * chegam como texto digitável, e um valor absurdo não pode virar erro de
 * banco nem consulta ilimitada.
 */

/**
 * Os tamanhos oferecidos, e a lista é fechada de propósito: `?por=100000`
 * numa lista de residentes traria a tabela inteira para a memória do
 * servidor. Quem já entrou no sistema pode digitar o que quiser na URL.
 */
export const TAMANHOS = [20, 40, 60] as const

export type Tamanho = (typeof TAMANHOS)[number]

export const TAMANHO_PADRAO: Tamanho = 20

export type Pagina<T> = {
  itens: T[]
  total: number
  pagina: number
  por: Tamanho
  paginas: number
}

/**
 * `Number('abc')` é `NaN`, e `NaN` chegando ao `skip` do Prisma quebra a
 * consulta em vez de mostrar a primeira página. `Number.isInteger` recusa de
 * uma vez o `NaN`, o fracionário e o infinito.
 */
export function numeroDaPagina(valor: string | undefined): number {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : 1
}

export function tamanhoDePagina(valor: string | undefined): Tamanho {
  const numero = Number(valor)
  return TAMANHOS.find((tamanho) => tamanho === numero) ?? TAMANHO_PADRAO
}

/**
 * Lista vazia continua tendo uma página: zero faria a tela dizer "página 1 de
 * 0". Uma lista vazia é a resposta da primeira página, não a ausência dela.
 */
export function totalDePaginas(total: number, por: Tamanho): number {
  return Math.max(1, Math.ceil(total / por))
}

/**
 * A URL da lista, preservando os filtros que já estão na barra de endereço.
 *
 * Trocar de página não pode perder a busca: quem procurou "maria" e foi para a
 * página 2 espera a página 2 **de maria**. E filtro vazio não entra, para que
 * a URL compartilhada diga só o que importa.
 *
 * Uma mudança com valor indefinido **remove** a chave. É assim que um filtro
 * novo derruba a página: sem isso, mudar a busca mantendo `?pagina=3` mostraria
 * uma lista vazia para um resultado que agora tem uma página só.
 */
export function comParametros(
  atuais: Record<string, string | undefined>,
  mudancas: Record<string, string | number | undefined>
): string {
  const busca = new URLSearchParams()

  for (const [chave, valor] of Object.entries(atuais)) {
    if (valor && !(chave in mudancas)) busca.set(chave, valor)
  }
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor !== undefined) busca.set(chave, String(valor))
  }

  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}
