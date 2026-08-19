import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import {
  listarFuncionarios,
  listarConselhosVencendo,
} from '@/modules/staff/funcionarios.service'
import { formatarData } from '@/lib/ptbr'
import { ROTULO_VINCULO } from '@/components/formulario-funcionario'

export default async function PaginaFuncionarios({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  const { busca } = await searchParams
  const ctx = await obterCtx()

  const [funcionarios, vencendo] = await Promise.all([
    listarFuncionarios(ctx, { busca, apenasAtivos: true }),
    listarConselhosVencendo(ctx, 60),
  ])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Funcionários</h1>
        <Link
          href="/funcionarios/novo"
          className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
        >
          Novo funcionário
        </Link>
      </div>

      {/*
        Só aparece quando há algo a mostrar: um aviso de "0 vencendo" todo dia
        treina a equipe a ignorá-lo, e é justamente o dia em que houver algo
        vencendo que precisa se destacar.
      */}
      {vencendo.length > 0 && (
        <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            {vencendo.length} registro(s) profissional(is) vencendo nos próximos 60 dias
          </p>
          <ul className="mt-1 text-amber-800">
            {vencendo.map((funcionario) => (
              <li key={funcionario.id}>
                {funcionario.nomeCompleto} — {funcionario.conselhoSigla}{' '}
                {funcionario.conselhoNumero}, validade{' '}
                {funcionario.conselhoValidade
                  ? formatarData(funcionario.conselhoValidade)
                  : '—'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="flex gap-2">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome ou cargo"
          aria-label="Buscar por nome ou cargo"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-base"
        />
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      <ul className="divide-y rounded border bg-white">
        {funcionarios.map((funcionario) => (
          <li key={funcionario.id} className="p-3">
            <span className="block font-medium text-slate-800">
              {funcionario.nomeCompleto}
            </span>
            <span className="block text-sm text-slate-500">
              {funcionario.cargo} · {ROTULO_VINCULO[funcionario.vinculo]} · desde{' '}
              {formatarData(funcionario.dataAdmissao)}
            </span>
          </li>
        ))}
        {funcionarios.length === 0 && (
          <li className="p-3 text-sm text-slate-500">Nenhum funcionário encontrado.</li>
        )}
      </ul>
    </section>
  )
}
