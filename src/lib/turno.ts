/**
 * A divisão do dia em turnos, que é do sistema e não de um módulo: as
 * anotações de saúde da Fase 2A já a usavam, com uma cópia local dentro de
 * `prontuario/acoes.ts`, e a tela do turno da 2B passa a usar a mesma. Duas
 * divisões para a mesma equipe seriam duas respostas para "em que turno isso
 * aconteceu?".
 *
 * Manhã 6h–14h, tarde 14h–22h, noite 22h–6h. Não é a divisão de escala do
 * Lar — é a que a equipe usa ao dizer "no turno da noite ela…".
 *
 * **O fim da janela é exclusivo.** A dose das 14:00 pertence à tarde e a
 * nenhum outro turno; fosse inclusivo, ela apareceria nas duas telas e alguém
 * a daria duas vezes.
 *
 * **A noite atravessa a meia-noite**, e é o caso que mais erra numa
 * implementação ingênua: às 2h da manhã, o turno em curso começou às 22h do
 * dia anterior — não à meia-noite.
 *
 * Hora local, sem horário de verão: o Brasil não tem desde 2019, então nenhuma
 * janela ganha ou perde uma hora. Se voltar a ter, é este arquivo que precisa
 * ser revisto.
 */

export type NomeTurno = 'MANHA' | 'TARDE' | 'NOITE'

export type JanelaTurno = {
  turno: NomeTurno
  inicio: Date
  fim: Date
}

const INICIO_MANHA = 6
const INICIO_TARDE = 14
const INICIO_NOITE = 22

export const ROTULO_TURNO: Record<NomeTurno, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
}

export function turnoDaHora(momento: Date): NomeTurno {
  const hora = momento.getHours()
  if (hora >= INICIO_MANHA && hora < INICIO_TARDE) return 'MANHA'
  if (hora >= INICIO_TARDE && hora < INICIO_NOITE) return 'TARDE'
  return 'NOITE'
}

function em(referencia: Date, deslocamentoDeDias: number, hora: number): Date {
  const data = new Date(referencia)
  data.setDate(data.getDate() + deslocamentoDeDias)
  data.setHours(hora, 0, 0, 0)
  return data
}

export function janelaDoTurno(referencia: Date): JanelaTurno {
  const turno = turnoDaHora(referencia)

  if (turno === 'MANHA') {
    return { turno, inicio: em(referencia, 0, INICIO_MANHA), fim: em(referencia, 0, INICIO_TARDE) }
  }

  if (turno === 'TARDE') {
    return { turno, inicio: em(referencia, 0, INICIO_TARDE), fim: em(referencia, 0, INICIO_NOITE) }
  }

  // A noite antes da meia-noite começa hoje; depois dela, começou ontem. Sem
  // este ramo, quem abre a tela às 2h veria um turno que começa à meia-noite
  // e perderia as doses das 22h e 23h que ainda são do mesmo plantão.
  const comecouOntem = referencia.getHours() < INICIO_MANHA
  return {
    turno,
    inicio: em(referencia, comecouOntem ? -1 : 0, INICIO_NOITE),
    fim: em(referencia, comecouOntem ? 0 : 1, INICIO_MANHA),
  }
}

/**
 * A navegação anda pelas bordas da janela, e não por oito horas fixas. As três
 * janelas têm oito horas hoje, mas depender disso amarraria a navegação a uma
 * coincidência: um instante dentro da janela vizinha é o que define o turno,
 * e `janelaDoTurno` faz o resto.
 */
export function turnoAnterior(janela: JanelaTurno): JanelaTurno {
  const umInstanteAntes = new Date(janela.inicio.getTime() - 1)
  return janelaDoTurno(umInstanteAntes)
}

export function turnoSeguinte(janela: JanelaTurno): JanelaTurno {
  return janelaDoTurno(new Date(janela.fim.getTime()))
}
