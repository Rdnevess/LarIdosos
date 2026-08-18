import { describe, it, expect } from 'vitest'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarAvaliacao,
  obterGrauVigente,
  listarAvaliacoes,
} from './dependencia.service'

describe('registrarAvaliacao', () => {
  it('permite SAUDE e COORDENACAO', async () => {
    const residente = await criarResidenteDeTeste()

    for (const papel of ['SAUDE', 'COORDENACAO'] as const) {
      const ctx = await ctxComPapel(papel)
      const avaliacao = await registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'II',
        dataAvaliacao: new Date('2026-03-01'),
        avaliadorNome: 'Enf. Ana',
      })
      expect(avaliacao.grau).toBe('II')
    }
  })

  it('nega para ADMINISTRATIVO — atribuir grau é ato clínico', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'II',
        dataAvaliacao: new Date('2026-03-01'),
        avaliadorNome: 'Enf. Ana',
      })
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa data de avaliação no futuro', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'I',
        dataAvaliacao: new Date(Date.now() + 86_400_000),
        avaliadorNome: 'Enf. Ana',
      })
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('obterGrauVigente', () => {
  it('retorna o grau da avaliação mais recente até a data de referência', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'I',
      dataAvaliacao: new Date('2026-01-10'),
      avaliadorNome: 'Enf. Ana',
    })
    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'III',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-03-01'))).toBe('I')
    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-08-01'))).toBe('III')
    expect(await obterGrauVigente(ctx, residente.id)).toBe('III')
  })

  it('retorna null quando não há avaliação até a data', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'II',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-01-01'))).toBeNull()
  })

  it('é legível por ADMINISTRATIVO — necessário para relatório de convênio', async () => {
    const residente = await criarResidenteDeTeste()
    const saude = await ctxComPapel('SAUDE')
    await registrarAvaliacao(saude, {
      residenteId: residente.id,
      grau: 'II',
      dataAvaliacao: new Date('2026-02-01'),
      avaliadorNome: 'Enf. Ana',
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    expect(await obterGrauVigente(administrativo, residente.id)).toBe('II')
  })
})

describe('listarAvaliacoes', () => {
  it('devolve o histórico do mais recente para o mais antigo', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'I',
      dataAvaliacao: new Date('2026-01-10'),
      avaliadorNome: 'Enf. Ana',
    })
    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'III',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    const historico = await listarAvaliacoes(ctx, residente.id)
    expect(historico.map((a) => a.grau)).toEqual(['III', 'I'])
  })
})
