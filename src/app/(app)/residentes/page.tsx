import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarResidentes } from '@/modules/residents/residentes.service'
import { formatarData } from '@/lib/ptbr'
import { Botao } from '@/components/ui/botao'

export default async function PaginaResidentes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; status?: string }>
}) {
  const { busca, status } = await searchParams
  const ctx = await obterCtx()
  const residentes = await listarResidentes(ctx, {
    busca,
    status: (status as 'ATIVO' | 'DESLIGADO' | 'FALECIDO') || 'ATIVO',
  })

  const podeCadastrar = ctx.papel !== 'SAUDE'

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-secao font-semibold text-forte">Residentes</h1>
        {podeCadastrar && (
          <Link
            href="/residentes/novo"
            className="min-h-11 inline-flex items-center rounded bg-acao px-3 py-2 text-suporte text-sobre-acao"
          >
            Novo residente
          </Link>
        )}
      </div>

      <form className="flex gap-2">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome"
          aria-label="Buscar por nome"
          className="flex-1 rounded border border-borda px-3 py-2 text-corpo"
        />
        <select
          name="status"
          defaultValue={status ?? 'ATIVO'}
          aria-label="Situação"
          className="rounded border border-borda px-3 py-2 text-corpo"
        >
          <option value="ATIVO">Ativos</option>
          <option value="DESLIGADO">Desligados</option>
          <option value="FALECIDO">Falecidos</option>
        </select>
        <Botao variante="secundario">Filtrar</Botao>
      </form>

      {residentes.length === 0 ? (
        <p className="text-suporte text-apoio">Nenhum residente encontrado.</p>
      ) : (
        <ul className="divide-y cartao">
          {residentes.map((residente) => (
            <li key={residente.id}>
              <Link
                href={`/residentes/${residente.id}`}
                className="flex items-center justify-between gap-3 p-3 hover:bg-suave"
              >
                <span>
                  <span className="block font-medium text-forte">
                    {residente.nomeSocial || residente.nomeCompleto}
                  </span>
                  <span className="block text-suporte text-apoio">
                    Quarto {residente.quarto ?? '—'} · Admissão em{' '}
                    {formatarData(residente.dataAdmissao)}
                  </span>
                </span>
                <span aria-hidden className="text-tenue">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
