import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  criarAnotacao,
  listarAnotacoes,
  editarAnotacao,
  retificarAnotacao,
} from './anotacoes.service'

async function anotacaoBase() {
  const residente = await criarResidenteDeTeste()
  const ctx = await ctxComPapel('SAUDE')
  const anotacao = await criarAnotacao(ctx, {
    residenteId: residente.id,
    categoria: 'VISITA_FAMILIA',
    texto: 'Recebeu visita da filha na tarde de hoje.',
  })
  return { residente, ctx, anotacao }
}

describe('criarAnotacao', () => {
  it('é permitida aos três papéis e grava o autor', async () => {
    const residente = await criarResidenteDeTeste()

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const anotacao = await criarAnotacao(ctx, {
        residenteId: residente.id,
        categoria: 'OUTRO',
        texto: 'Registro de teste com texto suficiente.',
      })
      expect(anotacao.criadoPorId).toBe(ctx.usuarioId)
    }
  })

  it('define a janela de edição em 15 minutos', async () => {
    const { anotacao } = await anotacaoBase()
    const janelaMinutos =
      (anotacao.editavelAte.getTime() - anotacao.criadoEm.getTime()) / 60_000
    expect(Math.round(janelaMinutos)).toBe(15)
  })

  it('recusa texto vazio', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarAnotacao(ctx, { residenteId: residente.id, categoria: 'OUTRO', texto: '   ' })
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('editarAnotacao', () => {
  it('permite ao autor editar dentro da janela', async () => {
    const { ctx, anotacao } = await anotacaoBase()

    const editada = await editarAnotacao(ctx, anotacao.id, 'Texto corrigido pelo autor.')

    expect(editada.texto).toBe('Texto corrigido pelo autor.')
  })

  it('recusa edição após a janela', async () => {
    const { ctx, anotacao } = await anotacaoBase()
    await prisma.anotacao.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })

    await expect(
      editarAnotacao(ctx, anotacao.id, 'Tentativa tardia.')
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa edição por outro usuário, mesmo da coordenação', async () => {
    const { anotacao } = await anotacaoBase()
    const outro = await ctxComPapel('COORDENACAO')

    await expect(
      editarAnotacao(outro, anotacao.id, 'Editando anotação alheia.')
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('retificarAnotacao', () => {
  it('cria uma nova anotação vinculada e preserva a original intacta', async () => {
    const { anotacao } = await anotacaoBase()
    await prisma.anotacao.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })
    const outro = await ctxComPapel('COORDENACAO')

    const retificacao = await retificarAnotacao(outro, anotacao.id, {
      texto: 'Correção: a visita foi da sobrinha, não da filha.',
    })

    expect(retificacao.retificaAnotacaoId).toBe(anotacao.id)
    expect(retificacao.categoria).toBe('VISITA_FAMILIA')

    const original = await prisma.anotacao.findUniqueOrThrow({ where: { id: anotacao.id } })
    expect(original.texto).toBe('Recebeu visita da filha na tarde de hoje.')
  })

  it('registra a retificação na auditoria apontando para a original', async () => {
    const { anotacao, ctx } = await anotacaoBase()

    const retificacao = await retificarAnotacao(ctx, anotacao.id, {
      texto: 'Correção do registro anterior.',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Anotacao', acao: 'CRIAR', entidadeId: retificacao.id },
    })
    expect(log.diff).toEqual({
      retificaAnotacaoId: { de: null, para: anotacao.id },
    })
  })
})

describe('listarAnotacoes', () => {
  it('audita a leitura do histórico de anotações', async () => {
    const { residente, ctx } = await anotacaoBase()

    await listarAnotacoes(ctx, residente.id)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Anotacao', acao: 'VISUALIZAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa categoria clínica na anotação geral', async () => {
    // Clínico tem um lugar só, e é `AnotacaoSaude`. Sem esta recusa, um
    // comportamento agitado poderia ser registrado nos dois lugares, e o
    // prontuário ficaria com metade da história.
    const { residente, ctx } = await anotacaoBase()

    await expect(
      criarAnotacao(ctx, {
        residenteId: residente.id,
        categoria: 'OCORRENCIA' as never,
        texto: 'Tentativa de registrar clínico na anotação geral.',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('devolve da mais recente para a mais antiga', async () => {
    const { residente, ctx } = await anotacaoBase()
    await criarAnotacao(ctx, {
      residenteId: residente.id,
      categoria: 'VISITA_FAMILIA',
      texto: 'Segunda anotação registrada.',
    })

    const lista = await listarAnotacoes(ctx, residente.id)

    expect(lista).toHaveLength(2)
    expect(lista[0].texto).toBe('Segunda anotação registrada.')
  })
})
