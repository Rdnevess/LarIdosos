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
 * Texto do campo, já aparado, em três estados que o `FormData` distingue e
 * que significam coisas diferentes para o banco:
 *
 * - **ausente** do formulário → `undefined`. Não há intenção sobre o campo;
 *   `semIndefinidos` omite a chave e o Prisma não toca na coluna.
 * - **presente e vazio** → `null`. A pessoa apagou o que havia, e apagar é
 *   uma intenção tão explícita quanto digitar. Grava `null`.
 * - **preenchido** → o valor aparado.
 *
 * Nunca devolve string vazia: `z.string()` aceitaria `''` como valor
 * informado e o banco guardaria uma string vazia onde o certo é "não
 * informado".
 */
export function texto(dados: FormData, campo: string): string | null | undefined {
  if (!dados.has(campo)) return undefined
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? null : s
}

/**
 * O `T12:00:00` evita o clássico deslocamento de um dia: `new Date('2026-03-12')`
 * é interpretado como meia-noite UTC, o que em fuso brasileiro vira 11 de março.
 */
export function data(dados: FormData, campo: string): Date | null | undefined {
  const valor = texto(dados, campo)
  if (valor === undefined || valor === null) return valor
  return new Date(`${valor}T12:00:00`)
}

/**
 * Segue os três estados de `texto`, acima. Texto não numérico vira `NaN`, de
 * propósito: `z.number()` recusa `NaN` (verificado: `zod@3.25`, código
 * `invalid_type`, `received: "nan"`), então a ação devolve erro em vez de
 * gravar. Converter lixo para `undefined` seria pior — o campo sumiria
 * silenciosamente do objeto, e quem digitou não saberia que o valor foi
 * descartado.
 */
export function numero(dados: FormData, campo: string): number | null | undefined {
  const valor = texto(dados, campo)
  // `Number('')` é 0, e zero tem significado próprio num valor de benefício.
  // Por isso o campo vazio precisa sair daqui antes da conversão.
  if (valor === undefined || valor === null) return valor
  return Number(valor)
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
 * Remove as chaves cujo valor é `undefined`, em vez de emiti-las. Chave com
 * `null` **permanece** — é o que permite limpar um campo pela tela.
 *
 * Sem isto, uma edição sem alteração nenhuma monta um objeto com todas as
 * chaves presentes, `calcularDiff` itera `Object.keys(depois)` e a trilha de
 * auditoria ganha linhas de mudanças que não aconteceram.
 *
 * A distinção que sustenta isso vem de `texto` (acima): campo **ausente** do
 * formulário vira `undefined` e some aqui; campo **presente e vazio** vira
 * `null` e sobrevive até o Prisma, que grava `null`. O `FormData` expressa a
 * diferença por `has()` — quem monta o formulário decide quais campos oferece,
 * e oferecer um campo é convidar a apagá-lo.
 */
export function semIndefinidos<T extends object>(objeto: T): ComOpcionaisOmitidos<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined)
  ) as ComOpcionaisOmitidos<T>
}
