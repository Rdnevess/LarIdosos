import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { registrarVacina, listarVacinas } from './vacinas.service'

describe('registrarVacina', () => {
  it('grava a aplicação e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const vacina = await registrarVacina(ctx, {
      residenteId: residente.id,
      imunizante: 'Influenza',
      dose: 'Dose anual 2026',
      dataAplicacao: new Date('2026-04-15'),
      lote: 'ABC123',
      localAplicacao: 'Deltoide esquerdo',
    })

    expect(vacina.imunizante).toBe('Influenza')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Vacina', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa aplicação no futuro', async () => {
    // Vacina se registra depois de aplicada. Data futura aqui é erro de
    // digitação, e a carteira de vacinação é documento que a vigilância lê.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarVacina(ctx, {
        residenteId: residente.id,
        imunizante: 'Influenza',
        dose: 'Dose anual 2026',
        dataAplicacao: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarVacina(ctx, {
        residenteId: residente.id,
        imunizante: 'Influenza',
        dose: 'Dose anual 2026',
        dataAplicacao: new Date('2026-04-15'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarVacinas', () => {
  it('devolve da mais recente para a mais antiga', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarVacina(ctx, {
      residenteId: residente.id,
      imunizante: 'Influenza',
      dose: 'Dose anual 2025',
      dataAplicacao: new Date('2025-04-10'),
    })
    await registrarVacina(ctx, {
      residenteId: residente.id,
      imunizante: 'Influenza',
      dose: 'Dose anual 2026',
      dataAplicacao: new Date('2026-04-15'),
    })

    const lista = await listarVacinas(ctx, residente.id)
    expect(lista.map((v) => v.dose)).toEqual(['Dose anual 2026', 'Dose anual 2025'])
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarVacinas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
