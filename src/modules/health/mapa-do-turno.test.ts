import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { janelaDoTurno } from '@/lib/turno'
import type { Ctx } from '@/lib/contexto'
import { prescrever, type DadosMedicacao } from './medicacoes.service'
import { registrarAdministracao } from './administracao.service'
import { montarMapaDoTurno } from './mapa-do-turno'

const MANHA = janelaDoTurno(new Date('2026-08-24T09:00:00'))
const NOVE_HORAS = new Date('2026-08-24T09:00:00')

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
    horarios: ['08:00'],
    diasSemana: [],
    dataInicio: new Date('2026-08-01T00:00:00'),
    ...campos,
  })
}

describe('montarMapaDoTurno', () => {
  it('cruza as doses derivadas com o que foi registrado', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })
    const medicacao = await prescreverPara(ctx, residente.id, {
      horarios: ['08:00', '12:00'],
    })

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date('2026-08-24T08:00:00'),
      status: 'ADMINISTRADA',
      observacao: 'Registro retroativo de teste.',
    })

    const mapa = await montarMapaDoTurno(ctx, MANHA, NOVE_HORAS)

    expect(mapa.doses).toHaveLength(2)
    expect(mapa.doses[0].estado).toBe('ADMINISTRADA')
    expect(mapa.doses[0].residenteNome).toBe('Maria das Dores')
    // A das 12:00 ainda não venceu às 9h.
    expect(mapa.doses[1].estado).toBe('PREVISTA')
  })

  it('marca como ATRASADA a dose vencida há mais de 30 minutos', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescreverPara(ctx, residente.id)

    const quase = await montarMapaDoTurno(ctx, MANHA, new Date('2026-08-24T08:20:00'))
    expect(quase.doses[0].estado).toBe('PREVISTA')

    const atrasada = await montarMapaDoTurno(ctx, MANHA, new Date('2026-08-24T08:40:00'))
    expect(atrasada.doses[0].estado).toBe('ATRASADA')
  })

  it('usa SEM_REGISTRO quando o turno já acabou, nunca NAO_ADMINISTRADA', async () => {
    // O ponto da fase inteira: a dose pode ter sido dada e apenas não
    // marcada, e afirmar o contrário grava mentira no prontuário.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescreverPara(ctx, residente.id)

    const mapa = await montarMapaDoTurno(ctx, MANHA, new Date('2026-08-25T09:00:00'))

    expect(mapa.doses[0].estado).toBe('SEM_REGISTRO')
  })

  it('separa as SE_NECESSARIO das doses do turno', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescreverPara(ctx, residente.id, {
      tipo: 'SE_NECESSARIO',
      horarios: [],
      farmaco: 'Dipirona',
    })

    const mapa = await montarMapaDoTurno(ctx, MANHA, NOVE_HORAS)

    expect(mapa.doses).toHaveLength(0)
    expect(mapa.seNecessario.map((m) => m.farmaco)).toEqual(['Dipirona'])
  })

  it('atravessa residentes, agrupando por horário e não por pessoa', async () => {
    // A equipe percorre o corredor às 08:00 dando os remédios das 08:00 de
    // todo mundo — não abre uma ficha por vez.
    const ctx = await ctxComPapel('SAUDE')
    const primeira = await criarResidenteDeTeste({ nomeCompleto: 'Ana' })
    const segunda = await criarResidenteDeTeste({ nomeCompleto: 'Bruno' })

    await prescreverPara(ctx, segunda.id, { horarios: ['12:00'] })
    await prescreverPara(ctx, primeira.id, { horarios: ['08:00'] })

    const mapa = await montarMapaDoTurno(ctx, MANHA, NOVE_HORAS)

    expect(mapa.doses.map((d) => d.residenteNome)).toEqual(['Ana', 'Bruno'])
  })

  it('não deriva dose de prescrição suspensa antes do turno', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescreverPara(ctx, residente.id, {
      dataFim: new Date('2026-08-20T00:00:00'),
    })

    const mapa = await montarMapaDoTurno(ctx, MANHA, NOVE_HORAS)
    expect(mapa.doses).toHaveLength(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(montarMapaDoTurno(ctx, MANHA, NOVE_HORAS)).rejects.toThrow(ErroPermissao)
  })
})
