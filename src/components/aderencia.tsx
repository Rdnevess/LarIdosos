import type { Aderencia } from '@/modules/health/aderencia'

/**
 * O relatório de aderência do residente.
 *
 * O número em destaque é o **percentual sem registro**. Ele não mede o
 * cuidado: mede a disciplina de anotar. Somá-lo a "não administrada"
 * esconderia as duas coisas — uma é falha de anotação, a outra é decisão de
 * alguém, e elas se corrigem de maneiras diferentes.
 */

const ROTULO_MOTIVO: Record<string, string> = {
  IDOSO_HOSPITALIZADO: 'Idoso hospitalizado',
  IDOSO_AUSENTE: 'Idoso ausente',
  MEDICAMENTO_EM_FALTA: 'Medicamento em falta',
  SUSPENSA_MEDICO: 'Suspensa pelo médico',
  RECUSA_IDOSO: 'Recusa do idoso',
  OUTRO: 'Outro',
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs uppercase tracking-wide text-apoio">{rotulo}</p>
      <p className="text-lg font-semibold text-forte">{valor}</p>
    </div>
  )
}

export function RelatorioAderencia({ aderencia }: { aderencia: Aderencia }) {
  if (aderencia.previstas === 0) {
    return (
      <p className="text-sm text-apoio">
        Nenhuma dose prevista no período — não há prescrição de horário fixo vigente.
      </p>
    )
  }

  const motivos = Object.entries(aderencia.porMotivo)

  return (
    <div className="space-y-3">
      <div
        className={
          aderencia.percentualSemRegistro > 0
            ? 'rounded border border-alerta-borda bg-alerta-fundo p-3'
            : 'rounded border p-3'
        }
      >
        <p className="text-xs uppercase tracking-wide text-apoio">
          Doses sem registro
        </p>
        <p className="text-2xl font-semibold text-forte">
          {aderencia.percentualSemRegistro}%
        </p>
        <p className="text-sm text-medio">
          {aderencia.semRegistro} de {aderencia.previstas} doses previstas. Sem
          registro não é o mesmo que não administrada: a dose pode ter sido dada e
          apenas não marcada.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Numero rotulo="Previstas" valor={aderencia.previstas} />
        <Numero rotulo="Administradas" valor={aderencia.administradas} />
        <Numero rotulo="Recusadas" valor={aderencia.recusadas} />
        <Numero rotulo="Não administradas" valor={aderencia.naoAdministradas} />
      </div>

      {motivos.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-apoio">
            Motivos
          </h3>
          <ul className="mt-1 space-y-1">
            {motivos.map(([motivo, quantas]) => (
              <li key={motivo} className="text-sm text-firme">
                {ROTULO_MOTIVO[motivo] ?? motivo}: {quantas}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aderencia.registradasForaDoTurno > 0 && (
        <p className="text-sm text-apoio">
          {aderencia.registradasForaDoTurno} dose(s) registrada(s) fora do turno em
          que aconteceram. Elas contam entre as administradas — isto mede
          disciplina de registro, não de administração.
        </p>
      )}
    </div>
  )
}
