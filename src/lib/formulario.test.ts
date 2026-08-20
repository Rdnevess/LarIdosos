import { describe, it, expect } from 'vitest'
import { texto, data, numero, booleano, semIndefinidos } from './formulario'

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData()
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor)
  return dados
}

describe('texto', () => {
  it('apara o valor informado', () => {
    expect(texto(formulario({ nome: '  Maria Silva  ' }), 'nome')).toBe('Maria Silva')
  })

  it('devolve undefined para campo em branco', () => {
    // A tela envia string vazia para todo campo não preenchido; o serviço
    // precisa receber "não informado", não `''`.
    expect(texto(formulario({ nome: '' }), 'nome')).toBeUndefined()
    expect(texto(formulario({ nome: '   ' }), 'nome')).toBeUndefined()
  })

  it('devolve undefined para campo ausente do formulário', () => {
    expect(texto(formulario({}), 'nome')).toBeUndefined()
  })
})

describe('data', () => {
  it('lê a data do campo sem deslocar o dia', () => {
    const convertida = data(formulario({ nascimento: '2026-03-12' }), 'nascimento')

    // `new Date('2026-03-12')` seria meia-noite UTC — 11 de março em fuso
    // brasileiro. O meio-dia mantém o dia certo em qualquer fuso do país.
    expect(convertida?.getFullYear()).toBe(2026)
    expect(convertida?.getMonth()).toBe(2)
    expect(convertida?.getDate()).toBe(12)
  })

  it('devolve undefined para campo de data em branco', () => {
    expect(data(formulario({ nascimento: '' }), 'nascimento')).toBeUndefined()
  })
})

describe('numero', () => {
  it('converte o valor para número', () => {
    expect(numero(formulario({ valor: '1412.50' }), 'valor')).toBe(1412.5)
  })

  it('devolve undefined para campo em branco', () => {
    expect(numero(formulario({ valor: '' }), 'valor')).toBeUndefined()
  })

  it('devolve NaN para texto não numérico, em vez de descartar o campo', () => {
    // `z.number()` recusa `NaN`, então a ação devolve erro na tela. Converter
    // para `undefined` faria o campo sumir sem ninguém saber.
    expect(numero(formulario({ valor: 'mil e quatrocentos' }), 'valor')).toBeNaN()
  })
})

describe('booleano', () => {
  it('é verdadeiro quando a caixa vem marcada', () => {
    expect(booleano(formulario({ autorizadoVisitar: 'on' }), 'autorizadoVisitar')).toBe(true)
  })

  it('é falso quando a caixa vem desmarcada — o navegador não envia o campo', () => {
    expect(booleano(formulario({}), 'autorizadoVisitar')).toBe(false)
  })
})

describe('semIndefinidos', () => {
  it('omite as chaves vazias em vez de emiti-las com undefined', () => {
    const resultado = semIndefinidos({ nome: 'Maria', rg: undefined, quarto: '7' })

    expect(Object.keys(resultado).sort()).toEqual(['nome', 'quarto'])
    expect('rg' in resultado).toBe(false)
  })

  it('preserva null, false e zero — são valores informados', () => {
    const resultado = semIndefinidos({ rg: null, ativo: false, valor: 0, texto: '' })

    expect(resultado).toEqual({ rg: null, ativo: false, valor: 0, texto: '' })
  })
})
