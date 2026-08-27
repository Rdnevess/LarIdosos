import { describe, it, expect } from 'vitest'
import {
  FAIXAS_DO_SISTEMA,
  MEDIDAS_VITAIS,
  ROTULO_MEDIDA,
  faixaVigente,
  foraDaFaixa,
} from './faixas'

describe('foraDaFaixa', () => {
  it('as bordas são inclusivas e não alertam', () => {
    // Um mínimo de 90 quer dizer "90 está bom". Alertar em 90 tornaria a
    // faixa uma coisa e o texto dela outra.
    const faixa = { minimo: 90, maximo: 140 }
    expect(foraDaFaixa(90, faixa)).toBe(false)
    expect(foraDaFaixa(140, faixa)).toBe(false)
    expect(foraDaFaixa(89, faixa)).toBe(true)
    expect(foraDaFaixa(141, faixa)).toBe(true)
  })

  it('faixa sem máximo só alerta por baixo', () => {
    // A saturação de oxigênio não tem "alto demais".
    const faixa = { minimo: 92, maximo: null }
    expect(foraDaFaixa(99, faixa)).toBe(false)
    expect(foraDaFaixa(100, faixa)).toBe(false)
    expect(foraDaFaixa(91, faixa)).toBe(true)
  })

  it('faixa sem mínimo só alerta por cima', () => {
    const faixa = { minimo: null, maximo: 180 }
    expect(foraDaFaixa(20, faixa)).toBe(false)
    expect(foraDaFaixa(181, faixa)).toBe(true)
  })

  it('faixa sem lado nenhum nunca alerta', () => {
    // É o que uma faixa ajustada para "não me avise sobre isto" significa.
    expect(foraDaFaixa(500, { minimo: null, maximo: null })).toBe(false)
  })
})

describe('faixaVigente', () => {
  it('sem ajuste, usa a faixa do sistema', () => {
    const vigente = faixaVigente('PRESSAO_SISTOLICA', [])
    expect(vigente).toEqual(FAIXAS_DO_SISTEMA.PRESSAO_SISTOLICA)
  })

  it('o ajuste do residente vence a faixa do sistema', () => {
    // A regra que decide quem é alertado, e a que mais custa se errar: um
    // hipertenso com faixa ajustada não pode ser medido pela do sistema.
    const vigente = faixaVigente('PRESSAO_SISTOLICA', [
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])
    expect(vigente).toEqual({ minimo: 110, maximo: 160 })
  })

  it('o ajuste de outra medida não afeta esta', () => {
    const vigente = faixaVigente('TEMPERATURA', [
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])
    expect(vigente).toEqual(FAIXAS_DO_SISTEMA.TEMPERATURA)
  })
})

describe('o inventário de medidas', () => {
  it('peso não é medida de alerta', () => {
    // 62 kg não é alarmante nem tranquilizador sem os 68 kg do mês passado.
    // Peso é tendência, e tendência é outro trabalho.
    expect(MEDIDAS_VITAIS).not.toContain('PESO')
  })

  it('toda medida tem faixa e rótulo', () => {
    // Sem isto, acrescentar uma medida ao enum e esquecer da faixa daria uma
    // coluna que nunca alerta, em silêncio.
    for (const medida of MEDIDAS_VITAIS) {
      expect(FAIXAS_DO_SISTEMA[medida], `faixa de ${medida}`).toBeDefined()
      expect(ROTULO_MEDIDA[medida], `rótulo de ${medida}`).toBeTruthy()
    }
  })
})
