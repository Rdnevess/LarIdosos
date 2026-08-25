import { describe, it, expect } from 'vitest'
import { destinoSeguro, DESTINO_PADRAO } from './destino'

describe('destinoSeguro', () => {
  it('devolve o caminho pedido quando é interno', () => {
    expect(destinoSeguro('/funcionarios')).toBe('/funcionarios')
    expect(destinoSeguro('/residentes/abc/prontuario')).toBe('/residentes/abc/prontuario')
  })

  it('preserva a query, que faz parte de onde a pessoa estava', () => {
    expect(destinoSeguro('/auditoria?pagina=3')).toBe('/auditoria?pagina=3')
  })

  it('cai no padrão quando não há destino', () => {
    expect(destinoSeguro(undefined)).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('')).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('   ')).toBe(DESTINO_PADRAO)
  })

  it('recusa endereço de outro site', () => {
    // Redirecionamento aberto: sem esta recusa, um link
    // `/login?proximo=https://site-falso/` levaria a pessoa para fora depois de
    // ela digitar a senha aqui — e ela teria acabado de provar que confia nesta
    // tela.
    expect(destinoSeguro('https://site-falso.example')).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('http://site-falso.example')).toBe(DESTINO_PADRAO)
  })

  it('recusa o endereço relativo a protocolo', () => {
    // `//site-falso` não parece externo, mas o navegador o lê como
    // `https://site-falso`. É o caso que passa por uma checagem ingênua de
    // "começa com barra".
    expect(destinoSeguro('//site-falso.example')).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('/\\site-falso.example')).toBe(DESTINO_PADRAO)
  })

  it('recusa esquema executável', () => {
    expect(destinoSeguro('javascript:alert(1)')).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('data:text/html,<script>')).toBe(DESTINO_PADRAO)
  })

  it('não manda de volta para o login', () => {
    // Sem isto, quem chegasse ao login por um link com `proximo=/login`
    // entraria e voltaria para a tela de onde acabou de sair.
    expect(destinoSeguro('/login')).toBe(DESTINO_PADRAO)
    expect(destinoSeguro('/login?proximo=/login')).toBe(DESTINO_PADRAO)
  })
})
