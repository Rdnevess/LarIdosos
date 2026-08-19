import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarResidentes } from '@/modules/residents/residentes.service'
import { formatarData } from '@/lib/ptbr'

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
        <h1 className="text-lg font-semibold text-slate-800">Residentes</h1>
        {podeCadastrar && (
          <Link
            href="/residentes/novo"
            className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
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
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-base"
        />
        <select
          name="status"
          defaultValue={status ?? 'ATIVO'}
          aria-label="Situação"
          className="rounded border border-slate-300 px-3 py-2 text-base"
        >
          <option value="ATIVO">Ativos</option>
          <option value="DESLIGADO">Desligados</option>
          <option value="FALECIDO">Falecidos</option>
        </select>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      {residentes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum residente encontrado.</p>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {residentes.map((residente) => (
            <li key={residente.id}>
              <Link
                href={`/residentes/${residente.id}`}
                className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50"
              >
                <span>
                  <span className="block font-medium text-slate-800">
                    {residente.nomeSocial || residente.nomeCompleto}
                  </span>
                  <span className="block text-sm text-slate-500">
                    Quarto {residente.quarto ?? '—'} · Admissão em{' '}
                    {formatarData(residente.dataAdmissao)}
                  </span>
                </span>
                <span aria-hidden className="text-slate-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
