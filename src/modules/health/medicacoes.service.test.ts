import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import type { Ctx } from '@/lib/contexto'
import {
  prescrever,
  suspenderMedicacao,
  prescreverSubstituta,
  listarMedicacoes,
  listarMedicacoesAtivas,
  type DadosMedicacao,
} from './medicacoes.service'

function esquema(residenteId: string, campos: Partial<DadosMedicacao> = {}): DadosMedicacao {
  return {
    residenteId,
    farmaco: 'Losartana',
    concentracao: '50 mg',
    dose: '1 comprimido',
    via: 'ORAL',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00', '20:00'],
    diasSemana: [],
    dataInicio: new Date('2026-08-01T00:00:00'),
    ...campos,
  }
}

async function prescricaoDeTeste(ctx: Ctx, campos: Partial<DadosMedicacao> = {}) {
  const residente = await criarResidenteDeTeste()
  const medicacao = await prescrever(ctx, esquema(residente.id, campos))
  return { residente, medicacao }
}

describe('prescrever', () => {
  it('grava o esquema e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const medicacao = await prescrever(
      ctx,
      esquema(residente.id, { prescritorNome: 'Dr. Antônio Lima' })
    )

    expect(medicacao.ativa).toBe(true)
    expect(medicacao.horarios).toEqual(['08:00', '20:00'])
    expect(medicacao.substituiMedicacaoId).toBeNull()

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Medicacao', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa horário fora do formato HH:mm', async () => {
    // O formato é contrato com a derivação: "8h" não vira dose nenhuma, e a
    // falha apareceria como uma medicação que nunca chega à tela do turno.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      prescrever(ctx, esquema(residente.id, { horarios: ['8h'] }))
    ).rejects.toThrow(ErroValidacao)

    await expect(
      prescrever(ctx, esquema(residente.id, { horarios: ['25:00'] }))
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa HORARIO_FIXO sem nenhum horário', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      prescrever(ctx, esquema(residente.id, { horarios: [] }))
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita SE_NECESSARIO sem horário', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const medicacao = await prescrever(
      ctx,
      esquema(residente.id, { tipo: 'SE_NECESSARIO', horarios: [], farmaco: 'Dipirona' })
    )

    expect(medicacao.tipo).toBe('SE_NECESSARIO')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(prescrever(ctx, esquema(residente.id))).rejects.toThrow(ErroPermissao)
  })
})

describe('suspenderMedicacao', () => {
  it('encerra a vigência no instante da suspensão, não no fim do dia', async () => {
    // É o que impede a dose das 14h de existir quando o médico suspendeu às
    // 10h — e de o relatório acusá-la como "sem registro".
    const ctx = await ctxComPapel('SAUDE')
    const { medicacao } = await prescricaoDeTeste(ctx)

    const antes = Date.now()
    const suspensa = await suspenderMedicacao(ctx, medicacao.id, 'Suspensa pelo médico')

    expect(suspensa.ativa).toBe(false)
    expect(suspensa.motivoSuspensao).toBe('Suspensa pelo médico')
    expect(suspensa.dataFim!.getTime()).toBeGreaterThanOrEqual(antes)
  })

  it('exige motivo', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { medicacao } = await prescricaoDeTeste(ctx)

    await expect(suspenderMedicacao(ctx, medicacao.id, '')).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const { medicacao } = await prescricaoDeTeste(saude)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(suspenderMedicacao(ctx, medicacao.id, 'Motivo')).rejects.toThrow(
      ErroPermissao
    )
  })
})

describe('prescreverSubstituta', () => {
  it('recusa enquanto a anterior estiver ativa', async () => {
    // A substituição é o segundo passo de dois. Permitir o atalho desfaria a
    // decisão de expor suspender e prescrever como atos separados.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      prescreverSubstituta(ctx, medicacao.id, esquema(residente.id, { dose: '2 comprimidos' }))
    ).rejects.toThrow(ErroValidacao)
  })

  it('liga a nova à anterior depois da suspensão', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await suspenderMedicacao(ctx, medicacao.id, 'Dose ajustada')

    const nova = await prescreverSubstituta(
      ctx,
      medicacao.id,
      esquema(residente.id, { dose: '2 comprimidos', dataInicio: new Date() })
    )

    expect(nova.substituiMedicacaoId).toBe(medicacao.id)
    expect(nova.dose).toBe('2 comprimidos')
    expect(nova.ativa).toBe(true)
  })
})

describe('listarMedicacoesAtivas', () => {
  it('traz só as ativas, e a listagem completa traz as duas', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)
    await suspenderMedicacao(ctx, medicacao.id, 'Dose ajustada')
    await prescrever(ctx, esquema(residente.id, { farmaco: 'Enalapril' }))

    const ativas = await listarMedicacoesAtivas(ctx, residente.id)
    const todas = await listarMedicacoes(ctx, residente.id)

    expect(ativas.map((m) => m.farmaco)).toEqual(['Enalapril'])
    expect(todas).toHaveLength(2)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarMedicacoesAtivas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
