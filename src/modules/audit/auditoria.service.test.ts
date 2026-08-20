import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
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

  it('ignora chave presente com undefined, do mesmo jeito que chave ausente', () => {
    // Esta é a forma que a camada de ação produzia antes do `semIndefinidos`,
    // e que qualquer outro chamador ainda pode produzir. Como o Prisma ignora
    // `undefined` em `data`, o campo não é tocado — gravar "Ana → —" no diff
    // afirmaria uma alteração que não aconteceu.
    expect(calcularDiff({ nome: 'Maria', rg: 'X-1' }, { nome: 'Maria', rg: undefined })).toBeNull()
  })

  it('não acusa alteração quando a data é o mesmo dia em carimbos diferentes', () => {
    // O Postgres devolve `@db.Date` como meia-noite UTC; o formulário monta
    // meio-dia no fuso local. Sem a comparação por dia civil, toda edição
    // gravava "Data de nascimento: 12/03/1940 → 12/03/1940".
    const doBanco = { dataNascimento: new Date('1940-03-12T00:00:00Z') }
    const doFormulario = { dataNascimento: new Date('1940-03-12T12:00:00') }

    expect(calcularDiff(doBanco, doFormulario)).toBeNull()
    expect(
      calcularDiff(doBanco, { dataNascimento: new Date('1940-03-13T12:00:00') })
    ).not.toBeNull()
  })

  it('não acusa alteração quando o Decimal do banco tem o mesmo valor do número da tela', () => {
    // `JSON.stringify` de um `Decimal` devolve string e de um número devolve
    // número: sem converter, `beneficioValor` divergia sempre de si mesmo.
    const doBanco = { beneficioValor: new Prisma.Decimal('1412.00') }

    expect(calcularDiff(doBanco, { beneficioValor: 1412 })).toBeNull()
    expect(calcularDiff(doBanco, { beneficioValor: 1500 })).not.toBeNull()
  })

  it('registra mudança quando o campo é realmente esvaziado com null', () => {
    // `null` é diferente de `undefined`: é a única forma de limpar um campo,
    // e ela precisa continuar aparecendo na trilha.
    expect(calcularDiff({ rg: 'X-1' }, { rg: null })).toEqual({
      rg: { de: 'X-1', para: null },
    })
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
