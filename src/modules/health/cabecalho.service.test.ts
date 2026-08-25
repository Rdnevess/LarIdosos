import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroNaoEncontrado, ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarAlergia,
  registrarCondicaoCronica,
  registrarRestricaoAlimentar,
  desativarAlergia,
  desativarCondicaoCronica,
  obterCabecalhoClinico,
  obterAlertasDeCuidado,
} from './cabecalho.service'

describe('registrarAlergia', () => {
  it('grava a alergia e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const alergia = await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Dipirona',
      tipo: 'MEDICAMENTO',
      gravidade: 'GRAVE',
      reacao: 'Edema de glote',
    })

    expect(alergia.agente).toBe('Dipirona')
    expect(alergia.ativa).toBe(true)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Alergia', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    // A fronteira da §7 do design: prontuário inteiro fora do alcance desse
    // papel, alergia inclusive.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarAlergia(ctx, {
        residenteId: residente.id,
        agente: 'Dipirona',
        tipo: 'MEDICAMENTO',
        gravidade: 'GRAVE',
      })
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa residente inexistente', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      registrarAlergia(ctx, {
        residenteId: 'clfake000000000000000000',
        agente: 'Dipirona',
        tipo: 'MEDICAMENTO',
        gravidade: 'GRAVE',
      })
    ).rejects.toThrow(ErroNaoEncontrado)
  })
})

describe('obterCabecalhoClinico', () => {
  it('traz só o que está ativo, com a alergia mais grave primeiro', async () => {
    // A ordem não é estética: quem lê o cabeçalho antes de encostar na pessoa
    // precisa ver o edema de glote antes da coceira.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Poeira',
      tipo: 'OUTRO',
      gravidade: 'LEVE',
    })
    await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Dipirona',
      tipo: 'MEDICAMENTO',
      gravidade: 'GRAVE',
    })
    const antiga = await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Camarão',
      tipo: 'ALIMENTO',
      gravidade: 'MODERADA',
    })
    await desativarAlergia(ctx, antiga.id)

    await registrarCondicaoCronica(ctx, {
      residenteId: residente.id,
      descricao: 'Hipertensão arterial',
      cid10: 'I10',
    })
    await registrarRestricaoAlimentar(ctx, {
      residenteId: residente.id,
      descricao: 'Dieta pastosa',
    })

    const cabecalho = await obterCabecalhoClinico(ctx, residente.id)

    expect(cabecalho.alergias.map((a) => a.agente)).toEqual(['Dipirona', 'Poeira'])
    expect(cabecalho.condicoes).toHaveLength(1)
    expect(cabecalho.restricoes).toHaveLength(1)
  })

  it('nega leitura ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(obterCabecalhoClinico(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('obterAlertasDeCuidado', () => {
  it('deixa o ADMINISTRATIVO ler alergia, restricao e condicao', async () => {
    // Secao 7.1 do design: neste Lar, quem cadastra e a mesma pessoa que
    // atende a portaria e recebe a entrega de alimento. Ela precisa saber que
    // a dona Maria nao pode comer camarao.
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await registrarAlergia(saude, {
      residenteId: residente.id,
      agente: 'Camarão',
      tipo: 'ALIMENTO',
      gravidade: 'GRAVE',
    })
    await registrarRestricaoAlimentar(saude, {
      residenteId: residente.id,
      descricao: 'Dieta pastosa',
    })
    await registrarCondicaoCronica(saude, {
      residenteId: residente.id,
      descricao: 'Diabetes tipo 2',
      cid10: 'E11',
    })

    const alertas = await obterAlertasDeCuidado(await ctxComPapel('ADMINISTRATIVO'), residente.id)

    expect(alertas.alergias.map((a) => a.agente)).toEqual(['Camarão'])
    expect(alertas.restricoes).toHaveLength(1)
    expect(alertas.condicoes).toHaveLength(1)
  })

  it('mantem a alergia mais grave primeiro, como no cabecalho', async () => {
    // Mesma ordenacao das duas portas: quem le antes de encostar na pessoa
    // precisa ver o edema de glote antes da coceira, venha por onde vier.
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await registrarAlergia(saude, {
      residenteId: residente.id,
      agente: 'Poeira',
      tipo: 'OUTRO',
      gravidade: 'LEVE',
    })
    await registrarAlergia(saude, {
      residenteId: residente.id,
      agente: 'Dipirona',
      tipo: 'MEDICAMENTO',
      gravidade: 'GRAVE',
    })

    const alertas = await obterAlertasDeCuidado(saude, residente.id)

    expect(alertas.alergias.map((a) => a.agente)).toEqual(['Dipirona', 'Poeira'])
  })
})

describe('desativarCondicaoCronica', () => {
  it('não apaga: marca inativa e audita o estado anterior', async () => {
    // Exclusão é sempre lógica. Uma condição que deixou de ser tratada é
    // parte da história clínica da pessoa.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const condicao = await registrarCondicaoCronica(ctx, {
      residenteId: residente.id,
      descricao: 'Anemia ferropriva',
    })

    await desativarCondicaoCronica(ctx, condicao.id)

    const registro = await prisma.condicaoCronica.findUniqueOrThrow({
      where: { id: condicao.id },
    })
    expect(registro.ativa).toBe(false)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'CondicaoCronica', acao: 'EXCLUIR', entidadeId: condicao.id },
    })
    expect(log.diff).toEqual({ ativa: { de: true, para: false } })
  })
})
