import { describe, it, expect } from 'vitest'
import { EMAIL_DESCARTAVEL, NOME_DESCARTAVEL } from './descartavel'

/**
 * Os dois padrões que separam o lixo de teste de gente de verdade.
 *
 * Eles decidem o que um script apaga do banco de desenvolvimento, então erram
 * em duas direções e só uma é tolerável: deixar lixo para trás custa ruído;
 * apagar um cadastro de verdade custa o cadastro. Os testes negativos abaixo
 * são a metade que importa.
 */

describe('EMAIL_DESCARTAVEL', () => {
  it('reconhece o que as suítes deixam', () => {
    for (const email of [
      'auditoria.1787598307085@lar.local',
      'senha.1787813015865@lar.local',
      'papel.1787598281419@lar.local',
    ]) {
      expect(EMAIL_DESCARTAVEL.test(email), email).toBe(true)
    }
  })

  it('não toca em e-mail de gente', () => {
    for (const email of [
      'coordenacao@lar.local',
      'enfermagem.e2e@lar.local',
      'maria.silva@lar.local',
      'joao.2@lar.local',
      'auditoria.1787598307085@outracasa.com.br',
      'Auditoria.1787598307085@lar.local',
    ]) {
      expect(EMAIL_DESCARTAVEL.test(email), email).toBe(false)
    }
  })
})

describe('NOME_DESCARTAVEL', () => {
  it('reconhece o sufixo de época que os testes carimbam', () => {
    for (const nome of [
      'Ana Teste 1787654808734',
      'Idosa Pendencia 1787654808734',
      'Auditoria Teste 1787534611449',
      'ZZPaginacao 1787654808734',
    ]) {
      expect(NOME_DESCARTAVEL.test(nome), nome).toBe(true)
    }
  })

  it('não toca em nome de gente, nem no residente-semente', () => {
    // "Residente Perfil Saude E2E" é o único residente fixo do banco de
    // desenvolvimento, criado pelo `global-setup` e usado pelo perfil SAUDE em
    // toda a suíte. Apagá-lo derrubaria os testes que ele existe para servir.
    for (const nome of [
      'Residente Perfil Saude E2E',
      'Maria das Dores Silva',
      'Outro Nome Qualquer',
      'João Pereira',
      'Maria 2',
      'Quarto 302 Leito 1',
    ]) {
      expect(NOME_DESCARTAVEL.test(nome), nome).toBe(false)
    }
  })

  it('exige o número no fim, e não em qualquer lugar', () => {
    // Um nome que *contenha* um número longo no meio não é carimbo de teste —
    // e este é o caso que uma expressão sem âncora deixaria passar.
    expect(NOME_DESCARTAVEL.test('Ana 1787654808734 Silva')).toBe(false)
  })
})
