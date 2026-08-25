import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { criarUsuarioDeTeste } from '@/../tests/helpers/fabricas'

const mockAuth = vi.fn()
const mockHeaders = vi.fn(async () => new Headers({ 'x-forwarded-for': '10.0.0.9' }))

vi.mock('./config', () => ({ auth: () => mockAuth() }))
vi.mock('next/headers', () => ({ headers: () => mockHeaders() }))

const { obterCtx } = await import('./sessao')
const { registrosDeNegacaoPendentes } = await import('@/modules/audit/acesso-negado')

async function negacoes() {
  return prisma.logAuditoria.findMany({ where: { acao: 'ACESSO_NEGADO' } })
}

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

  it('recusa sessão sem carimbo de emissão', async () => {
    const usuario = await criarUsuarioDeTeste()
    mockAuth.mockResolvedValue({ user: { id: usuario.id } })

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

describe('a trilha das sessoes recusadas', () => {
  it('registra a sessao viva de uma conta desativada', async () => {
    // Conta desativada que ainda carrega token valido e evento forense: alguem
    // que perdeu o acesso continuando a bater na porta. Nao e checagem de
    // papel, entao `exigirPapel` nunca via este caso.
    const usuario = await criarUsuarioDeTeste({ papel: 'SAUDE' })
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoes()
    expect(log.entidade).toBe('Usuario')
    expect(log.usuarioId).toBe(usuario.id)
    expect(log.usuarioEmail).toBe(usuario.email)
    // De onde veio a tentativa. Numa investigacao de token roubado e o
    // primeiro campo que se olha, e as recusas de sessao gravavam nulo
    // porque `headers()` so era lido depois das checagens.
    expect(log.ip).toBe('10.0.0.9')
  })

  it('registra a sessao emitida antes da troca de senha', async () => {
    // O caso classico: a senha foi trocada porque alguem suspeitou de invasao,
    // e o token antigo continua sendo apresentado. Sem registro, a trilha nao
    // guarda a unica evidencia de que a suspeita procedia.
    const usuario = await criarUsuarioDeTeste()
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(usuario.senhaAlteradaEm.getTime() / 1000) - 10,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoes()
    expect(log.entidade).toBe('Usuario')
    expect(log.usuarioId).toBe(usuario.id)
  })

  it('nao registra nada quando simplesmente nao ha sessao', async () => {
    // Decisao deliberada, e o unico dos quatro pontos que fica de fora: isto e
    // "nao logado", nao "negado". Acontece em toda visita anonima, e sem id a
    // chave de deduplicacao viraria `null:Usuario` — todos os visitantes
    // colapsados num contador so, que e o oposto do que a trilha serve para
    // mostrar.
    mockAuth.mockResolvedValue(null)

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    expect(await negacoes()).toHaveLength(0)
  })
})
