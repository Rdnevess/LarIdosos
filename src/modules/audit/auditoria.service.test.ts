import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import type { Ctx } from '@/lib/contexto'
import * as auditoria from './auditoria.service'
import { registrarAuditoria, calcularDiff } from './auditoria.service'

const ctx: Ctx = {
  usuarioId: 'usr_1',
  email: 'coordenacao@lar.local',
  papel: 'COORDENACAO',
  ip: '10.0.0.5',
  userAgent: 'teste',
}

describe('registrarAuditoria', () => {
  it('grava a ação com os dados do contexto', async () => {
    await registrarAuditoria(prisma, ctx, {
      acao: 'CRIAR',
      entidade: 'Residente',
      entidadeId: 'res_1',
      residenteId: 'res_1',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow()
    expect(log.usuarioId).toBe('usr_1')
    expect(log.usuarioEmail).toBe('coordenacao@lar.local')
    expect(log.acao).toBe('CRIAR')
    expect(log.entidade).toBe('Residente')
    expect(log.entidadeId).toBe('res_1')
    expect(log.ip).toBe('10.0.0.5')
  })

  it('é desfeita junto com a transação que falha', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarAuditoria(tx, ctx, { acao: 'CRIAR', entidade: 'Residente' })
        throw new Error('falha proposital')
      })
    ).rejects.toThrow('falha proposital')

    expect(await prisma.logAuditoria.count()).toBe(0)
  })
})

describe('calcularDiff', () => {
  it('retorna apenas os campos alterados', () => {
    const diff = calcularDiff(
      { nome: 'Maria', quarto: '3', leito: 'A' },
      { nome: 'Maria Silva', quarto: '3' }
    )
    expect(diff).toEqual({ nome: { de: 'Maria', para: 'Maria Silva' } })
  })

  it('retorna null quando nada mudou', () => {
    expect(calcularDiff({ nome: 'Maria' }, { nome: 'Maria' })).toBeNull()
  })

  it('compara datas por valor, não por referência', () => {
    const antes = { dataAdmissao: new Date('2026-01-10T00:00:00Z') }
    const igual = { dataAdmissao: new Date('2026-01-10T00:00:00Z') }
    const diferente = { dataAdmissao: new Date('2026-02-10T00:00:00Z') }

    expect(calcularDiff(antes, igual)).toBeNull()
    expect(calcularDiff(antes, diferente)).not.toBeNull()
  })

  it('distingue null de string vazia', () => {
    expect(calcularDiff({ rg: null }, { rg: '' })).not.toBeNull()
  })

  it('ignora campos ausentes no objeto de alteração', () => {
    expect(calcularDiff({ nome: 'Maria', cpf: '123' }, { nome: 'Maria' })).toBeNull()
  })
})

describe('superfície do módulo', () => {
  it('não expõe operação de alteração ou exclusão de log', () => {
    expect(Object.keys(auditoria).sort()).toEqual([
      'calcularDiff',
      'registrarAuditoria',
    ])
  })
})
