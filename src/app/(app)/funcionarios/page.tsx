import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import {
  listarFuncionarios,
  listarConselhosVencendo,
} from '@/modules/staff/funcionarios.service'
import { formatarData } from '@/lib/ptbr'
import { ROTULO_VINCULO } from '@/components/formulario-funcionario'
import { Botao } from '@/components/ui/botao'

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
        <h1 className="text-lg font-semibold text-forte">Funcionários</h1>
        <Link
          href="/funcionarios/novo"
          className="min-h-11 inline-flex items-center rounded bg-acao px-3 py-2 text-sm text-sobre-acao"
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
        <div role="status" className="rounded border border-alerta-borda bg-alerta-fundo p-3 text-sm">
          <p className="font-medium text-alerta">
            {vencendo.length} registro(s) profissional(is) vencendo nos próximos 60 dias
          </p>
          <ul className="mt-1 text-alerta-suave">
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
          className="flex-1 rounded border border-borda px-3 py-2 text-base"
        />
        <Botao variante="secundario">Filtrar</Botao>
      </form>

      <ul className="divide-y cartao">
        {funcionarios.map((funcionario) => (
          <li key={funcionario.id}>
            <Link
              href={`/funcionarios/${funcionario.id}/editar`}
              className="flex items-center justify-between gap-3 p-3 hover:bg-suave"
            >
              <span>
                <span className="block font-medium text-forte">
                  {funcionario.nomeCompleto}
                </span>
                <span className="block text-sm text-apoio">
                  {funcionario.cargo} · {ROTULO_VINCULO[funcionario.vinculo]} · desde{' '}
                  {formatarData(funcionario.dataAdmissao)}
                </span>
              </span>
              <span aria-hidden className="text-tenue">›</span>
            </Link>
          </li>
        ))}
        {funcionarios.length === 0 && (
          <li className="p-3 text-sm text-apoio">Nenhum funcionário encontrado.</li>
        )}
      </ul>
    </section>
  )
}
