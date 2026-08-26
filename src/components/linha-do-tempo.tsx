import type {
  EventoLinhaDoTempo,
  TipoEvento,
} from '@/modules/health/linha-do-tempo'
import { ROTULO_TIPO_EVENTO } from '@/modules/health/linha-do-tempo'
import { formatarDataHora } from '@/lib/ptbr'
import { Botao } from '@/components/ui/botao'

/**
 * O fluxo cronológico único do prontuário.
 *
 * O filtro é um formulário de servidor que escreve na query string, como o de
 * `/auditoria` já faz — sem estado de cliente. A tela toda continua sendo
 * componente de servidor, e o filtro sobrevive a um recarregamento e a um link
 * copiado.
 */

const TIPOS: TipoEvento[] = [
  'ANOTACAO_SAUDE',
  'SINAL_VITAL',
  'EXAME',
  'CONSULTA',
  'GRAU_DEPENDENCIA',
]

export function LinhaDoTempo({
  eventos,
  tipoSelecionado,
  residenteId,
}: {
  eventos: EventoLinhaDoTempo[]
  tipoSelecionado?: string
  residenteId: string
}) {
  return (
    <section
      aria-labelledby="titulo-linha-do-tempo"
      className="space-y-3 rounded border bg-superficie p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-linha-do-tempo" className="font-medium text-forte">
          Linha do tempo
        </h2>
        <form action={`/residentes/${residenteId}/prontuario`} className="flex gap-2">
          <select
            name="tipo"
            defaultValue={tipoSelecionado ?? ''}
            aria-label="Tipo de evento"
            className="rounded border border-borda px-3 py-2 text-base"
          >
            <option value="">Todos os tipos</option>
            {TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULO_TIPO_EVENTO[tipo]}
              </option>
            ))}
          </select>
          <Botao variante="secundario">Filtrar</Botao>
        </form>
      </div>

      <p className="text-sm text-apoio">
        Últimos 90 dias · {eventos.length} evento(s)
      </p>

      <ul className="space-y-3">
        {eventos.map((evento) => (
          <li key={`${evento.tipo}-${evento.id}`} className="border-l-2 border-borda-suave pl-3">
            <p className="text-sm text-apoio">
              {formatarDataHora(evento.ocorridoEm)} · {ROTULO_TIPO_EVENTO[evento.tipo]}
            </p>
            <p className="font-medium text-forte">{evento.titulo}</p>
            {evento.detalhe && <p className="text-sm text-medio">{evento.detalhe}</p>}
          </li>
        ))}
        {eventos.length === 0 && (
          <li className="text-sm text-apoio">
            Nada registrado no período e no filtro selecionados.
          </li>
        )}
      </ul>
    </section>
  )
}
