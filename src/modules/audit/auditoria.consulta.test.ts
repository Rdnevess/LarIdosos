import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { registrarAuditoria } from './auditoria.service'
import { consultarAuditoria } from './auditoria.consulta'

describe('consultarAuditoria', () => {
  it('é restrita à coordenação', async () => {
    for (const papel of ['SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      await expect(consultarAuditoria(ctx, {})).rejects.toThrow(ErroPermissao)
    }
  })

  it('filtra por entidade e por período', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    await registrarAuditoria(prisma, ctx, { acao: 'CRIAR', entidade: 'Residente' })
    await registrarAuditoria(prisma, ctx, { acao: 'CRIAR', entidade: 'Funcionario' })

    const porEntidade = await consultarAuditoria(ctx, { entidade: 'Residente' })
    expect(porEntidade.total).toBe(1)

    const foraDoPeriodo = await consultarAuditoria(ctx, {
      de: new Date('2020-01-01'),
      ate: new Date('2020-12-31'),
    })
    expect(foraDoPeriodo.total).toBe(0)
  })

  it('pagina em 50 registros e ordena do mais recente', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    for (let i = 0; i < 55; i++) {
      await registrarAuditoria(prisma, ctx, {
        acao: 'VISUALIZAR',
        entidade: 'Residente',
        entidadeId: `res_${i}`,
      })
    }

    const primeira = await consultarAuditoria(ctx, { entidade: 'Residente' })
    expect(primeira.registros).toHaveLength(50)
    expect(primeira.total).toBe(55)
    expect(primeira.paginas).toBe(2)

    const segunda = await consultarAuditoria(ctx, { entidade: 'Residente', pagina: 2 })
    expect(segunda.registros).toHaveLength(5)
  })
})
