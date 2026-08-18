import { describe, it, expect } from 'vitest'
import { hashSenha, verificarSenha } from './senha'

describe('senha', () => {
  it('gera um hash diferente da senha original', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(hash).not.toBe('senha-forte-123')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('usa os parâmetros recomendados pela OWASP', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(hash).toContain('m=19456,t=2,p=1')
  })

  it('gera hashes diferentes para a mesma senha', async () => {
    const a = await hashSenha('senha-forte-123')
    const b = await hashSenha('senha-forte-123')
    expect(a).not.toBe(b)
  })

  it('verifica a senha correta', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(await verificarSenha(hash, 'senha-forte-123')).toBe(true)
  })

  it('recusa a senha errada', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(await verificarSenha(hash, 'senha-errada')).toBe(false)
  })

  it('retorna falso para hash malformado em vez de lançar', async () => {
    expect(await verificarSenha('nao-e-um-hash', 'qualquer')).toBe(false)
  })
})
