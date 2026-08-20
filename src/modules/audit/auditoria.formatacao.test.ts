import { describe, it, expect } from 'vitest'
import { formatarDiff, formatarValorDiff, rotularCampo } from './auditoria.formatacao'

describe('formatarValorDiff', () => {
  it('traduz valor de enum conhecido — o desligamento de um residente não pode mostrar ATIVO/DESLIGADO cru', () => {
    expect(formatarValorDiff('ATIVO')).toBe('Ativo')
    expect(formatarValorDiff('DESLIGADO')).toBe('Desligado')
  })

  it('traduz booleano para sim/não, nunca true/false em inglês', () => {
    expect(formatarValorDiff(true)).toBe('sim')
    expect(formatarValorDiff(false)).toBe('não')
  })

  it('trata null, undefined e string vazia como travessão', () => {
    expect(formatarValorDiff(null)).toBe('—')
    expect(formatarValorDiff(undefined)).toBe('—')
    expect(formatarValorDiff('')).toBe('—')
  })

  it('formata data ISO no padrão brasileiro em vez do carimbo cru', () => {
    expect(formatarValorDiff('2026-01-15T00:00:00.000Z')).toBe('15/01/2026')
  })

  it('mantém string sem rótulo conhecido como está', () => {
    expect(formatarValorDiff('Maria Silva')).toBe('Maria Silva')
  })

  it('traduz valor de TipoDocumento — anexarDocumento grava `tipo` cru a cada anexo', () => {
    expect(formatarValorDiff('TERMO_RESPONSABILIDADE')).toBe('Termo de responsabilidade')
    expect(formatarValorDiff('COMPROVANTE_FISCAL')).toBe('Comprovante fiscal')
  })

  it('converte outros tipos com String()', () => {
    expect(formatarValorDiff(42)).toBe('42')
  })
})

describe('rotularCampo', () => {
  it('separa camelCase e capitaliza a primeira letra', () => {
    expect(rotularCampo('nomeCompleto')).toBe('Nome completo')
    expect(rotularCampo('beneficioTipo')).toBe('Beneficio tipo')
  })

  it('capitaliza campo já em uma palavra só', () => {
    expect(rotularCampo('status')).toBe('Status')
  })

  it('mantém sigla em maiúsculas, em vez de capitalizar como palavra comum', () => {
    expect(rotularCampo('cpf')).toBe('CPF')
    expect(rotularCampo('cns')).toBe('CNS')
    expect(rotularCampo('rg')).toBe('RG')
    expect(rotularCampo('uf')).toBe('UF')
  })
})

describe('formatarDiff', () => {
  it('traduz um diff com valor de enum — status do desligamento de residente', () => {
    expect(formatarDiff({ status: { de: 'ATIVO', para: 'DESLIGADO' } })).toBe(
      'Status: Ativo → Desligado'
    )
  })

  it('traduz um diff com valor booleano — desativação de usuário', () => {
    expect(formatarDiff({ ativo: { de: true, para: false } })).toBe('Ativo: sim → não')
  })

  it('traduz um diff com valor de TipoDocumento — anexo de documento na ficha', () => {
    expect(formatarDiff({ tipo: { de: null, para: 'TERMO_RESPONSABILIDADE' } })).toBe(
      'Tipo: — → Termo de responsabilidade'
    )
  })

  it('traduz múltiplos campos, cada um com seu formato', () => {
    expect(
      formatarDiff({
        nomeCompleto: { de: null, para: 'Maria Silva' },
        papel: { de: 'SAUDE', para: 'COORDENACAO' },
      })
    ).toBe('Nome completo: — → Maria Silva · Papel: Saúde → Coordenação')
  })

  it('retorna travessão para diff vazio, nulo ou que não é objeto', () => {
    expect(formatarDiff({})).toBe('—')
    expect(formatarDiff(null)).toBe('—')
    expect(formatarDiff(undefined)).toBe('—')
    expect(formatarDiff('string qualquer')).toBe('—')
  })
})
