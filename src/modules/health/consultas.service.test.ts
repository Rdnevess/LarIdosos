import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarConsulta,
  atualizarConsulta,
  listarConsultas,
} from './consultas.service'

describe('registrarConsulta', () => {
  it('aceita consulta marcada para o futuro', async () => {
    // Ao contrário de anotação e sinal vital, consulta nasce agendada: data
    // futura é o caso normal, não erro de digitação.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 7 * 86_400_000),
      especialidade: 'Cardiologia',
      local: 'UBS Central',
    })

    expect(consulta.status).toBe('AGENDADA')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Consulta', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarConsulta(ctx, {
        residenteId: residente.id,
        dataHora: new Date(),
        especialidade: 'Cardiologia',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarConsulta', () => {
  it('exige conduta para marcar como REALIZADA', async () => {
    // Consulta sem conduta registrada não saiu do lugar: o idoso foi, voltou,
    // e ninguém sabe o que o médico disse.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() - 86_400_000),
      especialidade: 'Cardiologia',
    })

    await expect(
      atualizarConsulta(ctx, consulta.id, { status: 'REALIZADA' })
    ).rejects.toThrow(ErroValidacao)

    const realizada = await atualizarConsulta(ctx, consulta.id, {
      status: 'REALIZADA',
      conduta: 'Mantida a medicação; retorno em 6 meses.',
    })
    expect(realizada.status).toBe('REALIZADA')
  })

  it('deixa cancelar sem conduta', async () => {
    // Consulta desmarcada não tem conduta a registrar, e exigi-la empurraria
    // a equipe a inventar texto.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 86_400_000),
      especialidade: 'Cardiologia',
    })

    const cancelada = await atualizarConsulta(ctx, consulta.id, { status: 'CANCELADA' })
    expect(cancelada.status).toBe('CANCELADA')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const consulta = await registrarConsulta(saude, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 86_400_000),
      especialidade: 'Cardiologia',
    })
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      atualizarConsulta(ctx, consulta.id, { status: 'CANCELADA' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarConsultas', () => {
  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarConsultas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
