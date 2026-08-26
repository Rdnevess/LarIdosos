/**
 * A superfície do sistema.
 *
 * `rounded-lg` e não `rounded`: o raio de 4px que estava em 103 lugares é o
 * padrão do Tailwind, não uma escolha — e lê como formulário de intranet.
 */
export function Cartao({
  titulo,
  acao,
  children,
}: {
  titulo?: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-secao font-semibold text-forte">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}
