import type { ComponentProps } from 'react'
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
const VARIANTES = {
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 text-suporte font-medium transition disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {icone && <Icone nome={icone} />}
      {children}
    </button>
  )
}
