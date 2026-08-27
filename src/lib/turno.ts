/**
 * A divisão do dia em turnos, que é do sistema e não de um módulo: as
 * anotações de saúde da Fase 2A já a usavam, com uma cópia local dentro de
 * `prontuario/acoes.ts`, e a tela do turno da 2B passa a usar a mesma. Duas
 * divisões para a mesma equipe seriam duas respostas para "em que turno isso
 * aconteceu?".
 *
 * **Dia 6h–18h, noite 18h–6h.** Eram três — manhã, tarde e noite, de oito
 * horas cada — e passaram a dois, de doze, em 27/08/2026, a pedido do Lar:
 * a divisão do sistema passa a ser a mesma que a equipe usa ao dizer "no turno
 * da noite ela…".
 *
 * **O fim da janela é exclusivo.** A dose das 18:00 pertence à noite e a
 * nenhum outro turno; fosse inclusivo, ela apareceria nas duas telas e alguém
 * a daria duas vezes.
 *
 * **A noite atravessa a meia-noite**, e é o caso que mais erra numa
 * implementação ingênua: às 2h da manhã, o turno em curso começou às 18h do
 * dia anterior — não à meia-noite.
 *
 * Uma consequência que a redução trouxe e que é da tela, não daqui: o mapa do
 * turno passa a mostrar doze horas de doses em vez de oito. Foi aceita ao
 * decidir a mudança.
 *
 * Hora local, sem horário de verão: o Brasil não tem desde 2019, então nenhuma
 * janela ganha ou perde uma hora. Se voltar a ter, é este arquivo que precisa
 * ser revisto.
 */

export type NomeTurno = 'DIA' | 'NOITE'

export type JanelaTurno = {
  turno: NomeTurno
  inicio: Date
  fim: Date
}

const INICIO_DIA = 6
const INICIO_NOITE = 18

export const ROTULO_TURNO: Record<NomeTurno, string> = {
  DIA: 'Dia',
  NOITE: 'Noite',
}

export function turnoDaHora(momento: Date): NomeTurno {
  const hora = momento.getHours()
  return hora >= INICIO_DIA && hora < INICIO_NOITE ? 'DIA' : 'NOITE'
}

function em(referencia: Date, deslocamentoDeDias: number, hora: number): Date {
  const data = new Date(referencia)
  data.setDate(data.getDate() + deslocamentoDeDias)
  data.setHours(hora, 0, 0, 0)
  return data
}

export function janelaDoTurno(referencia: Date): JanelaTurno {
  const turno = turnoDaHora(referencia)

  if (turno === 'DIA') {
    return { turno, inicio: em(referencia, 0, INICIO_DIA), fim: em(referencia, 0, INICIO_NOITE) }
  }

  // A noite antes da meia-noite começa hoje; depois dela, começou ontem. Sem
  // este ramo, quem abre a tela às 2h veria um turno que começa à meia-noite
  // e perderia as doses das 18h em diante que ainda são do mesmo plantão.
  const comecouOntem = referencia.getHours() < INICIO_DIA
  return {
    turno,
    inicio: em(referencia, comecouOntem ? -1 : 0, INICIO_NOITE),
    fim: em(referencia, comecouOntem ? 0 : 1, INICIO_DIA),
  }
}

/**
 * A navegação anda pelas bordas da janela, e não por um número fixo de horas.
 * As duas janelas têm doze horas hoje, mas depender disso amarraria a
 * navegação a uma coincidência — foi o que permitiu que a passagem de três
 * turnos para dois não tocasse nestas duas funções. Um instante dentro da
 * janela vizinha é o que define o turno, e `janelaDoTurno` faz o resto.
 */
export function turnoAnterior(janela: JanelaTurno): JanelaTurno {
  const umInstanteAntes = new Date(janela.inicio.getTime() - 1)
  return janelaDoTurno(umInstanteAntes)
}

export function turnoSeguinte(janela: JanelaTurno): JanelaTurno {
  return janelaDoTurno(new Date(janela.fim.getTime()))
}
