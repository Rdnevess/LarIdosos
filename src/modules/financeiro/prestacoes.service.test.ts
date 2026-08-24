import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { criarContaBancaria } from './instituicao.service'
import {
  criarOrigemReceita,
  criarCategoriaDespesa,
  criarFornecedor,
} from './cadastros.service'
import { lancarReceita, lancarDespesa } from './lancamentos.service'
import {
  abrirPrestacao,
  calcularSaldoAnterior,
  ajustarSaldoAnterior,
  fecharPrestacao,
  reabrirPrestacao,
  listarPrestacoes,
  registrarObservacoes,
} from './prestacoes.service'

async function cenario(papel: 'COORDENACAO' | 'ADMINISTRATIVO' = 'COORDENACAO') {
  const ctx = await ctxComPapel(papel)
  const conta = await criarContaBancaria(ctx, {
    banco: 'Banco do Brasil',
    agencia: '1234-5',
    numeroConta: '98765-4',
    tipo: 'CORRENTE',
    titular: 'Associação Lar dos Idosos',
    saldoInicial: 15000,
    dataSaldoInicial: new Date('2026-01-01'),
  })
  const origem = await criarOrigemReceita(ctx, { nome: 'Doação' })
  const categoria = await criarCategoriaDespesa(ctx, { nome: 'Energia' })
  const fornecedor = await criarFornecedor(ctx, {
    nome: 'Energisa',
    documento: '11.222.333/0001-81',
    tipoDocumento: 'CNPJ',
  })
  return { ctx, conta, origem, categoria, fornecedor }
}

describe('calcularSaldoAnterior', () => {
  it('na primeira prestação da conta, vem do saldo inicial', async () => {
    const { ctx, conta } = await cenario()
    expect(await calcularSaldoAnterior(ctx, conta.id, 2026, 8)).toBe(15000)
  })

  it('nas seguintes, vem do saldo disponível da anterior fechada', async () => {
    // É o que elimina a recontagem manual: hoje alguém copia o saldo final do
    // mês anterior torcendo para não errar.
    const { ctx, conta, origem } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de julho',
      valor: 1000,
      data: new Date('2026-07-10'),
    })
    const julho = await abrirPrestacao(ctx, conta.id, 2026, 7)
    await fecharPrestacao(ctx, julho.id)

    expect(await calcularSaldoAnterior(ctx, conta.id, 2026, 8)).toBe(16000)
  })

  it('ignora prestação anterior ainda aberta', async () => {
    // Saldo de prestação aberta ainda pode mudar. Herdá-lo daria um saldo
    // inicial que se move sozinho.
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de julho',
      valor: 1000,
      data: new Date('2026-07-10'),
    })
    await abrirPrestacao(ctx, conta.id, 2026, 7)

    expect(await calcularSaldoAnterior(ctx, conta.id, 2026, 8)).toBe(15000)
  })

  it('desconta as despesas do mês anterior', async () => {
    const { ctx, conta, origem, categoria, fornecedor } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de julho',
      valor: 1000,
      data: new Date('2026-07-10'),
    })
    await lancarDespesa(ctx, {
      contaBancariaId: conta.id,
      fornecedorId: fornecedor.id,
      categoriaDespesaId: categoria.id,
      formaPagamento: 'PIX',
      descricao: 'Conta de luz de julho',
      valor: 400,
      data: new Date('2026-07-15'),
    })
    const julho = await abrirPrestacao(ctx, conta.id, 2026, 7)
    await fecharPrestacao(ctx, julho.id)

    expect(await calcularSaldoAnterior(ctx, conta.id, 2026, 8)).toBe(15600)
  })
})

describe('abrirPrestacao', () => {
  it('grava o saldo anterior derivado e nasce ABERTA', async () => {
    const { ctx, conta } = await cenario()

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    expect(prestacao.status).toBe('ABERTA')
    expect(Number(prestacao.saldoAnterior)).toBe(15000)
  })

  it('recusa a segunda prestação da mesma conta e competência', async () => {
    const { ctx, conta } = await cenario()
    await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(abrirPrestacao(ctx, conta.id, 2026, 8)).rejects.toThrow(ErroValidacao)
  })

  it('recusa competência inválida', async () => {
    const { ctx, conta } = await cenario()
    await expect(abrirPrestacao(ctx, conta.id, 2026, 13)).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { conta } = await cenario()
    const ctx = await ctxComPapel('SAUDE')

    await expect(abrirPrestacao(ctx, conta.id, 2026, 8)).rejects.toThrow(ErroPermissao)
  })
})

