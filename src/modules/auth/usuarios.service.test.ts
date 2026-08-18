import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { verificarSenha } from '@/lib/senha'
import { criarUsuarioDeTeste, ctxDe, ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarUsuario,
  listarUsuarios,
  atualizarUsuario,
  definirSenha,
  desativarUsuario,
} from './usuarios.service'

const dadosValidos = {
  email: 'novo@lar.local',
  nome: 'Nova Pessoa',
  papel: 'SAUDE' as const,
  senha: 'senha-inicial-123',
}

describe('criarUsuario', () => {
  it('cria o usuário e registra auditoria', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    const criado = await criarUsuario(ctx, dadosValidos)

    expect(criado.email).toBe('novo@lar.local')
    expect(criado.papel).toBe('SAUDE')
    expect(criado).not.toHaveProperty('senhaHash')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Usuario', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(criado.id)
  })

  it('normaliza o e-mail para minúsculas e sem espaços', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const criado = await criarUsuario(ctx, { ...dadosValidos, email: '  NOVO@Lar.Local ' })
    expect(criado.email).toBe('novo@lar.local')
  })

  it('recusa e-mail já cadastrado', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, dadosValidos)

    await expect(criarUsuario(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('recusa senha com menos de 8 caracteres', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await expect(
      criarUsuario(ctx, { ...dadosValidos, senha: '1234567' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nunca grava a senha em texto puro', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const criado = await criarUsuario(ctx, dadosValidos)

    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: criado.id } })
    expect(registro.senhaHash).not.toContain('senha-inicial-123')
    expect(await verificarSenha(registro.senhaHash, 'senha-inicial-123')).toBe(true)
  })

  it('nega para SAUDE e para ADMINISTRATIVO', async () => {
    for (const papel of ['SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      await expect(criarUsuario(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
    }
  })
})

describe('listarUsuarios', () => {
  it('lista sem expor o hash da senha', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, dadosValidos)

    const lista = await listarUsuarios(ctx)

    expect(lista.length).toBeGreaterThan(0)
    for (const usuario of lista) {
      expect(usuario).not.toHaveProperty('senhaHash')
    }
  })

  it('nega para papel não autorizado', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarUsuarios(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarUsuario', () => {
  it('registra no diff apenas os campos alterados', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await atualizarUsuario(ctx, alvo.id, { nome: 'Nome Corrigido', papel: 'SAUDE' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Usuario', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({ nome: { de: 'Nova Pessoa', para: 'Nome Corrigido' } })
  })

  it('nunca inclui senhaHash no diff da auditoria', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456')

    const logs = await prisma.logAuditoria.findMany({ where: { entidadeId: alvo.id } })
    for (const log of logs) {
      expect(JSON.stringify(log.diff ?? {})).not.toContain('senhaHash')
      expect(JSON.stringify(log.diff ?? {})).not.toContain('outra-senha-forte-456')
    }
  })
})

describe('definirSenha', () => {
  it('troca a senha e atualiza senhaAlteradaEm', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })

    await new Promise((r) => setTimeout(r, 5))
    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456')

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(await verificarSenha(depois.senhaHash, 'outra-senha-forte-456')).toBe(true)
    expect(depois.senhaAlteradaEm.getTime()).toBeGreaterThan(antes.senhaAlteradaEm.getTime())
  })
})

describe('desativarUsuario', () => {
  it('marca como inativo sem apagar o registro', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await desativarUsuario(ctx, alvo.id)

    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(registro.ativo).toBe(false)
  })

  it('impede o usuário de desativar a si mesmo', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'COORDENACAO' })
    const ctx = ctxDe(usuario)

    await expect(desativarUsuario(ctx, usuario.id)).rejects.toThrow(ErroValidacao)
  })
})
