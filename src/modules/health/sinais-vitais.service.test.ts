import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarSinalVital,
  listarSinaisVitais,
  obterUltimoSinalVital,
  existeAfericaoDaMedida,
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

  it('com `desde`, deixa de fora o que é anterior à janela', async () => {
    // O gráfico de tendência pede uma janela. Filtrar depois de ler traria
    // todo o histórico do residente para a memória a cada troca de janela,
    // quando o índice `[residenteId, aferidoEm]` já sabe fazer o corte.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-01-10T10:00:00Z'),
      peso: 70,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-10T10:00:00Z'),
      peso: 72,
    })

    const dentro = await listarSinaisVitais(ctx, residente.id, new Date('2026-06-01T00:00:00Z'))

    expect(dentro).toHaveLength(1)
    expect(Number(dentro[0].peso)).toBe(72)
  })

  it('sem `desde`, continua trazendo o histórico inteiro', async () => {
    // Os chamadores que já existiam — o prontuário e o cabeçalho clínico —
    // não passam janela, e não podem perder aferição por causa do parâmetro
    // novo.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-01-10T10:00:00Z'),
      peso: 70,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-10T10:00:00Z'),
      peso: 72,
    })

    expect(await listarSinaisVitais(ctx, residente.id)).toHaveLength(2)
  })
})

describe('existeAfericaoDaMedida', () => {
  it('separa "nunca se aferiu isto" de "nada na janela"', async () => {
    // A tela vazia precisa dizer qual dos dois é. São conselhos opostos: um
    // pede abrir a janela, o outro pede começar a medir. É a mesma dúvida que
    // a pendência 2 do alerta admite ter sobre a frequência de aferição.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-01-10T10:00:00Z'),
      peso: 70,
    })

    expect(await existeAfericaoDaMedida(ctx, residente.id, 'peso')).toBe(true)
    expect(await existeAfericaoDaMedida(ctx, residente.id, 'glicemia')).toBe(false)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(existeAfericaoDaMedida(ctx, residente.id, 'peso')).rejects.toThrow(
      ErroPermissao
    )
  })
})
