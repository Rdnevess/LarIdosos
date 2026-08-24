import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { formatarData } from '@/lib/ptbr'

/**
 * A linha do tempo do residente: evoluções e intercorrências, sinais vitais,
 * exames, consultas e mudanças de grau, em fluxo cronológico único.
 *
 * É como a equipe pensa sobre o idoso — "o que aconteceu com ela nas últimas
 * semanas" — e não "abra a aba de exames".
 *
 * **Não inclui a anotação geral da ficha cadastral.** Se ela entrasse aqui, o
 * mesmo dado teria dois níveis de acesso conforme a tela por onde fosse lido,
 * e a fronteira do ADMINISTRATIVO deixaria de fazer sentido.
 *
 * **Implementação:** cinco consultas indexadas por residente, unidas e
 * ordenadas em memória. Não há tabela de índice nem `UNION` em SQL cru. Com
 * trinta residentes e janela padrão de 90 dias, cada consulta devolve dezenas
 * de linhas, e a alternativa custaria a tipagem do Prisma de ponta a ponta. O
 * dia em que isso doer é o dia de medir antes de mudar — não antes.
 */

export type TipoEvento =
  | 'ANOTACAO_SAUDE'
  | 'SINAL_VITAL'
  | 'EXAME'
  | 'CONSULTA'
  | 'GRAU_DEPENDENCIA'

export type EventoLinhaDoTempo = {
  id: string
  tipo: TipoEvento
  ocorridoEm: Date
  titulo: string
  detalhe: string | null
}

export type FiltrosLinhaDoTempo = {
  tipos?: TipoEvento[]
  de?: Date
  ate?: Date
}

const JANELA_PADRAO_DIAS = 90

export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = {
  ANOTACAO_SAUDE: 'Anotação',
  SINAL_VITAL: 'Sinais vitais',
  EXAME: 'Exame',
  CONSULTA: 'Consulta',
  GRAU_DEPENDENCIA: 'Grau de dependência',
}

const ROTULO_CATEGORIA: Record<string, string> = {
  EVOLUCAO: 'Evolução',
  INTERCORRENCIA: 'Intercorrência',
  ALIMENTACAO: 'Alimentação',
  SONO: 'Sono',
  HIGIENE: 'Higiene',
  COMPORTAMENTO: 'Comportamento',
  QUEDA: 'Queda',
}

const ROTULO_TURNO: Record<string, string> = {
  MANHA: 'manhã',
  TARDE: 'tarde',
  NOITE: 'noite',
}

const ROTULO_STATUS_EXAME: Record<string, string> = {
  SOLICITADO: 'solicitado',
  AGENDADO: 'agendado',
  REALIZADO: 'realizado',
  RESULTADO_RECEBIDO: 'resultado recebido',
  CANCELADO: 'cancelado',
}

const ROTULO_STATUS_CONSULTA: Record<string, string> = {
  AGENDADA: 'agendada',
  REALIZADA: 'realizada',
  CANCELADA: 'cancelada',
}

function resumirMedidas(sinal: {
  pressaoSistolica: number | null
  pressaoDiastolica: number | null
  frequenciaCardiaca: number | null
  temperatura: unknown
  saturacaoO2: number | null
  glicemia: number | null
  peso: unknown
}): string {
  const partes: string[] = []
  if (sinal.pressaoSistolica && sinal.pressaoDiastolica) {
    partes.push(`PA ${sinal.pressaoSistolica}×${sinal.pressaoDiastolica}`)
  }
  if (sinal.frequenciaCardiaca) partes.push(`FC ${sinal.frequenciaCardiaca}`)
  if (sinal.temperatura) {
    partes.push(`${Number(sinal.temperatura).toFixed(1).replace('.', ',')} °C`)
  }
  if (sinal.saturacaoO2) partes.push(`SpO₂ ${sinal.saturacaoO2}%`)
  if (sinal.glicemia) partes.push(`Glicemia ${sinal.glicemia}`)
  if (sinal.peso) partes.push(`${Number(sinal.peso).toFixed(1).replace('.', ',')} kg`)
  return partes.join(' · ')
}

