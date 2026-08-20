/**
 * Conversores de `FormData` para os tipos que os serviços esperam.
 *
 * Ficam aqui, e não dentro dos arquivos `acoes.ts`, por uma restrição do
 * Next: um módulo marcado com `'use server'` só pode exportar funções
 * assíncronas, então nada declarado lá dentro é importável por um teste.
 * Esta é a costura onde `FormData` (só strings) vira objeto de domínio, e é
 * a camada que `src/lib/formulario.test.ts` cobre.
 */

/**
 * Texto do campo, já aparado. Campo em branco vira `undefined` — e não string
 * vazia — porque os schemas Zod tratam `''` como valor informado: `z.string()`
 * aceitaria, e o banco guardaria uma string vazia onde o certo é "não
 * informado".
 */
export function texto(dados: FormData, campo: string): string | undefined {
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? undefined : s
}

/**
 * O `T12:00:00` evita o clássico deslocamento de um dia: `new Date('2026-03-12')`
 * é interpretado como meia-noite UTC, o que em fuso brasileiro vira 11 de março.
 */
export function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo)
  return valor ? new Date(`${valor}T12:00:00`) : undefined
}

/**
 * Campo vazio vira `undefined`; texto não numérico vira `NaN`, de propósito.
 * `z.number()` recusa `NaN` (verificado: `zod@3.25`, código `invalid_type`,
 * `received: "nan"`), então a ação devolve erro em vez de gravar. Converter
 * lixo para `undefined` seria pior: o campo sumiria silenciosamente do
 * objeto, e quem digitou não saberia que o valor foi descartado.
 */
export function numero(dados: FormData, campo: string): number | undefined {
  const valor = texto(dados, campo)
  return valor === undefined ? undefined : Number(valor)
}

/**
 * Caixa de seleção. O navegador só envia o campo quando está marcada, e o
 * valor enviado é `'on'` (padrão do HTML para `<input type="checkbox">` sem
 * atributo `value`, que é como `Campo` os emite — ver `src/components/campo.tsx`).
 * Desmarcada, o campo não vem no `FormData` e `get` devolve `null`.
 */
export function booleano(dados: FormData, campo: string): boolean {
  return dados.get(campo) === 'on'
}

/**
 * Mantém obrigatório o que era obrigatório e torna opcional o que já podia
 * ser `undefined` — o retorno de `semIndefinidos` descreve a forma real do
 * objeto, com as chaves vazias ausentes.
 */
type ComOpcionaisOmitidos<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: T[K]
}

/**
 * Remove as chaves cujo valor é `undefined`, em vez de emiti-las.
 *
 * Sem isto, uma edição sem alteração nenhuma monta um objeto com todas as
 * chaves presentes, `calcularDiff` itera `Object.keys(depois)` e a trilha de
 * auditoria ganha linhas de mudanças que não aconteceram — e, pior, linhas
 * afirmando que um campo foi esvaziado quando o Prisma, que ignora
 * `undefined` em `data`, não tocou nele.
 *
 * **Consequência assumida: não é possível limpar um campo opcional pela
 * tela.** Apagar o conteúdo de "Religião" e salvar não devolve o campo para
 * `null` — a chave simplesmente não é enviada, e o valor anterior permanece.
 * Isto é deliberado nesta fase, não um descuido: a alternativa exigiria
 * distinguir "não informado" de "limpar", o que o `FormData` não expressa
 * sozinho, e uma sentinela inventada aqui gravaria `null` em qualquer campo
 * que o usuário deixasse em branco por engano ao corrigir outro. Enquanto
 * isso não existir, limpar um campo é operação de banco, não de tela.
 */
export function semIndefinidos<T extends object>(objeto: T): ComOpcionaisOmitidos<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined)
  ) as ComOpcionaisOmitidos<T>
}
