import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import type { Ctx } from '@/lib/contexto'
import { criarContaBancaria } from './instituicao.service'
import {
  criarOrigemReceita,
  criarCategoriaDespesa,
  criarFornecedor,
} from './cadastros.service'
import {
  lancarReceita,
  lancarDespesa,
  cancelarLancamento,
  conciliarLancamento,
  listarLancamentos,
} from './lancamentos.service'

async function cenario(papel: 'COORDENACAO' | 'ADMINISTRATIVO' = 'ADMINISTRATIVO') {
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

function receitaBase(conta: string, origem: string) {
  return {
    contaBancariaId: conta,
    origemReceitaId: origem,
    descricao: 'Doação avulsa',
    valor: 250,
    data: new Date('2026-08-10'),
  }
}

describe('lancarReceita', () => {
  it('grava com origem e audita', async () => {
    const { ctx, conta, origem } = await cenario()

    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))

    expect(lancamento.natureza).toBe('RECEITA')
    expect(lancamento.status).toBe('REALIZADO')
    expect(Number(lancamento.valor)).toBe(250)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Lancamento', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(lancamento.id)
  })

  it('exige residente quando a origem exige', async () => {
    // A origem "Contribuição de residente" tem `exigeResidente`: sem o
    // vínculo, o extrato individual não fecharia e ninguém perceberia.
    const { ctx, conta } = await cenario()
    const origem = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })

    await expect(
      lancarReceita(ctx, {
        ...receitaBase(conta.id, origem.id),
        descricao: 'Contribuição de agosto',
      })
    ).rejects.toThrow(ErroValidacao)

    const residente = await criarResidenteDeTeste()
    const comResidente = await lancarReceita(ctx, {
      ...receitaBase(conta.id, origem.id),
      descricao: 'Contribuição de agosto',
      residenteId: residente.id,
    })
    expect(comResidente.residenteId).toBe(residente.id)
  })

  it('recusa valor zero ou negativo', async () => {
    // Lançamento de valor zero não move dinheiro nenhum, e valor negativo é
    // despesa disfarçada de receita — as duas coisas sujam o total sem dizer
    // o que aconteceu.
    const { ctx, conta, origem } = await cenario()

    await expect(
      lancarReceita(ctx, { ...receitaBase(conta.id, origem.id), valor: 0 })
    ).rejects.toThrow(ErroValidacao)

    await expect(
      lancarReceita(ctx, { ...receitaBase(conta.id, origem.id), valor: -50 })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { conta, origem } = await cenario()
    const ctx = await ctxComPapel('SAUDE')

    await expect(lancarReceita(ctx, receitaBase(conta.id, origem.id))).rejects.toThrow(
      ErroPermissao
    )
  })
})

describe('lancarDespesa', () => {
  it('grava com fornecedor, categoria e forma de pagamento', async () => {
    // As três aparecem no documento entregue ao órgão: credor e CNPJ na aba
    // de despesas, categoria na conciliação, forma de pagamento na coluna
    // CH/OB.
    const { ctx, conta, categoria, fornecedor } = await cenario()

    const despesa = await lancarDespesa(ctx, {
      contaBancariaId: conta.id,
      fornecedorId: fornecedor.id,
      categoriaDespesaId: categoria.id,
      formaPagamento: 'PIX',
      descricao: 'Conta de luz de agosto',
      valor: 800,
      data: new Date('2026-08-15'),
    })

    expect(despesa.natureza).toBe('DESPESA')
    expect(despesa.formaPagamento).toBe('PIX')
  })

  it('recusa despesa sem categoria', async () => {
    // A categoria aparece só na conciliação, e faltando ela a prestação sai
    // incompleta — o defeito só apareceria na hora de entregar.
    const { ctx, conta, fornecedor } = await cenario()

    await expect(
      lancarDespesa(ctx, {
        contaBancariaId: conta.id,
        fornecedorId: fornecedor.id,
        formaPagamento: 'PIX',
        descricao: 'Conta de luz',
        valor: 800,
        data: new Date('2026-08-15'),
      } as never)
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { conta, categoria, fornecedor } = await cenario()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      lancarDespesa(ctx, {
        contaBancariaId: conta.id,
        fornecedorId: fornecedor.id,
        categoriaDespesaId: categoria.id,
        formaPagamento: 'PIX',
        descricao: 'Conta de luz',
        valor: 800,
        data: new Date('2026-08-15'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('conciliarLancamento', () => {
  it('marca como conciliado, com a data', async () => {
    // A conciliação é manual, contra o extrato do banco. Sem a data, ninguém
    // sabe se a conferência é de ontem ou de três meses atrás.
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))

    const conciliado = await conciliarLancamento(ctx, lancamento.id)

    expect(conciliado.conciliado).toBe(true)
    expect(conciliado.conciliadoEm).not.toBeNull()
  })

  it('nega ao papel SAUDE', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))
    const saude = await ctxComPapel('SAUDE')

    await expect(conciliarLancamento(saude, lancamento.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('cancelarLancamento', () => {
  it('não apaga: marca CANCELADO com motivo e audita', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))

    const cancelado = await cancelarLancamento(ctx, lancamento.id, 'Lançado em duplicidade')

    expect(cancelado.status).toBe('CANCELADO')
    expect(cancelado.motivoCancelamento).toBe('Lançado em duplicidade')
    expect(await prisma.lancamento.count()).toBe(1)
  })

  it('exige motivo', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))

    await expect(cancelarLancamento(ctx, lancamento.id, '')).rejects.toThrow(ErroValidacao)
  })

  it('recusa cancelar lançamento já congelado em prestação fechada', async () => {
    // É o congelamento: um lançamento que já foi ao órgão não muda sem a
    // prestação ser reaberta.
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, receitaBase(conta.id, origem.id))

    const prestacao = await prisma.prestacaoContas.create({
      data: {
        contaBancariaId: conta.id,
        mesCompetencia: 8,
        anoCompetencia: 2026,
        saldoAnterior: 15000,
        status: 'FECHADA',
        fechadaEm: new Date(),
      },
    })
    await prisma.lancamento.update({
      where: { id: lancamento.id },
      data: { prestacaoContasId: prestacao.id },
    })

    await expect(
      cancelarLancamento(ctx, lancamento.id, 'Tentativa de mexer no que já foi')
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('listarLancamentos', () => {
  it('filtra por conta, período e natureza', async () => {
    const { ctx, conta, origem, categoria, fornecedor } = await cenario()

    await lancarReceita(ctx, receitaBase(conta.id, origem.id))
    await lancarReceita(ctx, {
      ...receitaBase(conta.id, origem.id),
      descricao: 'Doação de setembro',
      data: new Date('2026-09-10'),
    })
    await lancarDespesa(ctx, {
      contaBancariaId: conta.id,
      fornecedorId: fornecedor.id,
      categoriaDespesaId: categoria.id,
      formaPagamento: 'PIX',
      descricao: 'Conta de luz',
      valor: 800,
      data: new Date('2026-08-15'),
    })

    const agosto = await listarLancamentos(ctx, {
      contaBancariaId: conta.id,
      de: new Date('2026-08-01'),
      ate: new Date('2026-08-31'),
    })
    expect(agosto).toHaveLength(2)

    const receitasDeAgosto = await listarLancamentos(ctx, {
      contaBancariaId: conta.id,
      de: new Date('2026-08-01'),
      ate: new Date('2026-08-31'),
      natureza: 'RECEITA',
    })
    expect(receitasDeAgosto).toHaveLength(1)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarLancamentos(ctx, {})).rejects.toThrow(ErroPermissao)
  })
})
