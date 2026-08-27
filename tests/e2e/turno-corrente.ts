import { janelaDoTurno } from '../../src/lib/turno'

/**
 * Um horário de dose dentro do turno em curso, e a vigência que o alcança.
 *
 * **Derivado de `src/lib/turno.ts`, e não recalculado aqui.** Dois specs
 * traziam a mesma conta escrita à mão — `hora >= 6 && hora < 14 ? 6 : …` —,
 * uma cópia do modelo de três turnos de oito horas. Em 27/08/2026 o Lar pediu
 * dois turnos de doze, o produto mudou e as cópias não: das 18h às 19h, os
 * testes passaram a pedir uma dose das 17h, que pertence ao turno do dia já
 * encerrado, e a tela do turno da noite corretamente não a mostrava.
 *
 * O próprio `turno.ts` avisa que a divisão "é do sistema e não de um módulo",
 * porque duas divisões seriam duas respostas para "em que turno isso
 * aconteceu?". Os testes guardavam a terceira.
 */

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * Uma hora cheia dentro da janela em curso e **no passado**, para a dose já
 * estar vencida quando a tela abrir. Uma hora atrás, ou o começo do turno
 * quando o turno acabou de virar.
 */
function momentoDaDose(agora: Date): Date {
  const { inicio } = janelaDoTurno(agora)
  const umaHoraAtras = new Date(agora.getTime() - 3_600_000)
  const escolhido = umaHoraAtras < inicio ? new Date(inicio) : umaHoraAtras
  escolhido.setMinutes(0, 0, 0)
  return escolhido
}

/** O `HH:MM` que o campo de horários aceita. */
export function horarioDoTurnoCorrente(agora = new Date()): string {
  return `${doisDigitos(momentoDaDose(agora).getHours())}:00`
}

/**
 * O começo da janela em curso, no formato do `datetime-local`.
 *
 * A vigência precisa começar no início do turno: uma prescrição criada agora
 * não derivaria a dose de uma hora atrás, o que é o comportamento certo do
 * produto e tornaria o teste dependente do relógio.
 */
export function inicioDoTurnoCorrente(agora = new Date()): string {
  const { inicio } = janelaDoTurno(agora)
  return (
    `${inicio.getFullYear()}-${doisDigitos(inicio.getMonth() + 1)}-` +
    `${doisDigitos(inicio.getDate())}T${doisDigitos(inicio.getHours())}:00`
  )
}
