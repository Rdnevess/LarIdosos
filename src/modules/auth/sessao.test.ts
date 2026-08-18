import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { criarUsuarioDeTeste } from '@/../tests/helpers/fabricas'

const mockAuth = vi.fn()
const mockHeaders = vi.fn(async () => new Headers({ 'x-forwarded-for': '10.0.0.9' }))

vi.mock('./config', () => ({ auth: () => mockAuth() }))
vi.mock('next/headers', () => ({ headers: () => mockHeaders() }))

const { obterCtx } = await import('./sessao')

beforeEach(() => {
  mockAuth.mockReset()
})

describe('obterCtx', () => {
  it('monta o contexto com o papel lido do banco', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'SAUDE' })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    const ctx = await obterCtx()

    expect(ctx.usuarioId).toBe(usuario.id)
    expect(ctx.papel).toBe('SAUDE')
    expect(ctx.ip).toBe('10.0.0.9')
  })

  it('recusa quando não há sessão', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('recusa usuário desativado mesmo com token válido', async () => {
    const usuario = await criarUsuarioDeTeste()
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('recusa token emitido antes da troca de senha', async () => {
    const usuario = await criarUsuarioDeTeste()
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(usuario.senhaAlteradaEm.getTime() / 1000) - 10,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('reflete imediatamente a mudança de papel no banco', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'SAUDE' })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { papel: 'ADMINISTRATIVO' },
    })

    const ctx = await obterCtx()
    expect(ctx.papel).toBe('ADMINISTRATIVO')
  })
})
