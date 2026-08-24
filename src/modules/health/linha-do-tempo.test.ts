import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { criarAnotacao } from '@/modules/residents/anotacoes.service'
import { registrarAvaliacao } from '@/modules/residents/dependencia.service'
import { criarAnotacaoSaude } from './anotacoes-saude.service'
import { registrarSinalVital } from './sinais-vitais.service'
import { registrarExame } from './exames.service'
import { registrarConsulta } from './consultas.service'
import { montarLinhaDoTempo } from './linha-do-tempo'

const JANELA = { de: new Date('2026-08-01'), ate: new Date('2026-08-31') }

describe('montarLinhaDoTempo', () => {
  it('ordena eventos de tipos diferentes pelo momento em que ocorreram', async () => {
    // O ponto inteiro da linha do tempo: a equipe pensa "o que aconteceu com
    // ela nas últimas semanas", não "abra a aba de exames".
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T14:00:00'),
      temperatura: 38.2,
    })
    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'INTERCORRENCIA',
      turno: 'MANHA',
      texto: 'Febre ao acordar.',
      ocorridoEm: new Date('2026-08-20T07:00:00'),
    })
    await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date('2026-08-20T16:00:00'),
      especialidade: 'Clínica geral',
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, JANELA)

    expect(linha.map((e) => e.tipo)).toEqual([
      'CONSULTA',
      'SINAL_VITAL',
      'ANOTACAO_SAUDE',
    ])
  })

  it('põe o exame na data do que houve de mais recente com ele', async () => {
    // Um exame solicitado em maio e com resultado em agosto pertence a agosto
    // na linha do tempo: é quando algo aconteceu com ele.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-05-02'),
      dataResultado: new Date('2026-08-15'),
      status: 'RESULTADO_RECEBIDO',
      resumoResultado: 'Hemoglobina 11,2.',
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, JANELA)

    expect(linha).toHaveLength(1)
    expect(linha[0].ocorridoEm.toISOString().slice(0, 10)).toBe('2026-08-15')
  })

  it('filtra por tipo', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T14:00:00'),
      temperatura: 38.2,
    })
    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Sem intercorrências.',
      ocorridoEm: new Date('2026-08-20T07:00:00'),
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, {
      ...JANELA,
      tipos: ['SINAL_VITAL'],
    })

    expect(linha).toHaveLength(1)
    expect(linha[0].tipo).toBe('SINAL_VITAL')
  })

  it('inclui a mudança de grau de dependência', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'II',
      dataAvaliacao: new Date('2026-08-10'),
      avaliadorNome: 'Enfermeira Marta',
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, JANELA)

    expect(linha).toHaveLength(1)
    expect(linha[0].tipo).toBe('GRAU_DEPENDENCIA')
    expect(linha[0].titulo).toContain('Grau II')
  })

  it('não traz a anotação geral, que é da ficha cadastral', async () => {
    // Se a anotação geral entrasse aqui, o mesmo dado teria dois níveis de
    // acesso conforme a tela por onde fosse lido — e a fronteira do
    // ADMINISTRATIVO deixaria de fazer sentido.
    const saude = await ctxComPapel('SAUDE')
    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await criarAnotacao(administrativo, {
      residenteId: residente.id,
      categoria: 'VISITA_FAMILIA',
      texto: 'Filha visitou na tarde de domingo.',
    })

    const linha = await montarLinhaDoTempo(saude, residente.id)
    expect(linha).toHaveLength(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(montarLinhaDoTempo(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
