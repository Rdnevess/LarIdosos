import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarPendencias } from '@/modules/health/pendencias'
import { formatarData, formatarDataHora } from '@/lib/ptbr'
import { comParametros, numeroDaPagina, tamanhoDePagina } from '@/lib/paginacao'
import { ROTULO_MEDIDA } from '@/modules/health/faixas'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { Paginacao } from '@/components/ui/paginacao'
import { acaoDispensarAlerta } from './acoes'

/**
 * A tela que atravessa residentes.
 *
 * Sem nenhuma condição de papel aqui: `listarPendencias` exige COORDENACAO ou
 * SAUDE, e um ADMINISTRATIVO que digite a URL recebe `ErroPermissao`, cai na
 * fronteira de erro e deixa linha `ACESSO_NEGADO` na trilha.
 */

const ROTULO_STATUS_EXAME: Record<string, string> = {
  SOLICITADO: 'Solicitado',
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado — aguardando resultado',
}

function nomeDe(residente: { nomeCompleto: string; nomeSocial: string | null }): string {
  return residente.nomeSocial || residente.nomeCompleto
}

export default async function PaginaPendencias({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por?: string }>
}) {
  const filtros = await searchParams
  const ctx = await obterCtx()
  const pagina = numeroDaPagina(filtros.pagina)
  const por = tamanhoDePagina(filtros.por)

  // **Um limite para a tela toda**, e não um por lista: as três são fatiadas
  // como uma sequência só — alertas, exames, consultas, nessa ordem. A
  // consequência foi escolhida e está fixada em teste: se a página encher, o
  // que cai para a seguinte é exame agendado, e nunca sinal vital.
  const resultado = await listarPendencias(ctx, { pagina, por })
  const { alertas, exames, consultas } = resultado

  const agora = new Date()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-secao font-semibold text-forte">Pendências</h1>
        <p className="text-suporte text-apoio">
          De todos os residentes, da mais antiga para a mais recente.
        </p>
      </div>

      <Cartao>
        <h2 className="mb-3 font-medium text-forte">
          Sinais vitais fora de faixa ({alertas.length} de {resultado.totalAlertas})
        </h2>
        <ul className="divide-y">
          {alertas.map((alerta) => (
            <li
              key={`${alerta.sinalVitalId}-${alerta.medida}`}
              className="flex items-start justify-between gap-3 py-2 text-suporte"
            >
              <span>
                <Link
                  href={`/residentes/${alerta.residenteId}/prontuario`}
                  className="font-medium text-forte underline"
                >
                  {alerta.residenteNome}
                </Link>
                <span className="block text-medio">
                  {ROTULO_MEDIDA[alerta.medida]} {alerta.valor} (faixa{' '}
                  {alerta.faixa.minimo ?? '—'}–{alerta.faixa.maximo ?? '—'})
                </span>
                <span className="block text-apoio">
                  {formatarDataHora(alerta.aferidoEm)}
                  {/* Uma vez pede atenção; várias seguidas pedem ajuste de
                      faixa. É o que separa o evento do padrão. */}
                  {alerta.seguidas > 1 &&
                    ` · fora há ${alerta.seguidas} aferições seguidas`}
                </span>
              </span>
              <form action={acaoDispensarAlerta}>
                <input type="hidden" name="sinalVitalId" value={alerta.sinalVitalId} />
                <input type="hidden" name="medida" value={alerta.medida} />
                <Botao variante="secundario">Dispensar</Botao>
              </form>
            </li>
          ))}
          {alertas.length === 0 && (
            <li className="py-2 text-suporte text-apoio">
              Nenhum sinal vital fora de faixa nos últimos 7 dias.
            </li>
          )}
        </ul>
      </Cartao>

      <Cartao>
        <h2 className="mb-3 font-medium text-forte">
          Exames em aberto ({exames.length} de {resultado.totalExames})
        </h2>
        <ul className="divide-y">
          {exames.map((exame) => (
            <li key={exame.id} className="py-2 text-suporte">
              <Link
                href={`/residentes/${exame.residenteId}/prontuario`}
                className="font-medium text-forte underline"
              >
                {nomeDe(exame.residente)}
              </Link>
              <span className="block text-medio">
                {exame.tipo} — {ROTULO_STATUS_EXAME[exame.status] ?? exame.status}
              </span>
              <span className="block text-apoio">
                {exame.dataSolicitacao
                  ? `Solicitado em ${formatarData(exame.dataSolicitacao)}`
                  : 'Sem data de solicitação'}
                {exame.laboratorio ? ` · ${exame.laboratorio}` : ''}
              </span>
            </li>
          ))}
          {exames.length === 0 && (
            <li className="py-2 text-suporte text-apoio">
              Nenhum exame aguardando andamento.
            </li>
          )}
        </ul>
      </Cartao>

      <Cartao>
        <h2 className="mb-3 font-medium text-forte">
          Consultas agendadas ({consultas.length} de {resultado.totalConsultas})
        </h2>
        <ul className="divide-y">
          {consultas.map((consulta) => {
            // A consulta que aconteceu e ninguém registrou é indistinguível,
            // para o sistema, da que foi esquecida — e as duas precisam da
            // mesma atenção humana. Por isso a data passada é destacada, e não
            // escondida.
            const atrasada = consulta.dataHora < agora
            return (
              <li key={consulta.id} className="py-2 text-suporte">
                <Link
                  href={`/residentes/${consulta.residenteId}/prontuario`}
                  className="font-medium text-forte underline"
                >
                  {nomeDe(consulta.residente)}
                </Link>
                <span className="block text-medio">
                  {consulta.especialidade}
                  {consulta.local ? ` · ${consulta.local}` : ''}
                </span>
                <span
                  className={
                    atrasada ? 'block font-medium text-alerta-suave' : 'block text-apoio'
                  }
                >
                  {formatarDataHora(consulta.dataHora)}
                  {atrasada && ' · data passada, aguardando registro'}
                </span>
              </li>
            )
          })}
          {consultas.length === 0 && (
            <li className="py-2 text-suporte text-apoio">Nenhuma consulta agendada.</li>
          )}
        </ul>
      </Cartao>

      <Paginacao
        pagina={pagina}
        paginas={resultado.paginas}
        total={resultado.total}
        por={por}
        rotulo="pendência(s)"
        url={(mudancas) => comParametros(filtros, mudancas)}
      />
    </section>
  )
}
