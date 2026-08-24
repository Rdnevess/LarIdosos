import { describe, it, expect } from 'vitest'
import { dosesPrevistas, type PrescricaoParaDerivacao } from './doses'

function prescricao(
  campos: Partial<PrescricaoParaDerivacao> = {}
): PrescricaoParaDerivacao {
  return {
    id: 'med_1',
    residenteId: 'res_1',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00'],
    diasSemana: [],
    dataInicio: new Date('2026-01-01T00:00:00'),
    dataFim: null,
    ...campos,
  }
}

const MANHA = {
  inicio: new Date('2026-08-24T06:00:00'),
  fim: new Date('2026-08-24T14:00:00'),
}

const NOITE = {
  inicio: new Date('2026-08-24T22:00:00'),
  fim: new Date('2026-08-25T06:00:00'),
}

describe('dosesPrevistas', () => {
  it('deriva uma dose por horário dentro da janela', () => {
    const doses = dosesPrevistas([prescricao({ horarios: ['08:00', '12:00'] })], MANHA)

    expect(doses.map((d) => d.horarioPrevisto)).toEqual([
      new Date('2026-08-24T08:00:00'),
      new Date('2026-08-24T12:00:00'),
    ])
  })

  it('inclui o instante do início e exclui o do fim', () => {
    // Fim exclusivo: a dose das 14:00 é da tarde. Fosse inclusivo, ela
    // apareceria nos dois turnos e alguém a daria duas vezes.
    const doses = dosesPrevistas([prescricao({ horarios: ['06:00', '14:00'] })], MANHA)

    expect(doses).toHaveLength(1)
    expect(doses[0].horarioPrevisto).toEqual(new Date('2026-08-24T06:00:00'))
  })

  it('atravessa a meia-noite na janela da noite', () => {
    const doses = dosesPrevistas([prescricao({ horarios: ['22:00', '02:00'] })], NOITE)

    expect(doses.map((d) => d.horarioPrevisto)).toEqual([
      new Date('2026-08-24T22:00:00'),
      new Date('2026-08-25T02:00:00'),
    ])
  })

  it('usa o dia da semana do instante, não o da janela', () => {
    // 24/08/2026 é segunda (1); 25/08 é terça (2). Numa janela que atravessa
    // a meia-noite os dois diferem, e é o do instante que manda.
    const soTerca = dosesPrevistas(
      [prescricao({ horarios: ['22:00', '02:00'], diasSemana: [2] })],
      NOITE
    )

    expect(soTerca).toHaveLength(1)
    expect(soTerca[0].horarioPrevisto).toEqual(new Date('2026-08-25T02:00:00'))
  })

  it('respeita diasSemana quando a janela cabe num dia só', () => {
    // 24/08/2026 é segunda. Uma prescrição de terça e quinta não rende dose.
    expect(dosesPrevistas([prescricao({ diasSemana: [2, 4] })], MANHA)).toEqual([])
    expect(dosesPrevistas([prescricao({ diasSemana: [1] })], MANHA)).toHaveLength(1)
  })

  it('não deriva nada para SE_NECESSARIO', () => {
    const doses = dosesPrevistas([prescricao({ tipo: 'SE_NECESSARIO' })], MANHA)
    expect(doses).toEqual([])
  })

  it('não deriva dose anterior ao início da vigência', () => {
    const doses = dosesPrevistas(
      [prescricao({ dataInicio: new Date('2026-08-24T10:00:00') })],
      MANHA
    )
    expect(doses).toEqual([])
  })

  it('não deriva dose posterior à suspensão, no mesmo dia', () => {
    // O motivo de `dataFim` ser DateTime: suspensa às 10h, a dose das 12h não
    // existe — e o relatório não a acusa como "sem registro".
    const doses = dosesPrevistas(
      [
        prescricao({
          horarios: ['08:00', '12:00'],
          dataFim: new Date('2026-08-24T10:00:00'),
        }),
      ],
      MANHA
    )

    expect(doses).toHaveLength(1)
    expect(doses[0].horarioPrevisto).toEqual(new Date('2026-08-24T08:00:00'))
  })

  it('deriva doses passadas de prescrição já suspensa', () => {
    // `ativa` nem entra no tipo de entrada, de propósito: filtrar por ele
    // apagaria as doses passadas de uma prescrição suspensa ontem, e o
    // relatório de aderência do mês passado mudaria sozinho. Quem manda é a
    // vigência.
    const suspensaDepois = prescricao({ dataFim: new Date('2026-08-30T00:00:00') })
    expect(dosesPrevistas([suspensaDepois], MANHA)).toHaveLength(1)
  })

  it('ordena por horário, misturando prescrições e residentes', () => {
    const doses = dosesPrevistas(
      [
        prescricao({ id: 'med_1', horarios: ['12:00'] }),
        prescricao({ id: 'med_2', residenteId: 'res_2', horarios: ['08:00'] }),
      ],
      MANHA
    )

    expect(doses.map((d) => d.medicacaoId)).toEqual(['med_2', 'med_1'])
  })

  it('devolve lista vazia sem prescrição nenhuma', () => {
    expect(dosesPrevistas([], MANHA)).toEqual([])
  })
})
