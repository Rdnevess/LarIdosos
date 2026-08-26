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
  secundario: 'border border-borda bg-superficie text-firme hover:bg-realce',
  perigo: 'border border-perigo-borda bg-perigo-fundo text-perigo-forte hover:opacity-90',
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
