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
    try {
      exigirPapel(ctxCom('SAUDE'), 'ADMINISTRATIVO')
    } catch (erro) {
      expect((erro as Error).message).toBe('Acesso negado')
    }
  })
})