export async function montarLinhaDoTempo(
  ctx: Ctx,
  residenteId: string,
  filtros: FiltrosLinhaDoTempo = {}
): Promise<EventoLinhaDoTempo[]> {
  // Uma checagem só: a linha do tempo é uma leitura só, ainda que reúna cinco
  // origens. Não audita `VISUALIZAR` — a página do prontuário já o faz uma vez
  // por abertura, e somar uma linha por filtro aplicado encheria a trilha sem
  // acrescentar rastro nenhum.
  exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')

  const ate = filtros.ate ?? new Date()
  const de =
    filtros.de ?? new Date(ate.getTime() - JANELA_PADRAO_DIAS * 24 * 60 * 60 * 1000)
  const querAtipo = (tipo: TipoEvento) => !filtros.tipos || filtros.tipos.includes(tipo)

  const [anotacoes, sinais, exames, consultas, avaliacoes] = await Promise.all([
    querAtipo('ANOTACAO_SAUDE')
      ? prisma.anotacaoSaude.findMany({
          where: { residenteId, ocorridoEm: { gte: de, lte: ate } },
        })
      : [],
    querAtipo('SINAL_VITAL')
      ? prisma.sinalVital.findMany({
          where: { residenteId, aferidoEm: { gte: de, lte: ate } },
        })
      : [],
    // O exame não tem uma data só: ele é filtrado e posicionado pela mais
    // recente que tiver. Por isso a janela é aplicada depois, em memória.
    querAtipo('EXAME') ? prisma.exame.findMany({ where: { residenteId } }) : [],
    querAtipo('CONSULTA')
      ? prisma.consulta.findMany({
          where: { residenteId, dataHora: { gte: de, lte: ate } },
        })
      : [],
    // Consulta direta, e não `listarAvaliacoes`: aquela audita `VISUALIZAR` a
    // cada chamada, e somaria uma linha à trilha por carregamento da tela.
    querAtipo('GRAU_DEPENDENCIA')
      ? prisma.avaliacaoDependencia.findMany({
          where: { residenteId, dataAvaliacao: { gte: de, lte: ate } },
        })
      : [],
  ])

  const eventos: EventoLinhaDoTempo[] = [
    ...anotacoes.map((a) => ({
      id: a.id,
      tipo: 'ANOTACAO_SAUDE' as const,
      ocorridoEm: a.ocorridoEm,
      titulo: `${ROTULO_CATEGORIA[a.categoria] ?? a.categoria} · turno da ${
        ROTULO_TURNO[a.turno] ?? a.turno
      }${a.retificaAnotacaoSaudeId ? ' · retificação' : ''}`,
      detalhe: a.conduta ? `${a.texto} — conduta: ${a.conduta}` : a.texto,
    })),
    ...sinais.map((s) => ({
      id: s.id,
      tipo: 'SINAL_VITAL' as const,
      ocorridoEm: s.aferidoEm,
      titulo: resumirMedidas(s),
      detalhe: s.observacao,
    })),
    ...exames
      .map((e) => ({
        id: e.id,
        tipo: 'EXAME' as const,
        // A data do que houve de mais recente com o exame: um pedido de maio
        // com resultado em agosto pertence a agosto na linha do tempo.
        ocorridoEm: e.dataResultado ?? e.dataRealizacao ?? e.dataSolicitacao ?? e.criadoEm,
        titulo: `${e.tipo} — ${ROTULO_STATUS_EXAME[e.status] ?? e.status}`,
        detalhe: e.resumoResultado,
      }))
      .filter((e) => e.ocorridoEm >= de && e.ocorridoEm <= ate),
    ...consultas.map((c) => ({
      id: c.id,
      tipo: 'CONSULTA' as const,
      ocorridoEm: c.dataHora,
      titulo: `${c.especialidade} — ${ROTULO_STATUS_CONSULTA[c.status] ?? c.status}`,
      detalhe: c.conduta ?? c.motivo,
    })),
    ...avaliacoes.map((a) => ({
      id: a.id,
      tipo: 'GRAU_DEPENDENCIA' as const,
      ocorridoEm: a.dataAvaliacao,
      titulo: `Grau ${a.grau}`,
      detalhe: `Avaliado por ${a.avaliadorNome}${
        a.justificativa ? ` — ${a.justificativa}` : ''
      } em ${formatarData(a.dataAvaliacao)}`,
    })),
  ]

  // Decrescente pelo momento do evento, com o `id` desempatando: a ordem
  // precisa ser estável entre carregamentos, o mesmo cuidado que
  // `listarDocumentos` já toma.
  eventos.sort(
    (a, b) => b.ocorridoEm.getTime() - a.ocorridoEm.getTime() || b.id.localeCompare(a.id)
  )

  return eventos
}
