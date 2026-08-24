import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import type { Ctx } from '@/lib/contexto'
import { prescrever, type DadosMedicacao } from './medicacoes.service'
import {
  registrarAdministracao,
  listarAdministracoes,
  ehRegistroTardio,
} from './administracao.service'

async function prescricaoDeTeste(ctx: Ctx, campos: Partial<DadosMedicacao> = {}) {
  const residente = await criarResidenteDeTeste()
  const medicacao = await prescrever(ctx, {
    residenteId: residente.id,
    farmaco: 'Losartana',
    dose: '1 comprimido',
    via: 'ORAL',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00'],
    diasSemana: [],
    dataInicio: new Date('2026-08-01T00:00:00'),
    ...campos,
  })
  return { residente, medicacao }
}

describe('registrarAdministracao', () => {
  it('registra a dose do turno corrente sem exigir nada além do status', async () => {
    // O "um toque" que o design promete: no turno corrente, marcar
    // administrada é um clique, sem campo nenhum.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(),
      status: 'ADMINISTRADA',
    })

    expect(registro.status).toBe('ADMINISTRADA')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'AdministracaoMedicacao', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa registro de turno passado sem observação', async () => {
    // Registro tardio é livre, e exige justificativa: sem ela, maquiar o
    // relatório de aderência no fim do mês não deixaria rastro na tela.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita registro de turno passado com observação', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status: 'ADMINISTRADA',
      observacao: 'Dose dada no plantão, registrada só agora.',
    })

    expect(registro.observacao).toContain('registrada só agora')
  })

  it('exige motivo quando não foi administrada', async () => {
    // "Não administrada" sem motivo é meia informação: quem lê o prontuário
    // depois precisa saber se faltou remédio ou se o idoso estava internado.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'NAO_ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)

    const comMotivo = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(),
      status: 'NAO_ADMINISTRADA',
      motivo: 'MEDICAMENTO_EM_FALTA',
    })
    expect(comMotivo.motivo).toBe('MEDICAMENTO_EM_FALTA')
  })

  it('impede dupla marcação da mesma dose', async () => {
    // A regra R4 em ação: duas pessoas com a tela do turno aberta ao mesmo
    // tempo, e a mensagem diz o que aconteceu de verdade.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)
    const dose = new Date()

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: dose,
      status: 'ADMINISTRADA',
    })

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: dose,
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(/já foi registrada/)
  })

  it('deixa registrar SE_NECESSARIO quantas vezes for preciso', async () => {
    // `horarioPrevisto` nulo, e o Postgres trata nulos como distintos na
    // restrição única — o comportamento que "se necessário" pede.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx, {
      tipo: 'SE_NECESSARIO',
      horarios: [],
      farmaco: 'Dipirona',
    })

    for (let i = 0; i < 3; i += 1) {
      await registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: null,
        status: 'ADMINISTRADA',
        observacao: 'Queixa de dor.',
      })
    }

    const registros = await prisma.administracaoMedicacao.findMany({
      where: { medicacaoId: medicacao.id },
    })
    expect(registros).toHaveLength(3)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(saude)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarAdministracoes', () => {
  it('traz só o que caiu na janela', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date('2026-08-24T08:00:00'),
      status: 'ADMINISTRADA',
      observacao: 'Registro retroativo de teste.',
    })

    const dentro = await listarAdministracoes(ctx, {
      inicio: new Date('2026-08-24T06:00:00'),
      fim: new Date('2026-08-24T14:00:00'),
    })
    const fora = await listarAdministracoes(ctx, {
      inicio: new Date('2026-08-24T14:00:00'),
      fim: new Date('2026-08-24T22:00:00'),
    })

    expect(dentro).toHaveLength(1)
    expect(fora).toHaveLength(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      listarAdministracoes(ctx, { inicio: new Date(), fim: new Date() })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('ehRegistroTardio', () => {
  it('é falso dentro do turno da dose e verdadeiro fora dele', () => {
    const dose = new Date('2026-08-24T08:00:00')
    expect(ehRegistroTardio(dose, new Date('2026-08-24T09:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-24T13:59:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-24T15:00:00'))).toBe(true)
  })

  it('SE_NECESSARIO nunca é tardia', () => {
    // Sem `horarioPrevisto` não há turno de referência: ela é registrada
    // quando acontece.
    expect(ehRegistroTardio(null, new Date())).toBe(false)
  })
})
