import { describe, it, expect } from 'vitest'
import { janelaDoTurno } from '@/lib/turno'
import { horarioDoTurnoCorrente, inicioDoTurnoCorrente } from './e2e/turno-corrente'

/**
 * O horário que os testes de ponta a ponta usam para prescrever uma dose
 * precisa cair dentro do turno em curso — em qualquer hora do dia.
 *
 * Este teste existe porque a versão anterior desse cálculo vivia copiada
 * dentro de dois specs, com o modelo de três turnos que o produto abandonou em
 * 27/08/2026. Ela só errava entre 18h e 19h, e por isso passou despercebida:
 * bastava a suíte rodar às 17h. O E2E não pega isto sozinho — ele roda numa
 * hora só, a de quando roda.
 */

describe('horarioDoTurnoCorrente', () => {
  it('cai dentro da janela do turno em qualquer hora do dia', () => {
    for (let hora = 0; hora < 24; hora++) {
      const agora = new Date(2026, 7, 27, hora, 40, 0, 0)
      const janela = janelaDoTurno(agora)

      const [hh] = horarioDoTurnoCorrente(agora).split(':').map(Number)
      // O horário é uma hora do dia; a dose acontece nessa hora, no dia da
      // janela — que para a noite pode ser o dia anterior ao de "agora".
      const dose = new Date(janela.inicio)
      dose.setHours(hh, 0, 0, 0)
      if (dose < janela.inicio) dose.setDate(dose.getDate() + 1)

      expect(
        dose >= janela.inicio && dose < janela.fim,
        `às ${hora}h a dose caiu em ${dose.toISOString()}, fora de ` +
          `${janela.inicio.toISOString()}–${janela.fim.toISOString()}`
      ).toBe(true)

      // E no passado: dose futura ainda não venceu, e não aparece como devida.
      expect(dose.getTime()).toBeLessThanOrEqual(agora.getTime())
    }
  })
})

describe('inicioDoTurnoCorrente', () => {
  it('devolve o começo da janela em curso, e não uma hora fixa', () => {
    // 19h40 é turno da noite, que começou às 18h do mesmo dia.
    expect(inicioDoTurnoCorrente(new Date(2026, 7, 27, 19, 40))).toBe('2026-08-27T18:00')
    // 3h da manhã ainda é a noite que começou às 18h do dia anterior.
    expect(inicioDoTurnoCorrente(new Date(2026, 7, 27, 3, 15))).toBe('2026-08-26T18:00')
    // 10h é o dia, que começou às 6h.
    expect(inicioDoTurnoCorrente(new Date(2026, 7, 27, 10, 0))).toBe('2026-08-27T06:00')
  })
})
