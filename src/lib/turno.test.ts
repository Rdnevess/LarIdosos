import { describe, it, expect } from 'vitest'
import { janelaDoTurno, turnoAnterior, turnoSeguinte, turnoDaHora } from './turno'

describe('janelaDoTurno', () => {
  it('devolve a manhã entre 6h e 14h', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T09:30:00'))
    expect(janela.turno).toBe('MANHA')
    expect(janela.inicio).toEqual(new Date('2026-08-24T06:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-24T14:00:00'))
  })

  it('põe as 14:00 na tarde, não na manhã', () => {
    // O fim da janela é exclusivo. Sem isso a dose das 14:00 apareceria nos
    // dois turnos, e alguém a daria duas vezes.
    expect(janelaDoTurno(new Date('2026-08-24T14:00:00')).turno).toBe('TARDE')
  })

  it('às 2h devolve a noite que começou no dia anterior', () => {
    // O caso que mais erra numa implementação ingênua: a janela da noite
    // atravessa a meia-noite, e às 2h da manhã do dia 25 o turno em curso
    // começou às 22h do dia 24.
    const janela = janelaDoTurno(new Date('2026-08-25T02:00:00'))
    expect(janela.turno).toBe('NOITE')
    expect(janela.inicio).toEqual(new Date('2026-08-24T22:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('às 23h devolve a noite que termina no dia seguinte', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    expect(janela.turno).toBe('NOITE')
    expect(janela.inicio).toEqual(new Date('2026-08-24T22:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })
})

describe('turnoAnterior e turnoSeguinte', () => {
  it('a manhã vem depois da noite que começou ontem', () => {
    const manha = janelaDoTurno(new Date('2026-08-25T09:00:00'))
    const anterior = turnoAnterior(manha)

    expect(anterior.turno).toBe('NOITE')
    expect(anterior.inicio).toEqual(new Date('2026-08-24T22:00:00'))
    expect(anterior.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('a noite é seguida pela manhã do dia seguinte', () => {
    const noite = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    const seguinte = turnoSeguinte(noite)

    expect(seguinte.turno).toBe('MANHA')
    expect(seguinte.inicio).toEqual(new Date('2026-08-25T06:00:00'))
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
    expect(turnoDaHora(new Date('2026-08-24T06:00:00'))).toBe('MANHA')
    expect(turnoDaHora(new Date('2026-08-24T13:59:00'))).toBe('MANHA')
    expect(turnoDaHora(new Date('2026-08-24T14:00:00'))).toBe('TARDE')
    expect(turnoDaHora(new Date('2026-08-24T21:59:00'))).toBe('TARDE')
    expect(turnoDaHora(new Date('2026-08-24T22:00:00'))).toBe('NOITE')
    expect(turnoDaHora(new Date('2026-08-24T05:59:00'))).toBe('NOITE')
  })
})
