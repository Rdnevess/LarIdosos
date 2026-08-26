import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarContasBancarias } from '@/modules/financeiro/instituicao.service'
import {
  listarPrestacoes,
  calcularSaldoAnterior,
} from '@/modules/financeiro/prestacoes.service'
import { listarLancamentos } from '@/modules/financeiro/lancamentos.service'
import { formatarMoeda } from '@/lib/ptbr'
import { mesPorExtenso } from '@/modules/financeiro/textos-prestacao'
import {
  FormularioAbrirPrestacao,
  FormularioAjustarSaldo,
  FormularioObservacoes,
  FormularioFecharPrestacao,
  FormularioReabrirPrestacao,
} from '@/components/formularios-financeiro'
import { fimDoMes } from '@/lib/periodo'
import { Etiqueta } from '@/components/ui/etiqueta'

/**
 * As prestações de contas, por conta e competência.
 *
 * Os totais exibidos são recalculados a cada visita, de propósito: enquanto a
 * prestação está aberta eles ainda podem mudar, e mostrar um número guardado
 * seria mostrar o passado. Depois de fechada, os lançamentos estão congelados e
 * o número para de se mover sozinho.
 *
 * Quem manda no que aparece é o serviço: fechar e reabrir são só de
 * COORDENACAO, e o ADMINISTRATIVO que apertar o botão recebe a recusa em
 * português — a tela não esconde o botão porque esconder não é permissão, e um
 * botão que some sem explicação vira chamado de suporte.
 */

type Filtros = { conta?: string; ano?: string }

async function totaisDa(
  ctx: Awaited<ReturnType<typeof obterCtx>>,
  contaBancariaId: string,
  ano: number,
  mes: number
): Promise<{ receitas: number; despesas: number }> {
  const lancamentos = await listarLancamentos(ctx, {
    contaBancariaId,
    de: new Date(ano, mes - 1, 1),
    ate: fimDoMes(ano, mes),
  })

  let receitas = 0
  let despesas = 0
  for (const lancamento of lancamentos) {
    if (lancamento.status !== 'REALIZADO') continue
    if (lancamento.natureza === 'RECEITA') receitas += Number(lancamento.valor)
    else despesas += Number(lancamento.valor)
  }

  return { receitas: Math.round(receitas * 100) / 100, despesas: Math.round(despesas * 100) / 100 }
}

