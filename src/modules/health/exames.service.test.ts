import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { registrarExame, atualizarExame, listarExames } from './exames.service'

describe('registrarExame', () => {
  it('nasce SOLICITADO e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-08-01'),
      solicitanteNome: 'Dr. Antônio Lima',
    })

    expect(exame.status).toBe('SOLICITADO')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Exame', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarExame(ctx, { residenteId: residente.id, tipo: 'Hemograma completo' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarExame', () => {
  it('exige resumo ou anexo para chegar a RESULTADO_RECEBIDO', async () => {
    // Sem isto, marcar "resultado recebido" viraria o jeito rápido de tirar o
    // exame da lista de pendências sem ninguém ter olhado o resultado — que é
    // exatamente o problema que a lista existe para pegar.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })

    await expect(
      atualizarExame(ctx, exame.id, { status: 'RESULTADO_RECEBIDO' })
    ).rejects.toThrow(ErroValidacao)

    const comResumo = await atualizarExame(ctx, exame.id, {
      status: 'RESULTADO_RECEBIDO',
      resumoResultado: 'Hemoglobina 11,2 — anemia leve.',
      dataResultado: new Date('2026-08-10'),
    })
    expect(comResumo.status).toBe('RESULTADO_RECEBIDO')
  })

  it('aceita o resumo que já estava gravado de antes', async () => {
    // A guarda olha o estado do banco, não só o que veio no formulário: um
    // exame que já tinha resumo não precisa reenviá-lo para mudar de status.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })
    await atualizarExame(ctx, exame.id, {
      resumoResultado: 'Hemoglobina 11,2 — anemia leve.',
    })

    const recebido = await atualizarExame(ctx, exame.id, { status: 'RESULTADO_RECEBIDO' })
    expect(recebido.status).toBe('RESULTADO_RECEBIDO')
  })

  it('registra no diff só o que mudou', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })

    await atualizarExame(ctx, exame.id, { status: 'AGENDADO' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Exame', acao: 'ATUALIZAR', entidadeId: exame.id },
    })
    expect(log.diff).toEqual({ status: { de: 'SOLICITADO', para: 'AGENDADO' } })
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(saude, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      atualizarExame(ctx, exame.id, { status: 'AGENDADO' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarExames', () => {
  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarExames(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
