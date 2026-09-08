import { describe, it, expect } from 'vitest'
import { estaAtivo } from './menu-principal'

describe('estaAtivo', () => {
  it('acende na propria rota', () => {
    expect(estaAtivo('/financeiro', '/financeiro')).toBe(true)
  })

  it('acende a secao estando numa subrota', () => {
    // O ponto do menu: em /financeiro/cadastros quem esta aceso e
    // "Financeiro". Ele diz em que secao a pessoa esta, nao em que URL.
    expect(estaAtivo('/financeiro/cadastros', '/financeiro')).toBe(true)
    expect(estaAtivo('/financeiro/prestacoes/abc', '/financeiro')).toBe(true)
  })

  it('nao acende em rota que apenas comeca igual', () => {
    // `startsWith(href)` sem a barra acenderia "/usuarios" estando em
    // "/usuarios-arquivados". Nenhuma rota assim existe hoje, e e por isso
    // que o caso precisa de teste: quando ela existir, ninguem vai lembrar
    // de conferir o menu.
    expect(estaAtivo('/usuarios-arquivados', '/usuarios')).toBe(false)
    expect(estaAtivo('/financeirobla', '/financeiro')).toBe(false)
  })

  it('nao acende irmaos', () => {
    expect(estaAtivo('/residentes', '/financeiro')).toBe(false)
  })
})
