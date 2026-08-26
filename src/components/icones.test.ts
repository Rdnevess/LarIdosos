import { describe, it, expect } from 'vitest'
import { CAMINHOS, type NomeIcone } from './icones'

describe('icones', () => {
  it('tem os quinze nomes que o sistema usa', () => {
    const esperados: NomeIcone[] = [
      'residente', 'prontuario', 'medicacao', 'turno', 'financeiro',
      'auditoria', 'funcionario', 'documento', 'alerta', 'sucesso',
      'erro', 'busca', 'voltar', 'sair', 'tema',
    ]
    expect(Object.keys(CAMINHOS).sort()).toEqual([...esperados].sort())
  })

  it('todo icone tem markup e nenhum vem vazio', () => {
    // Markup vazio renderiza nada e nao quebra: o icone some da tela sem erro.
    // E o tipo de defeito que so aparece quando alguem pergunta "cade o icone".
    for (const [nome, markup] of Object.entries(CAMINHOS)) {
      expect(markup.length, `${nome} veio vazio`).toBeGreaterThan(10)
      expect(markup, `${nome} nao parece markup SVG`).toMatch(/^<(path|circle|line|rect|polyline|polygon|ellipse)\b/)
    }
  })

  it('nenhum icone carrega script', () => {
    // Guarda da vendorizacao: se alguem colar markup de fora sem olhar, isto
    // barra o caso que transformaria `dangerouslySetInnerHTML` em problema real.
    for (const markup of Object.values(CAMINHOS)) {
      expect(markup).not.toMatch(/<script|on[a-z]+=/i)
    }
  })
})
