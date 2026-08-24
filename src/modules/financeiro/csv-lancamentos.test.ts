import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { criarContaBancaria } from './instituicao.service'
import { criarOrigemReceita, criarCategoriaDespesa, criarFornecedor } from './cadastros.service'
import { lancarReceita, lancarDespesa } from './lancamentos.service'
import { gerarCsvLancamentos } from './csv-lancamentos'

async function cenario() {
  const ctx = await ctxComPapel('ADMINISTRATIVO')

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

describe('gerarCsvLancamentos', () => {
  it('escreve cabeçalho e uma linha por lançamento, com ponto e vírgula', async () => {
    // Ponto e vírgula, e não vírgula: o Excel em português usa a vírgula como
    // separador decimal, e um CSV com vírgula abre tudo numa coluna só.
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 1234.56,
      data: new Date('2026-08-10'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })
    const linhas = csv.trim().split('\n')

    expect(linhas[0]).toContain('Data;Natureza;Descrição')
    expect(linhas[1]).toContain('10/08/2026')
    expect(linhas[1]).toContain('1234,56')
  })

  it('escapa o ponto e vírgula que aparecer na descrição', async () => {
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação; com ponto e vírgula',
      valor: 100,
      data: new Date('2026-08-10'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })
    expect(csv).toContain('"Doação; com ponto e vírgula"')
  })

  it('escapa a aspa dobrando-a, como manda o formato', async () => {
    // Sem isto, uma descrição com aspas quebra o campo e desloca todas as
    // colunas seguintes da linha.
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação da "Turma do Bem"',
      valor: 100,
      data: new Date('2026-08-10'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })
    expect(csv).toContain('"Doação da ""Turma do Bem"""')
  })

  it('começa com BOM, para o Excel não comer os acentos', async () => {
    // Sem o BOM, o Excel em Windows lê o arquivo como ANSI e "Doação" vira
    // "DoaÃ§Ã£o" — o contador recebe um arquivo ilegível.
    const { ctx, conta } = await cenario()
    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })

    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('traz o fornecedor e a categoria da despesa', async () => {
    const { ctx, conta, categoria, fornecedor } = await cenario()
    await lancarDespesa(ctx, {
      contaBancariaId: conta.id,
      fornecedorId: fornecedor.id,
      categoriaDespesaId: categoria.id,
      formaPagamento: 'PIX',
      descricao: 'Conta de luz',
      valor: 800,
      data: new Date('2026-08-15'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })

    expect(csv).toContain('Energisa')
    expect(csv).toContain('Energia')
    expect(csv).toContain('Despesa')
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(gerarCsvLancamentos(ctx, {})).rejects.toThrow(ErroPermissao)
  })
})
