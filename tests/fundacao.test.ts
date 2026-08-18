import { describe, it, expect } from 'vitest'
import { prisma } from './helpers/banco'

describe('fundação', () => {
  it('conecta ao PostgreSQL e persiste um usuário', async () => {
    const criado = await prisma.usuario.create({
      data: {
        email: 'coordenacao@lar.local',
        senhaHash: 'hash-fake',
        nome: 'Coordenação',
        papel: 'COORDENACAO',
      },
    })

    const lido = await prisma.usuario.findUnique({ where: { id: criado.id } })

    expect(lido?.email).toBe('coordenacao@lar.local')
    expect(lido?.ativo).toBe(true)
    expect(lido?.id).toMatch(/^c[a-z0-9]{20,}$/)
  })

  it('limpa o banco entre os testes', async () => {
    const total = await prisma.usuario.count()
    expect(total).toBe(0)
  })
})
