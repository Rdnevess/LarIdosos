import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { criarContaBancaria, salvarConfiguracaoInstituicao } from './instituicao.service'
import { abrirPrestacao } from './prestacoes.service'
import { exportarPrestacao } from './exportar'

async function cenario() {
  const ctx = await ctxComPapel('COORDENACAO')

  await salvarConfiguracaoInstituicao(ctx, {
    razaoSocial: 'Associação Lar dos Idosos',
    cnpj: '11.222.333/0001-81',
    enderecoCompleto: 'Rua das Flores, 100 — Centro',
    cidade: 'Cuiabá',
    uf: 'MT',
    orgaoDestinatario: 'Prefeitura Municipal de Cuiabá/MT',
    nomePresidente: 'Ana Ribeiro',
    nomeTesoureiro: 'Carlos Menezes',
  })

  const conta = await criarContaBancaria(ctx, {
    banco: 'Banco do Brasil',
    agencia: '1234-5',
    numeroConta: '98765-4',
    tipo: 'CORRENTE',
    titular: 'Associação Lar dos Idosos',
    saldoInicial: 15000,
    dataSaldoInicial: new Date('2026-01-01'),
  })

  return { ctx, conta }
}

describe('exportarPrestacao', () => {
  it('gera o .xlsx com nome de arquivo que diz conta e competência', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const { buffer, nomeArquivo, mimeType } = await exportarPrestacao(ctx, prestacao.id, 'xlsx')

    expect(nomeArquivo).toBe('prestacao-98765-4-2026-08.xlsx')
    expect(mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('gera o PDF, com a mesma competência no nome', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 12)

    const { buffer, nomeArquivo, mimeType } = await exportarPrestacao(ctx, prestacao.id, 'pdf')

    expect(nomeArquivo).toBe('prestacao-98765-4-2026-12.pdf')
    expect(mimeType).toBe('application/pdf')
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('audita EXPORTAR, com o formato no diff', async () => {
    // A ação existe no enum desde a Fase 1 e nunca tinha sido usada. É o
    // registro de que um documento saiu do sistema, com quem o gerou.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await exportarPrestacao(ctx, prestacao.id, 'pdf')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'PrestacaoContas', acao: 'EXPORTAR', entidadeId: prestacao.id },
    })
    expect(JSON.stringify(log.diff)).toContain('pdf')
  })

  it('nega ao papel SAUDE', async () => {
    const { conta } = await cenario()
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const prestacao = await abrirPrestacao(admin, conta.id, 2026, 8)
    const ctx = await ctxComPapel('SAUDE')

    await expect(exportarPrestacao(ctx, prestacao.id, 'xlsx')).rejects.toThrow(ErroPermissao)
  })

  it('não deixa o nome do arquivo escapar da pasta', async () => {
    // O número da conta é digitado por gente e vai para o `Content-Disposition`.
    // Uma conta chamada "../../etc/passwd" não pode virar caminho.
    const ctx = await ctxComPapel('COORDENACAO')
    await salvarConfiguracaoInstituicao(ctx, {
      razaoSocial: 'Associação Lar dos Idosos',
      cnpj: '11.222.333/0001-81',
      enderecoCompleto: 'Rua das Flores, 100',
      cidade: 'Cuiabá',
      uf: 'MT',
      orgaoDestinatario: 'Prefeitura Municipal de Cuiabá/MT',
      nomePresidente: 'Ana Ribeiro',
      nomeTesoureiro: 'Carlos Menezes',
    })
    const conta = await criarContaBancaria(ctx, {
      banco: 'Banco do Brasil',
      agencia: '1234-5',
      numeroConta: '../../etc/passwd',
      tipo: 'CORRENTE',
      titular: 'Associação Lar dos Idosos',
      saldoInicial: 0,
      dataSaldoInicial: new Date('2026-01-01'),
    })
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const { nomeArquivo } = await exportarPrestacao(ctx, prestacao.id, 'pdf')

    expect(nomeArquivo).not.toContain('/')
    expect(nomeArquivo).not.toContain('..')
    expect(nomeArquivo.endsWith('.pdf')).toBe(true)
  })
})