describe('ajustarSaldoAnterior', () => {
  it('exige justificativa e preserva o valor derivado', async () => {
    // O derivado continua no campo original: a divergência fica registrada ao
    // lado, em vez de ser sobrescrita em silêncio.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(ajustarSaldoAnterior(ctx, prestacao.id, 14800, '')).rejects.toThrow(
      ErroValidacao
    )

    const ajustada = await ajustarSaldoAnterior(
      ctx,
      prestacao.id,
      14800,
      'Tarifa bancária lançada pelo banco fora do extrato de julho'
    )

    expect(Number(ajustada.saldoAnterior)).toBe(15000)
    expect(Number(ajustada.saldoAnteriorAjustado)).toBe(14800)
    expect(ajustada.justificativaAjuste).toContain('Tarifa bancária')
  })

  it('recusa ajuste em prestação já fechada', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    await expect(
      ajustarSaldoAnterior(ctx, prestacao.id, 14800, 'Tentativa fora de hora')
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('fecharPrestacao', () => {
  it('congela os lançamentos REALIZADO da competência, e só eles', async () => {
    // É o que impede um lançamento posterior de mudar, em silêncio, um
    // documento já protocolado no órgão.
    const { ctx, conta, origem } = await cenario()
    const dentro = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de agosto',
      valor: 500,
      data: new Date('2026-08-10'),
    })
    const fora = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de setembro',
      valor: 700,
      data: new Date('2026-09-02'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    const congelado = await prisma.lancamento.findUniqueOrThrow({ where: { id: dentro.id } })
    const solto = await prisma.lancamento.findUniqueOrThrow({ where: { id: fora.id } })

    expect(congelado.prestacaoContasId).toBe(prestacao.id)
    expect(solto.prestacaoContasId).toBeNull()
  })

  it('fecha um mês sem movimento', async () => {
    // Prestação de saldo zero é um fato. Exigir lançamento empurraria alguém a
    // inventar um.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const fechada = await fecharPrestacao(ctx, prestacao.id)
    expect(fechada.status).toBe('FECHADA')
    expect(fechada.fechadaPorId).toBe(ctx.usuarioId)
  })

  it('nega ao papel ADMINISTRATIVO: fechar é ato de coordenação', async () => {
    const { ctx, conta } = await cenario('ADMINISTRATIVO')
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(fecharPrestacao(ctx, prestacao.id)).rejects.toThrow(ErroPermissao)
  })

  it('recusa fechar o que já está fechado', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    await expect(fecharPrestacao(ctx, prestacao.id)).rejects.toThrow(ErroValidacao)
  })
})

describe('reabrirPrestacao', () => {
  it('exige motivo, solta os lançamentos e registra quem reabriu', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de agosto',
      valor: 500,
      data: new Date('2026-08-10'),
    })
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    await expect(reabrirPrestacao(ctx, prestacao.id, '')).rejects.toThrow(ErroValidacao)

    const reaberta = await reabrirPrestacao(
      ctx,
      prestacao.id,
      'Nota fiscal de agosto chegou atrasada'
    )

    expect(reaberta.status).toBe('ABERTA')
    expect(reaberta.motivoReabertura).toContain('atrasada')
    expect(reaberta.reabertaPorId).toBe(ctx.usuarioId)

    const solto = await prisma.lancamento.findUniqueOrThrow({ where: { id: lancamento.id } })
    expect(solto.prestacaoContasId).toBeNull()
  })

  it('leva o motivo para o diff da auditoria', async () => {
    // O documento protocolado não pode mudar em silêncio: a trilha é onde
    // fica o histórico completo, inclusive de reaberturas sucessivas.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)
    await reabrirPrestacao(ctx, prestacao.id, 'Nota fiscal atrasada')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'PrestacaoContas', acao: 'ATUALIZAR', entidadeId: prestacao.id },
      orderBy: { criadoEm: 'desc' },
    })
    expect(JSON.stringify(log.diff)).toContain('Nota fiscal atrasada')
  })

  it('recusa reabrir o que está aberto', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(reabrirPrestacao(ctx, prestacao.id, 'Motivo')).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const { conta } = await cenario('ADMINISTRATIVO')
    const coordenacao = await ctxComPapel('COORDENACAO')
    const prestacao = await abrirPrestacao(coordenacao, conta.id, 2026, 8)
    await fecharPrestacao(coordenacao, prestacao.id)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(reabrirPrestacao(ctx, prestacao.id, 'Motivo qualquer')).rejects.toThrow(
      ErroPermissao
    )
  })
})

describe('listarPrestacoes', () => {
  it('filtra por conta e competência, da mais recente para a mais antiga', async () => {
    const { ctx, conta } = await cenario()
    await abrirPrestacao(ctx, conta.id, 2026, 7)
    await abrirPrestacao(ctx, conta.id, 2026, 8)

    const todas = await listarPrestacoes(ctx, { contaBancariaId: conta.id })
    expect(todas.map((p) => p.mesCompetencia)).toEqual([8, 7])

    const soAgosto = await listarPrestacoes(ctx, { anoCompetencia: 2026, mesCompetencia: 8 })
    expect(soAgosto).toHaveLength(1)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarPrestacoes(ctx, {})).rejects.toThrow(ErroPermissao)
  })
})

describe('registrarObservacoes', () => {
  it('guarda o texto livre que vai ao órgão junto da declaração', async () => {
    // É onde a instituição justifica movimentação incomum do mês: uma doação
    // atípica, uma despesa que não se repete, um valor que salta aos olhos.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const salva = await registrarObservacoes(
      ctx,
      prestacao.id,
      'A despesa com telhado (R$ 12.400,00) é reforma emergencial após o temporal de 12/08.'
    )

    expect(salva.observacoes).toContain('reforma emergencial')
  })

  it('aceita apagar o texto', async () => {
    // Escrito por engano precisa poder sair; string vazia é o estado normal.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await registrarObservacoes(ctx, prestacao.id, 'Texto provisório')

    const limpa = await registrarObservacoes(ctx, prestacao.id, '   ')
    expect(limpa.observacoes).toBe('')
  })

  it('recusa alterar prestação fechada', async () => {
    // O documento já foi protocolado com um texto. Mudá-lo em silêncio faria
    // o arquivo do órgão divergir do sistema.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    await expect(
      registrarObservacoes(ctx, prestacao.id, 'Esqueci de explicar o telhado')
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const saude = await ctxComPapel('SAUDE')

    await expect(registrarObservacoes(saude, prestacao.id, 'Qualquer coisa')).rejects.toThrow(
      ErroPermissao
    )
  })
})
