import { describe, it, expect } from 'vitest'
import { janelaDoTurno, turnoAnterior, turnoSeguinte, turnoDaHora } from './turno'

describe('janelaDoTurno', () => {
  it('devolve o dia entre 6h e 18h', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T09:30:00'))
    expect(janela.turno).toBe('DIA')
    expect(janela.inicio).toEqual(new Date('2026-08-24T06:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-24T18:00:00'))
  })

  it('põe as 18:00 na noite, não no dia', () => {
    // O fim da janela é exclusivo. Sem isso a dose das 18:00 apareceria nos
    // dois turnos, e alguém a daria duas vezes.
    expect(janelaDoTurno(new Date('2026-08-24T18:00:00')).turno).toBe('NOITE')
  })

  it('as 14h, que eram tarde, agora são dia', () => {
    // A fronteira que a redução de três turnos para dois moveu. Vale como
    // asserção porque é exatamente o horário em que a divisão antiga trocava
    // de turno, e é onde um resto da regra velha apareceria.
    expect(janelaDoTurno(new Date('2026-08-24T14:00:00')).turno).toBe('DIA')
  })

  it('às 2h devolve a noite que começou no dia anterior', () => {
    // O caso que mais erra numa implementação ingênua: a janela da noite
    // atravessa a meia-noite, e às 2h da manhã do dia 25 o turno em curso
    // começou às 18h do dia 24.
    const janela = janelaDoTurno(new Date('2026-08-25T02:00:00'))
    expect(janela.turno).toBe('NOITE')
    expect(janela.inicio).toEqual(new Date('2026-08-24T18:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('às 23h devolve a noite que termina no dia seguinte', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    expect(janela.turno).toBe('NOITE')
    expect(janela.inicio).toEqual(new Date('2026-08-24T18:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('a noite dura doze horas, atravessando a meia-noite', () => {
    // Com dois turnos as duas janelas têm doze horas, e a da noite é a que
    // pode errar: ela é a única partida em dois dias do calendário.
    const noite = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    const horas = (noite.fim.getTime() - noite.inicio.getTime()) / 3_600_000
    expect(horas).toBe(12)

    const dia = janelaDoTurno(new Date('2026-08-24T09:00:00'))
    expect((dia.fim.getTime() - dia.inicio.getTime()) / 3_600_000).toBe(12)
  })
})

describe('turnoAnterior e turnoSeguinte', () => {
  it('o dia vem depois da noite que começou ontem', () => {
    const dia = janelaDoTurno(new Date('2026-08-25T09:00:00'))
    const anterior = turnoAnterior(dia)

    expect(anterior.turno).toBe('NOITE')
    expect(anterior.inicio).toEqual(new Date('2026-08-24T18:00:00'))
    expect(anterior.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('a noite é seguida pelo dia seguinte', () => {
    const noite = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    const seguinte = turnoSeguinte(noite)

    expect(seguinte.turno).toBe('DIA')
    expect(seguinte.inicio).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('só há dois turnos, então andar duas vezes volta ao mesmo lugar', () => {
    // Com três turnos isto era falso, e é a asserção que prova que a redução
    // aconteceu de verdade — e não só nos rótulos.
    const dia = janelaDoTurno(new Date('2026-08-24T09:00:00'))
    const duasAdiante = turnoSeguinte(turnoSeguinte(dia))

    expect(duasAdiante.turno).toBe('DIA')
    expect(duasAdiante.inicio).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('ida e volta devolvem a mesma janela', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T15:00:00'))
    const voltando = turnoAnterior(turnoSeguinte(janela))

    expect(voltando.turno).toBe(janela.turno)
    expect(voltando.inicio).toEqual(janela.inicio)
    expect(voltando.fim).toEqual(janela.fim)
  })

  it('ida e volta atravessando a meia-noite também fecham', () => {
    const noite = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    const voltando = turnoAnterior(turnoSeguinte(noite))

    expect(voltando.inicio).toEqual(noite.inicio)
    expect(voltando.fim).toEqual(noite.fim)
  })
})

describe('turnoDaHora', () => {
  it('classifica as bordas', () => {
    expect(turnoDaHora(new Date('2026-08-24T06:00:00'))).toBe('DIA')
    expect(turnoDaHora(new Date('2026-08-24T14:00:00'))).toBe('DIA')
    expect(turnoDaHora(new Date('2026-08-24T17:59:00'))).toBe('DIA')
    expect(turnoDaHora(new Date('2026-08-24T18:00:00'))).toBe('NOITE')
    expect(turnoDaHora(new Date('2026-08-24T23:59:00'))).toBe('NOITE')
    expect(turnoDaHora(new Date('2026-08-24T00:00:00'))).toBe('NOITE')
    expect(turnoDaHora(new Date('2026-08-24T05:59:00'))).toBe('NOITE')
  })
})
