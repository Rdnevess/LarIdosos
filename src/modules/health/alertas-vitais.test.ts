import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { registrarSinalVital } from './sinais-vitais.service'
import { definirFaixa } from './faixas.service'
import { dispensarAlerta, listarAlertasVitais } from './alertas-vitais'

const AGORA = () => new Date()
const HA_DIAS = (dias: number) => new Date(Date.now() - dias * 86_400_000)

describe('listarAlertasVitais', () => {
  it('alerta o valor fora da faixa do sistema', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria Alerta' })

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
      pressaoDiastolica: 120,
    })

    const alertas = await listarAlertasVitais(ctx)
    const sistolica = alertas.filter(
      (a) => a.residenteId === residente.id && a.medida === 'PRESSAO_SISTOLICA'
    )

    expect(sistolica).toHaveLength(1)
    expect(sistolica[0].valor).toBe(200)
    expect(sistolica[0].residenteNome).toBe('Maria Alerta')
  })

  it('não alerta o valor dentro da faixa', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 120,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('a faixa ajustada do residente vence a do sistema', async () => {
    // O hipertenso conhecido: 150 está fora da faixa do sistema (90–140) e
    // dentro da dele. É a regra que impede o alerta diário que ninguém lê.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', {
      minimo: 110,
      maximo: 160,
    })

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 150,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('ignora aferição mais velha que a janela', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(8),
      pressaoSistolica: 200,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('conta quantas aferições seguidas estão fora', async () => {
    // É o que separa o evento do padrão: uma vez pede atenção, três seguidas
    // pedem ajuste de faixa.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    for (const dias of [3, 2, 1]) {
      await registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: HA_DIAS(dias),
        pressaoSistolica: 200,
      })
    }

    const alertas = await listarAlertasVitais(ctx)
    const doResidente = alertas.filter(
      (a) => a.residenteId === residente.id && a.medida === 'PRESSAO_SISTOLICA'
    )

    expect(doResidente).toHaveLength(3)
    expect(Math.max(...doResidente.map((a) => a.seguidas))).toBe(3)
  })

  it('uma aferição dentro da faixa zera a contagem de seguidas', async () => {
    // Sem isto, "fora há 5 aferições seguidas" contaria aferições normais no
    // meio — e a contagem existe justamente para dizer se é padrão ou evento.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(3),
      pressaoSistolica: 200,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(2),
      pressaoSistolica: 120,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(1),
      pressaoSistolica: 200,
    })

    const alertas = await listarAlertasVitais(ctx)
    const doResidente = alertas.filter(
      (a) => a.residenteId === residente.id && a.medida === 'PRESSAO_SISTOLICA'
    )

    expect(doResidente).toHaveLength(2)
    expect(Math.max(...doResidente.map((a) => a.seguidas)), 'a normal do meio zera').toBe(1)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(listarAlertasVitais(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('dispensarAlerta', () => {
  it('some para quem dispensou e continua para o outro', async () => {
    // A decisão do Lar: o dispensar é individual. Um usuário resolver não pode
    // esconder o alerta de quem entra no plantão seguinte.
    const ana = await ctxComPapel('SAUDE')
    const carlos = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ana, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    await dispensarAlerta(ana, sinal.id, 'PRESSAO_SISTOLICA')

    const daAna = await listarAlertasVitais(ana)
    const doCarlos = await listarAlertasVitais(carlos)

    expect(daAna.filter((a) => a.sinalVitalId === sinal.id)).toEqual([])
    expect(doCarlos.filter((a) => a.sinalVitalId === sinal.id)).toHaveLength(1)
  })

  it('dispensar uma medida não dispensa a outra da mesma aferição', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
      pressaoDiastolica: 120,
    })

    await dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')

    const alertas = await listarAlertasVitais(ctx)
    const daAfericao = alertas.filter((a) => a.sinalVitalId === sinal.id)

    expect(daAfericao).toHaveLength(1)
    expect(daAfericao[0].medida).toBe('PRESSAO_DIASTOLICA')
  })

  it('a aferição seguinte volta a alertar, mesmo tendo dispensado a anterior', async () => {
    // O alerta é sobre a medida, e não sobre a pessoa: dispensar hoje não pode
    // esconder a piora de amanhã.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const ontem = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(1),
      pressaoSistolica: 190,
    })
    await dispensarAlerta(ctx, ontem.id, 'PRESSAO_SISTOLICA')

    const hoje = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 220,
    })

    const alertas = await listarAlertasVitais(ctx)
    const ids = alertas.map((a) => a.sinalVitalId)

    expect(ids).toContain(hoje.id)
    expect(ids).not.toContain(ontem.id)
  })

  it('dispensar duas vezes não estoura', async () => {
    // O `@@unique` recusaria o segundo insert. Clicar duas vezes é normal, e a
    // resposta certa é "já está dispensado", não um erro na tela.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    await dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')
    await expect(
      dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')
    ).resolves.toBeUndefined()
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const enfermeira = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const sinal = await registrarSinalVital(enfermeira, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')).rejects.toThrow(
      ErroPermissao
    )
  })
})
