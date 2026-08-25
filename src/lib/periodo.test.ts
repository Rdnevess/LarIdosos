import { describe, it, expect } from 'vitest'
import { fimDoDia, fimDoMes } from './periodo'

describe('fimDoDia', () => {
  it('inclui o último milissegundo do dia', () => {
    // O defeito que isto corrige: quatro telas montavam a borda como
    // `T23:59:59`, sem milissegundos. Um registro gravado às 23:59:59.500 caía
    // fora do filtro — e caía em silêncio, porque a tela mostra o período certo
    // e simplesmente não lista a linha. Numa trilha de auditoria, sumir sem
    // avisar é o pior jeito de errar.
    const fim = fimDoDia('2026-08-25')

    expect(fim.getHours()).toBe(23)
    expect(fim.getMinutes()).toBe(59)
    expect(fim.getSeconds()).toBe(59)
    expect(fim.getMilliseconds()).toBe(999)
  })

  it('não deixa escapar um evento no último meio segundo', () => {
    const fim = fimDoDia('2026-08-25')
    const quaseMeiaNoite = new Date('2026-08-25T23:59:59.500')

    expect(quaseMeiaNoite.getTime()).toBeLessThanOrEqual(fim.getTime())
  })

  it('fica no dia pedido, em hora local', () => {
    // Data local e não UTC: o sistema roda com TZ=America/Sao_Paulo, e o filtro
    // que a equipe digita é o dia do calendário dela.
    const fim = fimDoDia('2026-08-25')

    expect(fim.getFullYear()).toBe(2026)
    expect(fim.getMonth()).toBe(7)
    expect(fim.getDate()).toBe(25)
  })
})

describe('fimDoMes', () => {
  it('cai no último dia do mês, no último milissegundo', () => {
    const fim = fimDoMes(2026, 8)

    expect(fim.getDate()).toBe(31)
    expect(fim.getMonth()).toBe(7)
    expect(fim.getMilliseconds()).toBe(999)
  })

  it('acerta fevereiro em ano bissexto', () => {
    // 2028 é bissexto; 2026 não. O caso que uma tabela de "dias por mês"
    // escrita à mão erraria.
    expect(fimDoMes(2028, 2).getDate()).toBe(29)
    expect(fimDoMes(2026, 2).getDate()).toBe(28)
  })
})
