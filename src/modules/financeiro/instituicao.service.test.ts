import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  salvarConfiguracaoInstituicao,
  obterConfiguracaoInstituicao,
  criarContaBancaria,
  listarContasBancarias,
  desativarContaBancaria,
  type DadosInstituicao,
  type DadosContaBancaria,
} from './instituicao.service'

const dadosInstituicao: DadosInstituicao = {
  razaoSocial: 'Associação Lar dos Idosos',
  cnpj: '11.222.333/0001-81',
  enderecoCompleto: 'Rua das Flores, 100 — Centro',
  cidade: 'Cuiabá',
  uf: 'MT',
  orgaoDestinatario: 'Prefeitura Municipal de Cuiabá/MT',
  nomePresidente: 'Ana Ribeiro',
  nomeTesoureiro: 'Carlos Menezes',
}

const dadosConta: DadosContaBancaria = {
  banco: 'Banco do Brasil',
  agencia: '1234-5',
  numeroConta: '98765-4',
  tipo: 'CORRENTE',
  titular: 'Associação Lar dos Idosos',
  saldoInicial: 15000.5,
  dataSaldoInicial: new Date('2026-01-01'),
}

describe('salvarConfiguracaoInstituicao', () => {
  it('cria na primeira vez e atualiza nas seguintes', async () => {
    // Registro único: sem esta regra, duas configurações coexistiriam e a
    // exportação escolheria uma sem critério.
    const ctx = await ctxComPapel('COORDENACAO')

    await salvarConfiguracaoInstituicao(ctx, dadosInstituicao)
    await salvarConfiguracaoInstituicao(ctx, {
      ...dadosInstituicao,
      nomeTesoureiro: 'Outro Tesoureiro',
    })

    expect(await prisma.configuracaoInstituicao.count()).toBe(1)

    const config = await obterConfiguracaoInstituicao(ctx)
    expect(config?.nomeTesoureiro).toBe('Outro Tesoureiro')
  })

  it('normaliza o CNPJ para dígitos', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    const config = await salvarConfiguracaoInstituicao(ctx, dadosInstituicao)
    expect(config.cnpj).toBe('11222333000181')
  })

  it('recusa CNPJ com dígito verificador inválido', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    await expect(
      salvarConfiguracaoInstituicao(ctx, { ...dadosInstituicao, cnpj: '11.222.333/0001-00' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    // A fronteira espelhada da 2A: lá o administrativo não vê prontuário;
    // aqui a saúde não vê dinheiro.
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      salvarConfiguracaoInstituicao(ctx, dadosInstituicao)
    ).rejects.toThrow(ErroPermissao)
  })

  it('devolve null antes de qualquer configuração', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    expect(await obterConfiguracaoInstituicao(ctx)).toBeNull()
  })
})

describe('criarContaBancaria', () => {
  it('grava o saldo inicial como Decimal e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const conta = await criarContaBancaria(ctx, dadosConta)

    // `Decimal` não é número em JavaScript: comparar direto dá falso negativo
    // silencioso, o mesmo cuidado que `calcularDiff` toma com `beneficioValor`.
    expect(Number(conta.saldoInicial)).toBe(15000.5)
    expect(conta.ativa).toBe(true)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'ContaBancaria', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(conta.id)
  })

  it('aceita saldo inicial negativo', async () => {
    // Conta no vermelho é um fato, e recusá-lo obrigaria a instituição a
    // mentir no cadastro para conseguir usar o sistema.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const conta = await criarContaBancaria(ctx, { ...dadosConta, saldoInicial: -320.4 })
    expect(Number(conta.saldoInicial)).toBe(-320.4)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(criarContaBancaria(ctx, dadosConta)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarContasBancarias', () => {
  it('traz só as ativas, e a desativada sai da lista sem ser apagada', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const antiga = await criarContaBancaria(ctx, { ...dadosConta, numeroConta: '11111-1' })
    await criarContaBancaria(ctx, { ...dadosConta, numeroConta: '22222-2' })
    await desativarContaBancaria(ctx, antiga.id)

    const lista = await listarContasBancarias(ctx)
    expect(lista.map((c) => c.numeroConta)).toEqual(['22222-2'])

    // Exclusão é lógica: a conta some da lista, mas os lançamentos dela
    // continuam no histórico e nas prestações já entregues.
    expect(await prisma.contaBancaria.count()).toBe(2)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarContasBancarias(ctx)).rejects.toThrow(ErroPermissao)
  })
})
