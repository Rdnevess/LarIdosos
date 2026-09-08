import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Icone, type NomeIcone } from '@/components/icones'

/**
 * O botão do sistema.
 *
 * Existe para que "como é um botão primário" tenha uma resposta só. Antes
 * disto, cada tela repetia `w-full rounded bg-acao py-2 text-sobre-acao` — e
 * repetição é onde a divergência entra sem ninguém decidir.
 *
 * `type="submit"` por padrão porque quase todo botão daqui está num formulário
 * com Server Action. O padrão do HTML já é esse; explicitá-lo evita que alguém
 * o troque por engano ao acrescentar um `onClick`.
 */
/**
 * O que todo botão tem, seja `<button>` ou link com cara de botão.
 *
 * Separado das variantes porque `LinkBotao` precisa exatamente disto e de mais
 * nada — e copiar a cadeia de classes para lá seria a repetição que este
 * arquivo existe para acabar.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 text-suporte font-medium transition'

export const VARIANTES = {
  primario: 'bg-acao text-sobre-acao hover:opacity-90',
  // `border-acao` e não `border-borda`: a borda neutra dá 1,49:1 contra o
  // cartão, ou seja, um botão sem contorno visível. O azul da marca dá 6,94:1
  // no claro e 5,41:1 no escuro.
  secundario: 'border border-acao bg-superficie text-firme hover:bg-realce',
  // `border-perigo` e não `border-perigo-borda`: aquela reprovava no escuro
  // (2,26:1). Esta dá 4,83:1 no claro e 5,29:1 no escuro.
  perigo: 'border border-perigo bg-perigo-fundo text-perigo-forte hover:opacity-90',
} as const

export function Botao({
  children,
  variante = 'primario',
  tipo = 'submit',
  icone,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'type'> & {
  variante?: keyof typeof VARIANTES
  tipo?: 'submit' | 'button'
  icone?: NomeIcone
}) {
  return (
    <button
      type={tipo}
      className={`${BASE} disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {icone && <Icone nome={icone} />}
      {children}
    </button>
  )
}

/**
 * Um link com cara de botão.
 *
 * Existe porque `Botao` renderiza `<button>`, e navegação não é botão: quem
 * usa teclado espera Enter num link e Espaço num botão, e um leitor de tela
 * anuncia coisas diferentes. Trocar a semântica para ganhar aparência é o tipo
 * de atalho que só cobra depois.
 *
 * Mesma `BASE` e mesmas `VARIANTES` do botão, para que "como é um secundário"
 * continue tendo uma resposta só.
 */
export function LinkBotao({
  children,
  href,
  variante = 'secundario',
  icone,
  className = '',
  ...props
}: Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string
  variante?: keyof typeof VARIANTES
  icone?: NomeIcone
}) {
  return (
    <Link
      href={href}
      // `min-h-11`: o botão tira a altura do preenchimento do formulário, e um
      // link solto na página não tem esse contexto — sem isto ele sairia mais
      // baixo que os botões ao lado, e menor que o alvo de toque mínimo.
      className={`${BASE} min-h-11 py-2 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {icone && <Icone nome={icone} />}
      {children}
    </Link>
  )
}
