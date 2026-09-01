import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { prisma } from '@/lib/prisma'
import { listarContasBancarias } from '@/modules/financeiro/instituicao.service'
import {
  listarOrigensReceita,
  listarCategoriasDespesa,
  listarFornecedores,
} from '@/modules/financeiro/cadastros.service'
import { listarLancamentos } from '@/modules/financeiro/lancamentos.service'
import { formatarData, formatarMoeda } from '@/lib/ptbr'
import {
  FormularioReceita,
  FormularioDespesa,
  FormularioCancelarLancamento,
} from '@/components/formularios-financeiro'
import { FormularioAnexoFinanceiro } from '@/components/formulario-anexo-financeiro'
import { fimDoDia } from '@/lib/periodo'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'

/**
 * Os lançamentos do mês.
 *
 * Filtro em query string, como `/auditoria` e `/pendencias` já fazem: o
 * endereço filtrado é compartilhável e sobrevive ao recarregamento, e a Server
 * Action que grava um lançamento não perde o filtro de quem estava olhando.
 *
 * Receita e despesa em formulários separados porque os campos obrigatórios
 * diferem — um formulário único com tudo opcional aceitaria despesa sem
 * categoria, defeito que só apareceria na hora de entregar a prestação.
 */

type Filtros = {
  conta?: string
  de?: string
  ate?: string
  natureza?: string
}

const ROTULO_STATUS: Record<string, string> = {
  REALIZADO: 'Realizado',
  PREVISTO: 'Previsto',
  CANCELADO: 'Cancelado',
}

/** Primeiro e último dia do mês corrente, no formato do `<input type="date">`. */
function mesCorrente(): { de: string; ate: string } {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { de: iso(primeiro), ate: iso(ultimo) }
}

