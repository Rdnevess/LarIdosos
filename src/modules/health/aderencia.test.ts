import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import type { Ctx } from '@/lib/contexto'
import { prescrever, type DadosMedicacao } from './medicacoes.service'
import { registrarAdministracao } from './administracao.service'
import { calcularAderencia } from './aderencia'

const DIA = {
  de: new Date('2026-08-24T00:00:00'),
  ate: new Date('2026-08-25T00:00:00'),
}

async function prescreverPara(
  ctx: Ctx,
  residenteId: string,
  campos: Partial<DadosMedicacao> = {}
) {
  return prescrever(ctx, {
    residenteId,
    farmaco: 'Losartana',
    dose: '1 comprimido',
    via: 'ORAL',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00', '12:00', '16:00', '20:00'],
    diasSemana: [],
    dataInicio: new Date('2026-08-24T00:00:00'),
    dataFim: new Date('2026-08-24T23:59:00'),
    ...campos,
  })
}

describe('calcularAderencia', () => {
  it('conta uma dose em cada estado, e separa sem registro de não administrada', async () => {
    // A distinção que o relatório existe para mostrar: "sem registro" é falha
    // de anotação, "não administrada" é decisão de alguém, e somá-las
    // esconderia as duas.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const medicacao = await prescreverPara(ctx, residente.id)

    const registrar = (
      hora: string,
      status: 'ADMINISTRADA' | 'RECUSADA' | 'NAO_ADMINISTRADA',
      motivo?: 'MEDICAMENTO_EM_FALTA'
    ) =>
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(`2026-08-24T${hora}:00`),
        status,
        motivo,
        observacao: 'Registro retroativo de teste.',
      })

    await registrar('08:00', 'ADMINISTRADA')
    await registrar('12:00', 'RECUSADA')
    await registrar('16:00', 'NAO_ADMINISTRADA', 'MEDICAMENTO_EM_FALTA')
    // A das 20:00 fica sem registro.

    const aderencia = await calcularAderencia(ctx, residente.id, DIA)

    expect(aderencia.previstas).toBe(4)
    expect(aderencia.administradas).toBe(1)
    expect(aderencia.recusadas).toBe(1)
    expect(aderencia.naoAdministradas).toBe(1)
    expect(aderencia.semRegistro).toBe(1)
    expect(aderencia.porMotivo.MEDICAMENTO_EM_FALTA).toBe(1)
    expect(aderencia.percentualSemRegistro).toBe(25)
  })

  it('conta as tardias dentro de administradas, e à parte', async () => {
    // Elas aconteceram — são medida de disciplina de registro, não de
    // administração.
    //
    // A dose é de um dia bem no passado, e não de hoje: registrada agora, ela
    // é tardia com certeza. Uma dose de hoje cairia no turno corrente quando o
    // teste rodasse dentro dele, e a asserção dependeria do relógio da
    // máquina.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const ontem = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    ontem.setHours(8, 0, 0, 0)

    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date(ontem.getTime() - 60_000),
      dataFim: new Date(ontem.getTime() + 60_000),
    })

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: ontem,
      status: 'ADMINISTRADA',
      observacao: 'Dose dada no plantão, registrada só agora.',
    })

    const aderencia = await calcularAderencia(ctx, residente.id, {
      de: new Date(ontem.getTime() - 3600_000),
      ate: new Date(ontem.getTime() + 3600_000),
    })

    expect(aderencia.previstas).toBe(1)
    expect(aderencia.administradas).toBe(1)
    expect(aderencia.registradasForaDoTurno).toBe(1)
  })

  it('devolve zero e não divide por zero quando não há dose prevista', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const aderencia = await calcularAderencia(ctx, residente.id, DIA)

    expect(aderencia.previstas).toBe(0)
    expect(aderencia.percentualSemRegistro).toBe(0)
  })

  it('conta só as doses do residente pedido', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const alvo = await criarResidenteDeTeste()
    const outro = await criarResidenteDeTeste()

    await prescreverPara(ctx, alvo.id, { horarios: ['08:00'] })
    await prescreverPara(ctx, outro.id, { horarios: ['08:00', '12:00'] })

    const aderencia = await calcularAderencia(ctx, alvo.id, DIA)
    expect(aderencia.previstas).toBe(1)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(calcularAderencia(ctx, residente.id, DIA)).rejects.toThrow(ErroPermissao)
  })
})
