/**
 * A escolha de tema, guardada por aparelho.
 *
 * Guardar no aparelho, e não no usuário, foi decisão deliberada: funciona já na
 * tela de login, onde ainda não há usuário; dispensa migração no banco; e num
 * Lar onde a mesma estação é compartilhada entre plantões, o tema pertence mais
 * à tela do corredor do que a quem está logado nela.
 *
 * **Ausente significa "siga o sistema operacional".** Não há valor padrão aqui.
 * Quem nunca escolheu não recebe atributo nenhum no `<html>`, e o
 * `@media (prefers-color-scheme: dark)` do `globals.css` assume. Devolver
 * `'claro'` na ausência do cookie desarmaria esse `@media` e prenderia no claro
 * justamente quem está com o sistema no escuro.
 */

export const COOKIE_TEMA = 'tema'

export type Tema = 'claro' | 'escuro'

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365

/**
 * O cookie chega pelo cabeçalho da requisição e o valor vai parar num atributo
 * do HTML. Como qualquer pessoa pode escrever o que quiser nele, o que não for
 * exatamente um dos dois temas vira ausência.
 */
export function lerTema(valor: string | undefined | null): Tema | undefined {
  return valor === 'claro' || valor === 'escuro' ? valor : undefined
}

export function oposto(tema: Tema): Tema {
  return tema === 'escuro' ? 'claro' : 'escuro'
}

/**
 * Montado aqui, e não no componente, para que o formato do cookie tenha um dono
 * só — quem escreve no navegador e quem lê no servidor leem o mesmo arquivo.
 */
export function cookieDeTema(tema: Tema): string {
  return `${COOKIE_TEMA}=${tema}; path=/; max-age=${UM_ANO_EM_SEGUNDOS}; SameSite=Lax`
}
