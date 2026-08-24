import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  criarAnotacaoSaude,
  editarAnotacaoSaude,
  retificarAnotacaoSaude,
  listarAnotacoesSaude,
} from './anotacoes-saude.service'

describe('criarAnotacaoSaude', () => {
  it('grava com autor, turno e o momento em que ocorreu', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const ocorridoEm = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const anotacao = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'INTERCORRENCIA',
      turno: 'NOITE',
      texto: 'Queda da própria altura ao ir ao banheiro. Sem lesão aparente.',
      gravidade: 'MODERADA',
      conduta: 'Observação por 24h e comunicação à família.',
      ocorridoEm,
    })

    expect(anotacao.criadoPorId).toBe(ctx.usuarioId)
    // `ocorridoEm` é diferente de `criadoEm`: quem registra às 6h o que houve
    // às 3h precisa poder dizer isso, senão a linha do tempo mente sobre a
    // madrugada.
    expect(anotacao.ocorridoEm.getTime()).toBe(ocorridoEm.getTime())
    expect(anotacao.criadoEm.getTime()).toBeGreaterThan(ocorridoEm.getTime())

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'AnotacaoSaude', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa data de ocorrência no futuro', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      criarAnotacaoSaude(ctx, {
        residenteId: residente.id,
        categoria: 'EVOLUCAO',
        turno: 'MANHA',
        texto: 'Registro com data futura.',
        ocorridoEm: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      criarAnotacaoSaude(ctx, {
        residenteId: residente.id,
        categoria: 'EVOLUCAO',
        turno: 'MANHA',
        texto: 'Tentativa do administrativo.',
        ocorridoEm: new Date(),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('editarAnotacaoSaude', () => {
  it('deixa o autor corrigir dentro da janela', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Aceitou o café da manhã por completo.',
      ocorridoEm: new Date(),
    })

    const corrigida = await editarAnotacaoSaude(
      ctx,
      anotacao.id,
      'Aceitou o café da manhã por completo, sem ajuda.'
    )

    expect(corrigida.texto).toBe('Aceitou o café da manhã por completo, sem ajuda.')
  })

  it('recusa quem não escreveu, mesmo dentro da janela', async () => {
    const autora = await ctxComPapel('SAUDE')
    const outra = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(autora, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Aceitou o café da manhã por completo.',
      ocorridoEm: new Date(),
    })

    await expect(
      editarAnotacaoSaude(outra, anotacao.id, 'Texto de outra pessoa.')
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa depois da janela expirada', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Aceitou o café da manhã por completo.',
      ocorridoEm: new Date(),
    })

    // Envelhece o registro no banco em vez de esperar quinze minutos.
    await prisma.anotacaoSaude.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })

    await expect(
      editarAnotacaoSaude(ctx, anotacao.id, 'Correção fora do prazo.')
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('retificarAnotacaoSaude', () => {
  it('cria registro novo vinculado e deixa a original intacta', async () => {
    // R3: a original nunca é alterada. É o que faz a trilha valer alguma
    // coisa para quem a lê depois.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const original = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'TARDE',
      texto: 'Recusou o almoço.',
      ocorridoEm: new Date(),
    })

    const retificacao = await retificarAnotacaoSaude(ctx, original.id, {
      texto: 'Recusou o almoço; aceitou a sobremesa.',
    })

    expect(retificacao.retificaAnotacaoSaudeId).toBe(original.id)
    // Herda categoria e turno da original: retificar corrige o que foi
    // escrito, não reclassifica o evento nem muda o turno em que aconteceu.
    expect(retificacao.categoria).toBe('EVOLUCAO')
    expect(retificacao.turno).toBe('TARDE')

    const intacta = await prisma.anotacaoSaude.findUniqueOrThrow({
      where: { id: original.id },
    })
    expect(intacta.texto).toBe('Recusou o almoço.')
  })

  it('não exige autoria nem janela aberta', async () => {
    // Retificar é o caminho que continua aberto depois que a edição fecha, e
    // para qualquer pessoa da equipe: quem entra no turno seguinte precisa
    // poder corrigir o que encontrou errado.
    const autora = await ctxComPapel('SAUDE')
    const outra = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()
    const original = await criarAnotacaoSaude(autora, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Recusou o almoço.',
      ocorridoEm: new Date(),
    })
    await prisma.anotacaoSaude.update({
      where: { id: original.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })

    const retificacao = await retificarAnotacaoSaude(outra, original.id, {
      texto: 'Na verdade recusou apenas a sopa.',
    })

    expect(retificacao.retificaAnotacaoSaudeId).toBe(original.id)
  })
})

describe('listarAnotacoesSaude', () => {
  it('devolve da mais recente para a mais antiga, pelo que ocorreu', async () => {
    // Ordenar por `criadoEm` poria o registro retroativo da madrugada acima
    // do evento da tarde, só porque foi digitado depois.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'TARDE',
      texto: 'Evento da tarde.',
      ocorridoEm: new Date('2026-08-20T15:00:00'),
    })
    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'NOITE',
      texto: 'Evento da madrugada, digitado depois.',
      ocorridoEm: new Date('2026-08-20T03:00:00'),
    })

    const lista = await listarAnotacoesSaude(ctx, residente.id)

    expect(lista.map((a) => a.texto)).toEqual([
      'Evento da tarde.',
      'Evento da madrugada, digitado depois.',
    ])
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarAnotacoesSaude(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
