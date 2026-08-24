import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarSinalVital,
  listarSinaisVitais,
  obterUltimoSinalVital,
} from './sinais-vitais.service'

describe('registrarSinalVital', () => {
  it('aceita aferição parcial', async () => {
    // Quem afere só a pressão não deve ser obrigado a inventar uma saturação.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date(),
      pressaoSistolica: 130,
      pressaoDiastolica: 80,
    })

    expect(sinal.pressaoSistolica).toBe(130)
    expect(sinal.saturacaoO2).toBeNull()

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'SinalVital', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa aferição sem nenhuma medida', async () => {
    // Um registro sem nenhum número não é uma aferição: é uma linha vazia na
    // linha do tempo, ocupando o lugar de uma de verdade.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(),
        observacao: 'Paciente dormindo.',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa aferição no futuro', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(Date.now() + 86_400_000),
        temperatura: 36.5,
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita febre alta, e recusa temperatura impossível', async () => {
    // As faixas são de plausibilidade, não clínicas: existem para pegar dedo
    // escorregado no teclado antes de o número virar linha do prontuário.
    // Recusar 40 °C apagaria justamente o registro que mais importa.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const febre = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date(),
      temperatura: 40,
    })
    expect(Number(febre.temperatura)).toBe(40)

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(),
        temperatura: 365,
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(),
        temperatura: 36.5,
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('obterUltimoSinalVital', () => {
  it('devolve a aferição mais recente, não a última gravada', async () => {
    // Registro retroativo é comum: alguém lança de manhã o que aferiu de
    // madrugada. Ordenar por `criadoEm` mostraria a antiga como atual.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T08:00:00'),
      temperatura: 36.5,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-19T08:00:00'),
      temperatura: 37.8,
    })

    const ultimo = await obterUltimoSinalVital(ctx, residente.id)
    expect(Number(ultimo?.temperatura)).toBe(36.5)
  })

  it('devolve null quando não há aferição nenhuma', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    expect(await obterUltimoSinalVital(ctx, residente.id)).toBeNull()
  })
})

describe('listarSinaisVitais', () => {
  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarSinaisVitais(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
