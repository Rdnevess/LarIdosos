import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarContasBancarias } from '@/modules/financeiro/instituicao.service'
import { listarOrigensReceita } from '@/modules/financeiro/cadastros.service'
import { montarPropostaMensal } from '@/modules/financeiro/contribuicoes.service'
import { formatarMoeda } from '@/lib/ptbr'
import { mesPorExtenso } from '@/modules/financeiro/textos-prestacao'
import { FormularioLancarContribuicao } from '@/components/formularios-financeiro'

/**
 * A proposta de contribuições do mês.
 *
 * **O sistema propõe, não lança.** Lançar automático inventaria dinheiro que
 * pode não ter chegado; exigir trinta digitações por mês faria a equipe voltar
 * para a planilha. A proposta é o meio que não faz nenhuma das duas coisas: o
 * cálculo é do sistema, o "sim" é de quem conferiu o extrato.
 *
 * Quem já foi lançado aparece marcado, sem botão — e volta a aparecer com botão
 * se o lançamento for cancelado, senão o mês fecharia sem ele e ninguém
 * perceberia.
 */

type Filtros = { ano?: string; mes?: string }

export default async function PaginaContribuicoes({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const ctx = await obterCtx()
  const filtros = await searchParams
  const agora = new Date()
  const ano = Number(filtros.ano) || agora.getFullYear()
  const mes = Number(filtros.mes) || agora.getMonth() + 1

  const [proposta, contas, origens] = await Promise.all([
    montarPropostaMensal(ctx, ano, mes),
    listarContasBancarias(ctx),
    listarOrigensReceita(ctx),
  ])

  // A origem marcada como "exige residente" é a da contribuição; a conta é a
  // primeira que presta contas. Os dois pré-selecionados porque o caso comum
  // é haver um de cada, e perguntar em cada linha seria ruído.
  const conta = contas.find((c) => c.prestaContas) ?? contas[0]
  const origem = origens.find((o) => o.exigeResidente)

  const aLancar = proposta.filter((linha) => !linha.jaLancado)
  const total = aLancar.reduce((soma, linha) => soma + linha.valorCalculado, 0)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            Contribuições de {mesPorExtenso(mes)} de {ano}
          </h1>
          <p className="text-sm text-slate-500">
            O sistema calcula; quem lança é você, depois de conferir o extrato.
          </p>
        </div>
        <Link href="/financeiro" className="text-sm underline">
          Voltar aos lançamentos
        </Link>
      </div>

      <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="ano" className="text-sm font-medium text-slate-700">
            Ano
          </label>
          <input
            id="ano"
            name="ano"
            type="number"
            defaultValue={ano}
            className="w-full rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="mes" className="text-sm font-medium text-slate-700">
            Mês
          </label>
          <select
            id="mes"
            name="mes"
            defaultValue={String(mes)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-base"
          >
            {Array.from({ length: 12 }, (_, indice) => (
              <option key={indice + 1} value={indice + 1}>
                {mesPorExtenso(indice + 1)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="self-end rounded bg-slate-800 px-4 py-2 text-white sm:w-auto"
        >
          Ver competência
        </button>
      </form>

      {!origem && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Nenhuma origem de receita marcada como “exige informar o residente”.{' '}
          <Link href="/financeiro/cadastros" className="underline">
            Cadastre uma
          </Link>{' '}
          para poder lançar contribuições — é ela que faz a contribuição sair
          somada às demais doações na prestação, sem o nome do residente.
        </p>
      )}

      <p className="rounded border bg-white p-3 text-sm">
        <span className="block text-slate-500">Ainda a lançar ({aLancar.length})</span>
        <span className="text-lg font-semibold text-slate-800">
          {formatarMoeda(Math.round(total * 100) / 100)}
        </span>
      </p>

      <ul className="divide-y rounded border bg-white">
        {proposta.map((linha) => (
          <li key={linha.residenteId} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/residentes/${linha.residenteId}`}
                className="font-medium text-slate-800 underline"
              >
                {linha.residenteNome}
              </Link>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(linha.valorCalculado)}
              </span>
            </div>
            <p className="text-slate-500">
              {linha.percentual}% de {formatarMoeda(linha.valorBaseBeneficio)}
            </p>

            {linha.jaLancado ? (
              <p className="text-green-700">Já lançado</p>
            ) : conta && origem ? (
              <FormularioLancarContribuicao
                residenteId={linha.residenteId}
                residenteNome={linha.residenteNome}
                valor={linha.valorCalculado}
                contaBancariaId={conta.id}
                origemReceitaId={origem.id}
                ano={ano}
                mes={mes}
              />
            ) : (
              <p className="text-slate-500">
                Falta cadastrar conta bancária ou origem de contribuição.
              </p>
            )}
          </li>
        ))}
        {proposta.length === 0 && (
          <li className="p-4 text-sm text-slate-500">
            Nenhum residente com contribuição vigente nesta competência.
          </li>
        )}
      </ul>
    </section>
  )
}
