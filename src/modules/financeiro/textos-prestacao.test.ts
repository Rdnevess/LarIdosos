import { describe, it, expect } from 'vitest'
import {
  montarOficio,
  montarDeclaracao,
  montarEncerramento,
  mesPorExtenso,
  periodoPorExtenso,
} from './textos-prestacao'

describe('montarEncerramento', () => {
  it('não carrega a nota de trabalho que estava no modelo', () => {
    // A primeira linha da célula A11 do modelo dizia "Instrução para Claude,
    // aqui deve caber também anotações importante...". Era recado de quem
    // montou o arquivo, não parte do documento — e sairia impresso em toda
    // prestação entregue ao órgão.
    const texto = montarEncerramento({
      observacoes: '',
      numeroConta: '98765-4',
      mesPorExtenso: 'agosto',
      ano: 2026,
    })

    expect(texto).not.toContain('Instrução para Claude')
    expect(texto).not.toContain('aqui deve caber')
  })

  it('põe as observações do mês acima da declaração', () => {
    // É o campo livre que a instituição pediu: justificativas de
    // movimentações incomuns, valores atípicos, esclarecimentos ao órgão.
    const texto = montarEncerramento({
      observacoes: 'A reforma da cozinha explica a despesa atípica de agosto.',
      numeroConta: '98765-4',
      mesPorExtenso: 'agosto',
      ano: 2026,
    })

    const posicaoObservacao = texto.indexOf('reforma da cozinha')
    const posicaoDeclaracao = texto.indexOf('Declaramos para os devidos fins')

    expect(posicaoObservacao).toBeGreaterThanOrEqual(0)
    expect(posicaoDeclaracao).toBeGreaterThan(posicaoObservacao)
  })

  it('sem observação, começa direto na declaração, sem linhas vazias no topo', () => {
    const texto = montarEncerramento({
      observacoes: '   ',
      numeroConta: '98765-4',
      mesPorExtenso: 'agosto',
      ano: 2026,
    })

    expect(texto).toBe(
      montarDeclaracao({ numeroConta: '98765-4', mesPorExtenso: 'agosto', ano: 2026 })
    )
  })
})

describe('montarDeclaracao', () => {
  it('escreve a conta e a competência do documento, não as do modelo', () => {
    // O modelo trazia "Conte Corrente xx.xxx-x, referente ao mês de junho de
    // 2026" congelado. Um texto assim mentiria sobre a própria competência.
    const texto = montarDeclaracao({
      numeroConta: '98765-4',
      mesPorExtenso: 'agosto',
      ano: 2026,
    })

    expect(texto).toContain('Conta Corrente 98765-4')
    expect(texto).toContain('mês de agosto de 2026')
    expect(texto).not.toContain('junho')
    expect(texto).not.toContain('xx.xxx-x')
  })

  it('corrige o "Conte Corrente" do modelo', () => {
    const texto = montarDeclaracao({
      numeroConta: '98765-4',
      mesPorExtenso: 'agosto',
      ano: 2026,
    })

    expect(texto).not.toContain('Conte Corrente')
  })
})

describe('montarOficio', () => {
  it('usa a razão social da configuração, não a escrita no modelo', () => {
    // No modelo o nome estava no meio do texto. Vindo da configuração, o
    // ofício não diverge da capa no dia em que a instituição mudar de nome.
    const texto = montarOficio({
      razaoSocial: 'Associação Lar Recanto Feliz',
      periodoPorExtenso: 'agosto de 2026',
    })

    expect(texto).toContain('Associação Lar Recanto Feliz')
    expect(texto).toContain('período de agosto de 2026')
    expect(texto).not.toContain('dezembro de 2025')
  })
})

describe('mesPorExtenso', () => {
  it('escreve os doze meses em minúsculas', () => {
    expect(mesPorExtenso(1)).toBe('janeiro')
    expect(mesPorExtenso(3)).toBe('março')
    expect(mesPorExtenso(12)).toBe('dezembro')
  })

  it('recusa mês fora do intervalo', () => {
    expect(() => mesPorExtenso(0)).toThrow()
    expect(() => mesPorExtenso(13)).toThrow()
  })

  it('compõe o período como o modelo o escreve', () => {
    expect(periodoPorExtenso(8, 2026)).toBe('agosto de 2026')
  })
})
