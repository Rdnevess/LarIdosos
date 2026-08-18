import { describe, it, expect } from 'vitest'
import {
  validarCpf,
  validarCnpj,
  somenteDigitos,
  formatarCpf,
  formatarData,
  formatarMoeda,
} from './ptbr'

describe('validarCpf', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true)
    expect(validarCpf('52998224725')).toBe(true)
  })

  it('rejeita CPF com dígito verificador errado', () => {
    expect(validarCpf('529.982.247-26')).toBe(false)
  })

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCpf('111.111.111-11')).toBe(false)
    expect(validarCpf('00000000000')).toBe(false)
  })

  it('rejeita CPF com tamanho errado', () => {
    expect(validarCpf('1234567890')).toBe(false)
    expect(validarCpf('')).toBe(false)
  })
})

describe('validarCnpj', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('rejeita CNPJ inválido', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false)
    expect(validarCnpj('11111111111111')).toBe(false)
  })
})

describe('formatação', () => {
  it('formata CPF com máscara', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
  })

  it('remove tudo que não é dígito', () => {
    expect(somenteDigitos('529.982.247-25')).toBe('52998224725')
  })

  it('formata data no padrão brasileiro', () => {
    expect(formatarData(new Date(2026, 7, 18))).toBe('18/08/2026')
  })

  it('formata moeda em real', () => {
    expect(formatarMoeda(1234.5)).toBe('R$ 1.234,50')
    expect(formatarMoeda(0)).toBe('R$ 0,00')
  })
})
