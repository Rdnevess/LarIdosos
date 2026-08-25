import { describe, it, expect } from 'vitest'
import { normalizarBusca } from './busca'

describe('normalizarBusca', () => {
  it('tira o acento e baixa a caixa', () => {
    // Precisa chegar ao mesmo resultado que `f_unaccent(lower(...))` produz na
    // coluna gerada (migration `20260825120000_busca_sem_acento`). Se os dois
    // lados divergirem, a busca falha justamente nos nomes acentuados.
    expect(normalizarBusca('José')).toBe('jose')
    expect(normalizarBusca('CONCEIÇÃO')).toBe('conceicao')
    expect(normalizarBusca('Antônio')).toBe('antonio')
  })

  it('trata a cedilha, que não é acento e sim marca combinante', () => {
    // `ç` decomposto vira `c` + cedilha combinante, e a cedilha cai na mesma
    // faixa dos acentos. Vale registrar porque é o caso que quebraria se
    // alguém trocasse a faixa por uma lista de vogais acentuadas.
    expect(normalizarBusca('Maçã')).toBe('maca')
  })

  it('remove o espaço das pontas', () => {
    expect(normalizarBusca('  Maria  ')).toBe('maria')
  })

  it('deixa passar o que já está normalizado', () => {
    expect(normalizarBusca('jose')).toBe('jose')
  })
})
