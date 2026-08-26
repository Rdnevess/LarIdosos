/**
 * A superfície do sistema.
 *
 * A aparência vem da classe `.cartao` do `globals.css`, e não daqui: a mesma
 * superfície veste `<details>`, `<form>` e `<header>`, cujas tags não podem
 * virar `<section>`. Este componente é o caso comum — uma seção com título —,
 * não o dono do estilo.
 *
 * `className` existe para o que é do lugar, e não para o que é do cartão: a
 * grade interna de uma tela (`grid gap-4 sm:grid-cols-2`), o espaçamento entre
 * os filhos (`space-y-4`). Superfície, borda, raio e respiro vêm daqui e não se
 * repetem — se você precisar reescrever um deles no chamador, é sinal de que o
 * lugar precisa de outra coisa, não de um cartão remendado.
 */
export function Cartao({
  titulo,
  acao,
  className = '',
  children,
}: {
  titulo?: string
  acao?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`cartao p-4 ${className}`}>
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
