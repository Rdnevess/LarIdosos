import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarPendencias } from '@/modules/health/pendencias'
import { formatarData, formatarDataHora } from '@/lib/ptbr'

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

export default async function PaginaPendencias() {
  const ctx = await obterCtx()
  const { exames, consultas } = await listarPendencias(ctx)

  const agora = new Date()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-forte">Pendências</h1>
        <p className="text-sm text-apoio">
          De todos os residentes, da mais antiga para a mais recente.
        </p>
      </div>

      <div className="rounded border bg-superficie p-4">
        <h2 className="mb-3 font-medium text-forte">
          Exames em aberto ({exames.length})
        </h2>
        <ul className="divide-y">
          {exames.map((exame) => (
            <li key={exame.id} className="py-2 text-sm">
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
            <li className="py-2 text-sm text-apoio">
              Nenhum exame aguardando andamento.
            </li>
          )}
        </ul>
      </div>

      <div className="rounded border bg-superficie p-4">
        <h2 className="mb-3 font-medium text-forte">
          Consultas agendadas ({consultas.length})
        </h2>
        <ul className="divide-y">
          {consultas.map((consulta) => {
            // A consulta que aconteceu e ninguém registrou é indistinguível,
            // para o sistema, da que foi esquecida — e as duas precisam da
            // mesma atenção humana. Por isso a data passada é destacada, e não
            // escondida.
            const atrasada = consulta.dataHora < agora
            return (
              <li key={consulta.id} className="py-2 text-sm">
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
            <li className="py-2 text-sm text-apoio">Nenhuma consulta agendada.</li>
          )}
        </ul>
      </div>
    </section>
  )
}