export default async function PaginaFinanceiro({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const ctx = await obterCtx()
  const filtros = await searchParams
  const padrao = mesCorrente()
  const de = filtros.de || padrao.de
  const ate = filtros.ate || padrao.ate

  const [contas, origens, categorias, fornecedores, residentes] = await Promise.all([
    listarContasBancarias(ctx),
    listarOrigensReceita(ctx),
    listarCategoriasDespesa(ctx),
    listarFornecedores(ctx),
    prisma.residente.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, nomeCompleto: true, nomeSocial: true },
      orderBy: { nomeCompleto: 'asc' },
    }),
  ])

  const lancamentos = await listarLancamentos(ctx, {
    contaBancariaId: filtros.conta || undefined,
    de: new Date(`${de}T00:00:00`),
    ate: fimDoDia(ate),
    natureza: (filtros.natureza as 'RECEITA' | 'DESPESA') || undefined,
  })

  const porId = new Map<string, string>([
    ...origens.map((o) => [o.id, o.nome] as [string, string]),
    ...fornecedores.map((f) => [f.id, f.nome] as [string, string]),
  ])

  // Os totais desta tela são do que está filtrado, e não da competência: quem
  // fecha o mês é a prestação, e é lá que o total tem valor oficial.
  let receitas = 0
  let despesas = 0
  for (const lancamento of lancamentos) {
    if (lancamento.status === 'CANCELADO') continue
    if (lancamento.natureza === 'RECEITA') receitas += Number(lancamento.valor)
    else despesas += Number(lancamento.valor)
  }

  const opcoesConta = contas.map((conta) => ({
    valor: conta.id,
    rotulo: `${conta.banco} — ${conta.numeroConta}`,
  }))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-secao font-semibold text-forte">Financeiro</h1>
          <p className="text-suporte text-apoio">Receitas e despesas do período.</p>
        </div>
        <div className="flex gap-3 text-suporte">
          <Link href="/financeiro/cadastros" className="underline">
            Cadastros
          </Link>
          <Link href="/financeiro/prestacoes" className="underline">
            Prestações de contas
          </Link>
          <Link href="/financeiro/contribuicoes" className="underline">
            Contribuições
          </Link>
        </div>
      </div>

      {contas.length === 0 && (
        <p className="rounded border border-alerta-borda bg-alerta-fundo p-3 text-suporte text-alerta">
          Nenhuma conta bancária cadastrada.{' '}
          <Link href="/financeiro/cadastros" className="underline">
            Cadastre uma conta
          </Link>{' '}
          antes de lançar.
        </p>
      )}

      <form className="grid gap-3 cartao p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="conta" className="text-suporte font-medium text-firme">
            Conta
          </label>
          <select
            id="conta"
            name="conta"
            defaultValue={filtros.conta ?? ''}
            className="w-full rounded border border-borda px-3 py-2 text-corpo"
          >
            <option value="">Todas</option>
            {opcoesConta.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="de" className="text-suporte font-medium text-firme">
            De
          </label>
          <input
            id="de"
            name="de"
            type="date"
            defaultValue={de}
            className="w-full rounded border border-borda px-3 py-2 text-corpo"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ate" className="text-suporte font-medium text-firme">
            Até
          </label>
          <input
            id="ate"
            name="ate"
            type="date"
            defaultValue={ate}
            className="w-full rounded border border-borda px-3 py-2 text-corpo"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="natureza" className="text-suporte font-medium text-firme">
            Natureza
          </label>
          <select
            id="natureza"
            name="natureza"
            defaultValue={filtros.natureza ?? ''}
            className="w-full rounded border border-borda px-3 py-2 text-corpo"
          >
            <option value="">Todas</option>
            <option value="RECEITA">Receitas</option>
            <option value="DESPESA">Despesas</option>
          </select>
        </div>
        <Botao variante="secundario" className="sm:col-span-4">
          Filtrar
        </Botao>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <p className="cartao p-3 text-suporte">
          <span className="block text-apoio">Receitas no período</span>
          <span className="text-secao font-semibold text-forte">{formatarMoeda(receitas)}</span>
        </p>
        <p className="cartao p-3 text-suporte">
          <span className="block text-apoio">Despesas no período</span>
          <span className="text-secao font-semibold text-forte">{formatarMoeda(despesas)}</span>
        </p>
        <p className="cartao p-3 text-suporte">
          <span className="block text-apoio">Resultado</span>
          <span className="text-secao font-semibold text-forte">
            {formatarMoeda(Math.round((receitas - despesas) * 100) / 100)}
          </span>
        </p>
      </div>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          <h2 className="inline">Lançar receita</h2>
        </summary>
        <div className="mt-4">
          <FormularioReceita
            contas={opcoesConta}
            origens={origens.map((o) => ({ valor: o.id, rotulo: o.nome }))}
            residentes={residentes.map((r) => ({
              valor: r.id,
              rotulo: r.nomeSocial || r.nomeCompleto,
            }))}
          />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          <h2 className="inline">Lançar despesa</h2>
        </summary>
        <div className="mt-4">
          <FormularioDespesa
            contas={opcoesConta}
            fornecedores={fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))}
            categorias={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          />
        </div>
      </details>

      <Cartao>
        <h2 className="mb-3 font-medium text-forte">
          Lançamentos ({lancamentos.length})
        </h2>
        <ul className="divide-y">
          {lancamentos.map((lancamento) => (
            <li key={lancamento.id} className="py-3 text-suporte">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-forte">{lancamento.descricao}</span>
                <span
                  className={
                    lancamento.status === 'CANCELADO'
                      ? 'text-apoio line-through'
                      : lancamento.natureza === 'RECEITA'
                        ? 'font-semibold text-sucesso'
                        : 'font-semibold text-forte'
                  }
                >
                  {formatarMoeda(Number(lancamento.valor))}
                </span>
              </div>
              <p className="text-apoio">
                {formatarData(lancamento.data)} ·{' '}
                {lancamento.natureza === 'RECEITA' ? 'Receita' : 'Despesa'} ·{' '}
                {porId.get(lancamento.origemReceitaId ?? lancamento.fornecedorId ?? '') ?? '—'} ·{' '}
                {ROTULO_STATUS[lancamento.status]}
                {lancamento.prestacaoContasId && ' · congelado em prestação fechada'}
              </p>
              {lancamento.motivoCancelamento && (
                <p className="text-apoio">Motivo: {lancamento.motivoCancelamento}</p>
              )}
              {lancamento.natureza === 'DESPESA' && (
                <div className="space-y-2">
                  <FormularioAnexoFinanceiro
                    alvo={{ tipo: 'DESPESA_FISCAL', id: lancamento.id }}
                    rotulo="Documento fiscal"
                    anexado={
                      lancamento.documentoFiscal
                        ? {
                            id: lancamento.documentoFiscal.id,
                            nome: lancamento.documentoFiscal.nomeArquivoOriginal,
                          }
                        : null
                    }
                  />
                  <FormularioAnexoFinanceiro
                    alvo={{ tipo: 'DESPESA_COMPROVANTE', id: lancamento.id }}
                    rotulo="Comprovante de pagamento"
                    anexado={
                      lancamento.comprovantePagamento
                        ? {
                            id: lancamento.comprovantePagamento.id,
                            nome: lancamento.comprovantePagamento.nomeArquivoOriginal,
                          }
                        : null
                    }
                  />
                </div>
              )}
              {lancamento.status !== 'CANCELADO' && !lancamento.prestacaoContasId && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-medio underline">
                    Cancelar este lançamento
                  </summary>
                  <div className="mt-2">
                    <FormularioCancelarLancamento id={lancamento.id} />
                  </div>
                </details>
              )}
            </li>
          ))}
          {lancamentos.length === 0 && (
            <li className="py-2 text-suporte text-apoio">
              Nenhum lançamento no período filtrado.
            </li>
          )}
        </ul>
      </Cartao>
    </section>
  )
}