export default async function PaginaPrestacoes({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const ctx = await obterCtx()
  const filtros = await searchParams
  const contas = await listarContasBancarias(ctx)

  // O filtro aceita o número da conta, que é o que a pessoa tem na mão — o id
  // é detalhe do banco e não deveria precisar aparecer na barra de endereço.
  const contaFiltrada = filtros.conta
    ? contas.find((conta) => conta.numeroConta === filtros.conta)
    : undefined

  const prestacoes = await listarPrestacoes(ctx, {
    contaBancariaId: contaFiltrada?.id,
    anoCompetencia: filtros.ano ? Number(filtros.ano) : undefined,
  })

  const porConta = new Map(contas.map((conta) => [conta.id, conta]))

  const cartoes = await Promise.all(
    prestacoes.map(async (prestacao) => {
      const { receitas, despesas } = await totaisDa(
        ctx,
        prestacao.contaBancariaId,
        prestacao.anoCompetencia,
        prestacao.mesCompetencia
      )
      const derivado = await calcularSaldoAnterior(
        ctx,
        prestacao.contaBancariaId,
        prestacao.anoCompetencia,
        prestacao.mesCompetencia
      )
      const saldoAnterior = Number(prestacao.saldoAnteriorAjustado ?? prestacao.saldoAnterior)

      return {
        prestacao,
        receitas,
        despesas,
        derivado,
        saldoAnterior,
        saldoDisponivel: Math.round((saldoAnterior + receitas - despesas) * 100) / 100,
      }
    })
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-forte">Prestações de contas</h1>
          <p className="text-sm text-apoio">Uma por conta bancária, por mês.</p>
        </div>
        <Link href="/financeiro" className="text-sm underline">
          Voltar aos lançamentos
        </Link>
      </div>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          <h2 className="inline">Abrir prestação</h2>
        </summary>
        <div className="mt-4">
          <FormularioAbrirPrestacao
            contas={contas.map((conta) => ({
              valor: conta.id,
              rotulo: `${conta.banco} — ${conta.numeroConta}`,
            }))}
          />
        </div>
      </details>

      {cartoes.map(
        ({ prestacao, receitas, despesas, derivado, saldoAnterior, saldoDisponivel }) => {
          const conta = porConta.get(prestacao.contaBancariaId)
          const aberta = prestacao.status === 'ABERTA'
          const ajustado = prestacao.saldoAnteriorAjustado !== null

          return (
            <article key={prestacao.id} className="space-y-3 cartao p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium text-forte">
                  {mesPorExtenso(prestacao.mesCompetencia)} de {prestacao.anoCompetencia}
                  {conta && ` — ${conta.banco} ${conta.numeroConta}`}
                </h2>
                <Etiqueta tom={aberta ? 'alerta' : 'sucesso'}>
                  {aberta ? 'Aberta' : 'Fechada'}
                </Etiqueta>
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-apoio">Saldo anterior</dt>
                  <dd className="font-semibold text-forte">
                    {formatarMoeda(saldoAnterior)}
                    {ajustado && (
                      <span className="block text-xs font-normal text-alerta-suave">
                        ajustado (derivado: {formatarMoeda(derivado)})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-apoio">Receitas</dt>
                  <dd className="font-semibold text-forte">{formatarMoeda(receitas)}</dd>
                </div>
                <div>
                  <dt className="text-apoio">Despesas</dt>
                  <dd className="font-semibold text-forte">{formatarMoeda(despesas)}</dd>
                </div>
                <div>
                  <dt className="text-apoio">Saldo disponível</dt>
                  <dd className="font-semibold text-forte">
                    {formatarMoeda(saldoDisponivel)}
                  </dd>
                </div>
              </dl>

              {prestacao.justificativaAjuste && (
                <p className="text-sm text-medio">
                  Ajuste do saldo: {prestacao.justificativaAjuste}
                </p>
              )}
              {prestacao.motivoReabertura && (
                <p className="text-sm text-medio">
                  Reaberta: {prestacao.motivoReabertura}
                </p>
              )}

              {!aberta && (
                <p className="flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/api/prestacoes/${prestacao.id}/xlsx`}
                    className="underline"
                    prefetch={false}
                  >
                    Baixar .xlsx
                  </Link>
                  <Link
                    href={`/api/prestacoes/${prestacao.id}/pdf`}
                    className="underline"
                    prefetch={false}
                  >
                    Baixar PDF
                  </Link>
                  {/* O CSV é para o contador: ele não usa o sistema, recebe um
                      arquivo e importa. */}
                  <Link
                    href={`/api/prestacoes/${prestacao.id}/csv`}
                    className="underline"
                    prefetch={false}
                  >
                    Baixar CSV para o contador
                  </Link>
                </p>
              )}

              {aberta ? (
                <div className="space-y-2">
                  <details>
                    <summary className="cursor-pointer text-sm text-medio underline">
                      Observações do mês
                    </summary>
                    <div className="mt-2">
                      <FormularioObservacoes id={prestacao.id} atual={prestacao.observacoes} />
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm text-medio underline">
                      Ajustar saldo anterior
                    </summary>
                    <div className="mt-2">
                      <FormularioAjustarSaldo id={prestacao.id} saldoDerivado={derivado} />
                    </div>
                  </details>
                  <FormularioFecharPrestacao id={prestacao.id} />
                </div>
              ) : (
                <details>
                  <summary className="cursor-pointer text-sm text-medio underline">
                    Reabrir esta prestação
                  </summary>
                  <div className="mt-2">
                    <FormularioReabrirPrestacao id={prestacao.id} />
                  </div>
                </details>
              )}
            </article>
          )
        }
      )}

      {cartoes.length === 0 && (
        <p className="cartao p-4 text-sm text-apoio">
          Nenhuma prestação aberta ainda.
        </p>
      )}
    </section>
  )
}
