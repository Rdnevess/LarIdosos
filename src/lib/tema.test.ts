import { describe, it, expect } from 'vitest'
import { COOKIE_TEMA, cookieDeTema, lerTema, oposto } from './tema'

describe('lerTema', () => {
  it('aceita os dois temas', () => {
    expect(lerTema('claro')).toBe('claro')
    expect(lerTema('escuro')).toBe('escuro')
  })

  it('trata a ausência de cookie como "siga o sistema operacional"', () => {
    // `undefined` e não `'claro'`: quem nunca escolheu herda o tema do sistema,
    // e quem decide isso é o `@media` do CSS. Devolver um padrão aqui faria o
    // layout emitir `data-tema="claro"` para todo mundo, o que desarmaria o
    // `@media` e prenderia no claro quem está com o Windows no escuro.
    expect(lerTema(undefined)).toBeUndefined()
    expect(lerTema(null)).toBeUndefined()
    expect(lerTema('')).toBeUndefined()
  })

  it('recusa valor que não seja um dos dois', () => {
    // O cookie é escrito no navegador e volta pelo cabeçalho: qualquer pessoa
    // pode mandar o que quiser nele. O valor entra num atributo do HTML, então
    // o que não for reconhecido vira ausência, e não passa adiante.
    expect(lerTema('dark')).toBeUndefined()
    expect(lerTema('ESCURO')).toBeUndefined()
    expect(lerTema('escuro"><script>')).toBeUndefined()
  })
})

describe('oposto', () => {
  it('troca um pelo outro', () => {
    expect(oposto('claro')).toBe('escuro')
    expect(oposto('escuro')).toBe('claro')
  })

  it('ida e volta devolve o mesmo tema', () => {
    expect(oposto(oposto('claro'))).toBe('claro')
    expect(oposto(oposto('escuro'))).toBe('escuro')
  })
})

describe('cookieDeTema', () => {
  it('grava o tema para o site inteiro', () => {
    // `path=/` porque a escolha vale em qualquer tela. Sem ele o cookie nasce
    // preso ao caminho onde foi clicado, e o tema escolhido no login não
    // acompanharia a navegação.
    const cookie = cookieDeTema('escuro')
    expect(cookie).toContain(`${COOKIE_TEMA}=escuro`)
    expect(cookie).toContain('path=/')
  })

  it('dura um ano e não viaja em requisição de outro site', () => {
    const cookie = cookieDeTema('claro')
    expect(cookie).toContain(`max-age=${60 * 60 * 24 * 365}`)
    expect(cookie).toContain('SameSite=Lax')
  })

  it('o que ele grava é o que lerTema entende', () => {
    // Amarra as duas pontas: quem escreve o cookie e quem o lê no servidor.
    // Trocar o formato de um lado sem o outro quebra aqui, e não numa tela.
    for (const tema of ['claro', 'escuro'] as const) {
      const valor = cookieDeTema(tema).split(';')[0].split('=')[1]
      expect(lerTema(valor)).toBe(tema)
    }
  })
})
