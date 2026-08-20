import { describe, it, expect } from 'vitest'
import { exigirPapel, type Ctx } from './contexto'
import { ErroPermissao } from './erros'

function ctxCom(papel: Ctx['papel']): Ctx {
  return { usuarioId: 'usr_1', email: 'teste@lar.local', papel }
}

describe('exigirPapel', () => {
  it('permite quando o papel está na lista', () => {
    expect(() => exigirPapel(ctxCom('COORDENACAO'), 'COORDENACAO')).not.toThrow()
    expect(() =>
      exigirPapel(ctxCom('SAUDE'), 'COORDENACAO', 'SAUDE')
    ).not.toThrow()
  })

  it('lança ErroPermissao quando o papel não está na lista', () => {
    expect(() => exigirPapel(ctxCom('SAUDE'), 'ADMINISTRATIVO')).toThrow(
      ErroPermissao
    )
  })

  it('lança ErroPermissao quando nenhum papel é informado', () => {
    expect(() => exigirPapel(ctxCom('COORDENACAO'))).toThrow(ErroPermissao)
  })

  it('não vaza dados internos na mensagem de erro', () => {
    // Sem o `expect.assertions(1)`, este teste passa verde se `exigirPapel`
    // deixar de lançar: o `catch` simplesmente não roda, nenhuma asserção é
    // avaliada e o Vitest não tem como saber que faltou uma. Justamente o
    // cenário mais grave — a barreira de papel sumindo — passaria despercebido.
    expect.assertions(1)

    try {
      exigirPapel(ctxCom('SAUDE'), 'ADMINISTRATIVO')
    } catch (erro) {
      expect((erro as Error).message).toBe('Acesso negado')
    }
  })
})
