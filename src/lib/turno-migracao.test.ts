import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { turnoDaHora } from './turno'

/**
 * A regra do turno existe escrita duas vezes: em TypeScript, em
 * `turnoDaHora`, e em SQL, dentro da migration
 * `20260827120000_turno_dia_e_noite`, que reclassificou as anotações já
 * gravadas quando os três turnos viraram dois.
 *
 * Duas cópias da mesma regra divergem, e esta decide o que a fiscalização lê
 * num prontuário. A migration é um arquivo de execução única e não pode ser
 * "chamada" por um teste — o que se pode fazer, e é o que se faz aqui, é rodar
 * **a mesma expressão** contra o banco e exigir que ela concorde com a função
 * do app em cada borda que importa.
 *
 * Se alguém mudar as fronteiras em `turno.ts` e esquecer que houve uma
 * migration com a regra dentro, este teste é o que avisa.
 */

/** A expressão da migration, palavra por palavra. */
const EXPRESSAO = `
  CASE
    WHEN EXTRACT(
           HOUR FROM ($1::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')
         ) BETWEEN 6 AND 17
    THEN 'DIA'
    ELSE 'NOITE'
  END AS turno
`

async function turnoPeloSql(utc: string): Promise<string> {
  const linhas = await prisma.$queryRawUnsafe<{ turno: string }[]>(
    `SELECT ${EXPRESSAO}`,
    utc
  )
  return linhas[0].turno
}

/**
 * Cada caso é um instante UTC com o relógio de São Paulo que lhe corresponde
 * escrito ao lado. São Paulo está em UTC−3 e o Brasil não tem horário de verão
 * desde 2019, então a conta é constante — e é a mesma premissa que
 * `src/lib/turno.ts` já registra.
 */
const CASOS: { utc: string; emSaoPaulo: string; esperado: 'DIA' | 'NOITE' }[] = [
  { utc: '2026-08-24T09:00:00', emSaoPaulo: '06:00', esperado: 'DIA' },
  { utc: '2026-08-24T08:59:00', emSaoPaulo: '05:59', esperado: 'NOITE' },
  { utc: '2026-08-24T17:00:00', emSaoPaulo: '14:00', esperado: 'DIA' },
  { utc: '2026-08-24T20:59:00', emSaoPaulo: '17:59', esperado: 'DIA' },
  { utc: '2026-08-24T21:00:00', emSaoPaulo: '18:00', esperado: 'NOITE' },
  { utc: '2026-08-25T02:00:00', emSaoPaulo: '23:00', esperado: 'NOITE' },
  { utc: '2026-08-25T03:00:00', emSaoPaulo: '00:00', esperado: 'NOITE' },
  { utc: '2026-08-25T07:00:00', emSaoPaulo: '04:00', esperado: 'NOITE' },
]

describe('a regra da migration de turno', () => {
  for (const caso of CASOS) {
    it(`${caso.utc}Z é ${caso.emSaoPaulo} em São Paulo, e cai em ${caso.esperado}`, async () => {
      expect(await turnoPeloSql(caso.utc)).toBe(caso.esperado)
    })
  }

  it('concorda com `turnoDaHora` em todas as bordas', async () => {
    // O app classifica pelo relógio local do processo, que em produção é o de
    // São Paulo. Aqui a comparação é feita sobre o horário local escrito no
    // caso, e não sobre `new Date(utc)` — a máquina que roda os testes pode
    // estar noutro fuso, e o que se quer provar é que as duas *regras*
    // concordam, não que este computador está em São Paulo.
    for (const caso of CASOS) {
      const [hora, minuto] = caso.emSaoPaulo.split(':').map(Number)
      const comoOAppVeria = new Date(2026, 7, 24, hora, minuto)
      expect(turnoDaHora(comoOAppVeria), `${caso.emSaoPaulo} pelo app`).toBe(caso.esperado)
      expect(await turnoPeloSql(caso.utc), `${caso.utc}Z pelo SQL`).toBe(caso.esperado)
    }
  })

  it('não sobrou nenhum turno da divisão antiga no banco', async () => {
    // MANHA e TARDE deixaram de existir no enum. Se a migration tivesse
    // falhado no meio, ou se alguém recriasse o tipo à mão, este teste é o que
    // acusa — e o enum é lido por `AnotacaoSaude`, que é prontuário.
    const valores = await prisma.$queryRawUnsafe<{ valor: string }[]>(
      `SELECT unnest(enum_range(NULL::"Turno"))::text AS valor`
    )
    expect(valores.map((v) => v.valor).sort()).toEqual(['DIA', 'NOITE'])
  })
})
