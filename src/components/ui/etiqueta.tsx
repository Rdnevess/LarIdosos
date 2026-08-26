/**
 * Estado curto: "aberta", "fechada", "atrasada", "sem registro".
 *
 * Os tons saem dos tokens semânticos que já existem — e o dourado não está
 * entre eles de propósito: ele é filete e anel, nunca estado. Ver §3 da spec.
 */
const TONS = {
  neutro: 'bg-realce text-firme',
  alerta: 'bg-alerta-realce text-alerta',
  sucesso: 'bg-sucesso-fundo text-sucesso-forte',
  perigo: 'bg-perigo-fundo text-perigo-forte',
} as const

export function Etiqueta({
  children,
  tom = 'neutro',
}: {
  children: React.ReactNode
  tom?: keyof typeof TONS
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-legenda font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}
