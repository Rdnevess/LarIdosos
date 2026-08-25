import Link from 'next/link'
import type { DoseDoTurno, MapaDoTurno as Mapa } from '@/modules/health/mapa-do-turno'
import { ROTULO_TURNO } from '@/lib/turno'
import { formatarData } from '@/lib/ptbr'
import { BotaoAdministrada, FormularioRegistrarDose } from './formularios-medicacao'

/**
 * A tela mais usada do sistema.
 *
 * Agrupada por horário, e não por residente: a equipe percorre o corredor às
 * 08:00 dando os remédios das 08:00 de todo mundo. Uma dose por linha, alvo de
 * toque grande, e o botão de administrar sem formulário no caminho.
 */

const ROTULO_ESTADO: Record<DoseDoTurno['estado'], string> = {
  PREVISTA: 'Prevista',
  ATRASADA: 'Atrasada',
  SEM_REGISTRO: 'Sem registro',
  ADMINISTRADA: 'Administrada',
  RECUSADA: 'Recusada',
  NAO_ADMINISTRADA: 'Não administrada',
}

const ROTULO_MOTIVO: Record<string, string> = {
  IDOSO_HOSPITALIZADO: 'idoso hospitalizado',
  IDOSO_AUSENTE: 'idoso ausente',
  MEDICAMENTO_EM_FALTA: 'medicamento em falta',
  SUSPENSA_MEDICO: 'suspensa pelo médico',
  RECUSA_IDOSO: 'recusa do idoso',
  OUTRO: 'outro',
}

/**
 * "Sem registro" recebe o mesmo peso visual de "atrasada" de propósito: as
 * duas pedem ação humana. O que elas nunca são é "não administrada" — a dose
 * pode ter sido dada e apenas não marcada.
 */
const CLASSE_ESTADO: Record<DoseDoTurno['estado'], string> = {
  PREVISTA: 'text-apoio',
  ATRASADA: 'font-medium text-alerta-suave',
  SEM_REGISTRO: 'font-medium text-alerta-suave',
  ADMINISTRADA: 'text-sucesso',
  RECUSADA: 'text-medio',
  NAO_ADMINISTRADA: 'text-medio',
}

function hora(momento: Date): string {
  return `${String(momento.getHours()).padStart(2, '0')}:${String(
    momento.getMinutes()
  ).padStart(2, '0')}`
}

function porHorario(doses: DoseDoTurno[]): [string, DoseDoTurno[]][] {
  const grupos = new Map<string, DoseDoTurno[]>()
  for (const dose of doses) {
    const chave = hora(dose.horarioPrevisto)
    grupos.set(chave, [...(grupos.get(chave) ?? []), dose])
  }
  return [...grupos.entries()]
}

export function MapaDoTurno({ mapa, ehTurnoCorrente }: { mapa: Mapa; ehTurnoCorrente: boolean }) {
  const grupos = porHorario(mapa.doses)

  return (
    <div className="space-y-6">
      <section aria-label="Doses do turno" className="space-y-4">
        {grupos.map(([horario, doses]) => (
          <div key={horario} className="rounded border bg-superficie p-4">
            <h2 className="mb-3 text-lg font-semibold text-forte">{horario}</h2>
            <ul className="divide-y">
              {doses.map((dose) => (
                <li
                  key={`${dose.medicacaoId}-${dose.horarioPrevisto.getTime()}`}
                  className={
                    dose.estado === 'ATRASADA' || dose.estado === 'SEM_REGISTRO'
                      ? 'border-l-4 border-alerta-borda-forte bg-alerta-fundo py-3 pl-3'
                      : 'py-3'
                  }
                >
                  <Link
                    href={`/residentes/${dose.residenteId}/prontuario`}
                    className="font-medium text-forte underline"
                  >
                    {dose.residenteNome}
                  </Link>
                  <p className="text-sm text-medio">
                    {dose.farmaco} · {dose.dose} · {dose.via.toLowerCase()}
                  </p>
                  {dose.instrucoes && (
                    <p className="text-sm text-apoio">{dose.instrucoes}</p>
                  )}
                  <p className={`text-sm ${CLASSE_ESTADO[dose.estado]}`}>
                    {ROTULO_ESTADO[dose.estado]}
                    {dose.motivo && ` — ${ROTULO_MOTIVO[dose.motivo] ?? dose.motivo}`}
                    {dose.registroTardio && ' · registro fora do turno'}
                  </p>
                  {dose.observacao && (
                    <p className="text-sm text-apoio">{dose.observacao}</p>
                  )}

                  {dose.estado !== 'ADMINISTRADA' &&
                    dose.estado !== 'RECUSADA' &&
                    dose.estado !== 'NAO_ADMINISTRADA' && (
                      <div className="mt-2 space-y-1">
                        {ehTurnoCorrente && (
                          <BotaoAdministrada
                            medicacaoId={dose.medicacaoId}
                            residenteId={dose.residenteId}
                            horarioPrevisto={dose.horarioPrevisto}
                          />
                        )}
                        <FormularioRegistrarDose
                          medicacaoId={dose.medicacaoId}
                          residenteId={dose.residenteId}
                          horarioPrevisto={dose.horarioPrevisto}
                          tardio={!ehTurnoCorrente}
                        />
                      </div>
                    )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {grupos.length === 0 && (
          <p className="rounded border bg-superficie p-4 text-sm text-apoio">
            Nenhuma dose de horário fixo neste turno.
          </p>
        )}
      </section>

      <section aria-label="Se necessário" className="rounded border bg-superficie p-4">
        <h2 className="mb-1 font-medium text-forte">
          Se necessário ({mapa.seNecessario.length})
        </h2>
        <p className="mb-3 text-sm text-apoio">
          Não têm dose prevista: registram-se quando a necessidade aparece.
        </p>
        <ul className="divide-y">
          {mapa.seNecessario.map((medicacao) => (
            <li key={medicacao.medicacaoId} className="py-3">
              <Link
                href={`/residentes/${medicacao.residenteId}/prontuario`}
                className="font-medium text-forte underline"
              >
                {medicacao.residenteNome}
              </Link>
              <p className="text-sm text-medio">
                {medicacao.farmaco} · {medicacao.dose} · {medicacao.via.toLowerCase()}
              </p>
              {medicacao.instrucoes && (
                <p className="text-sm text-apoio">{medicacao.instrucoes}</p>
              )}
              <FormularioRegistrarDose
                medicacaoId={medicacao.medicacaoId}
                residenteId={medicacao.residenteId}
                horarioPrevisto={null}
                tardio={false}
              />
            </li>
          ))}
          {mapa.seNecessario.length === 0 && (
            <li className="py-2 text-sm text-apoio">
              Nenhuma medicação de uso condicional prescrita.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

export function CabecalhoDoTurno({ mapa }: { mapa: Mapa }) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-forte">
        Turno da {ROTULO_TURNO[mapa.janela.turno].toLowerCase()}
      </h1>
      <p className="text-sm text-apoio">
        {formatarData(mapa.janela.inicio)}, das {hora(mapa.janela.inicio)} às{' '}
        {hora(mapa.janela.fim)} · {mapa.doses.length} dose(s)
      </p>
    </div>
  )
}
