import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { definirFaixa, listarFaixas } from './faixas.service'

describe('definirFaixa', () => {
  it('grava o ajuste e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', {
      minimo: 110,
      maximo: 160,
    })

    expect(await listarFaixas(ctx, residente.id)).toEqual([
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'FaixaReferencia', residenteId: residente.id },
    })
    expect(log.acao).toBe('CRIAR')
  })

  it('redefinir a mesma medida atualiza, e não cria uma segunda', async () => {
    // O `@@unique` do banco impede duas faixas concorrentes; aqui se prova que
    // o serviço trata isso como atualização, e não como erro na cara de quem
    // só quis corrigir o número.
    const ctx = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'TEMPERATURA', { minimo: 35, maximo: 38 })
    await definirFaixa(ctx, residente.id, 'TEMPERATURA', { minimo: 35, maximo: 38.5 })

    const faixas = await listarFaixas(ctx, residente.id)
    expect(faixas).toHaveLength(1)
    expect(faixas[0].maximo).toBe(38.5)

    const logs = await prisma.logAuditoria.count({
      where: { entidade: 'FaixaReferencia', residenteId: residente.id },
    })
    expect(logs, 'as duas escritas deixam rastro').toBe(2)
  })

  it('aceita faixa com um lado só', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'SATURACAO_O2', { minimo: 90, maximo: null })

    expect(await listarFaixas(ctx, residente.id)).toEqual([
      { medida: 'SATURACAO_O2', minimo: 90, maximo: null },
    ])
  })

  it('recusa faixa invertida', async () => {
    // Mínimo maior que máximo não alerta nunca nem alerta sempre — depende de
    // qual comparação roda primeiro. É erro de digitação, e o lugar de
    // recusá-lo é aqui.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', { minimo: 160, maximo: 110 })
    ).rejects.toThrow('O mínimo não pode ser maior que o máximo')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirFaixa(ctx, residente.id, 'GLICEMIA', { minimo: 70, maximo: 200 })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarFaixas', () => {
  it('devolve vazio para quem não tem ajuste', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    expect(await listarFaixas(ctx, residente.id)).toEqual([])
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarFaixas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
