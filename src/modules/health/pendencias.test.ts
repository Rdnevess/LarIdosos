import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { registrarExame, atualizarExame } from './exames.service'
import { registrarConsulta, atualizarConsulta } from './consultas.service'
import { listarPendencias } from './pendencias'

describe('listarPendencias', () => {
  it('traz exame realizado sem resultado, e não traz o já recebido', async () => {
    // Exame feito cujo resultado ninguém buscou é exatamente o caso que o
    // módulo existe para pegar — por isso REALIZADO conta como pendente.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const emAberto = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-07-01'),
    })
    await atualizarExame(ctx, emAberto.id, { status: 'REALIZADO' })

    const resolvido = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Raio-X de tórax',
      dataSolicitacao: new Date('2026-07-02'),
    })
    await atualizarExame(ctx, resolvido.id, {
      status: 'RESULTADO_RECEBIDO',
      resumoResultado: 'Sem alterações.',
    })

    const pendencias = await listarPendencias(ctx)
    const tipos = pendencias.exames.map((e) => e.tipo)

    expect(tipos).toContain('Hemograma completo')
    expect(tipos).not.toContain('Raio-X de tórax')
  })

  it('não traz exame cancelado', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const cancelado = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Exame cancelado',
      dataSolicitacao: new Date('2026-07-03'),
    })
    await atualizarExame(ctx, cancelado.id, { status: 'CANCELADO' })

    const pendencias = await listarPendencias(ctx)
    expect(pendencias.exames.map((e) => e.tipo)).not.toContain('Exame cancelado')
  })

  it('atravessa residentes, com a pendência mais antiga primeiro', async () => {
    // Esquecer acontece entre residentes: ninguém percebe abrindo trinta
    // fichas uma a uma. E a mais antiga é a mais esquecida.
    const ctx = await ctxComPapel('SAUDE')
    const primeira = await criarResidenteDeTeste()
    const segunda = await criarResidenteDeTeste()

    await registrarExame(ctx, {
      residenteId: segunda.id,
      tipo: 'Exame recente',
      dataSolicitacao: new Date('2026-08-01'),
    })
    await registrarExame(ctx, {
      residenteId: primeira.id,
      tipo: 'Exame antigo',
      dataSolicitacao: new Date('2026-05-01'),
    })

    const pendencias = await listarPendencias(ctx)
    expect(pendencias.exames.map((e) => e.tipo)).toEqual(['Exame antigo', 'Exame recente'])
  })

  it('traz o nome do residente junto, sem consulta extra', async () => {
    // A tela mostra "de quem", e sem isto seria N+1 numa tela que a equipe
    // abre todo dia.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })

    await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-07-01'),
    })

    const pendencias = await listarPendencias(ctx)
    expect(pendencias.exames[0].residente.nomeCompleto).toBe('Maria das Dores')
  })

  it('traz consulta agendada e não traz a cancelada nem a realizada', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 5 * 86_400_000),
      especialidade: 'Cardiologia',
    })
    const desmarcada = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 6 * 86_400_000),
      especialidade: 'Oftalmologia',
    })
    await atualizarConsulta(ctx, desmarcada.id, { status: 'CANCELADA' })

    const feita = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() - 86_400_000),
      especialidade: 'Neurologia',
    })
    await atualizarConsulta(ctx, feita.id, {
      status: 'REALIZADA',
      conduta: 'Sem alteração de conduta.',
    })

    const pendencias = await listarPendencias(ctx)
    const especialidades = pendencias.consultas.map((c) => c.especialidade)

    expect(especialidades).toContain('Cardiologia')
    expect(especialidades).not.toContain('Oftalmologia')
    expect(especialidades).not.toContain('Neurologia')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(listarPendencias(ctx)).rejects.toThrow(ErroPermissao)
  })
})
