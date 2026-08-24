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

  it('tem as tabelas do prontuário com o vínculo ao residente', async () => {
    // A fundação da 2A: sem estas oito tabelas nenhuma tarefa seguinte roda.
    // O teste consulta o catálogo em vez de contar linhas porque as tabelas
    // nascem vazias.
    const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'condicoes_cronicas', 'alergias', 'restricoes_alimentares',
          'anotacoes_saude', 'sinais_vitais', 'exames', 'consultas', 'vacinas'
        )
    `
    expect(tabelas).toHaveLength(8)
  })

  it('tem as tabelas de medicação, com a restrição que impede dupla marcação', async () => {
    const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('medicacoes', 'administracoes_medicacao')
    `
    expect(tabelas).toHaveLength(2)

    // A R4 em forma de constraint: é ela que impede duas pessoas com a tela
    // do turno aberta de marcarem a mesma dose duas vezes.
    const unicas = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'administracoes_medicacao'
        AND indexdef LIKE '%UNIQUE%medicacaoId%horarioPrevisto%'
    `
    expect(unicas.length).toBeGreaterThan(0)
  })

  it('limpa o banco entre os testes', async () => {
    const total = await prisma.usuario.count()
    expect(total).toBe(0)
  })
})
