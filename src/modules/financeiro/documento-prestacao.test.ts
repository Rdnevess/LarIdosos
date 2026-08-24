import { describe, it, expect } from 'vitest'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { criarContaBancaria, salvarConfiguracaoInstituicao } from './instituicao.service'
import {
  criarOrigemReceita,
  criarCategoriaDespesa,
  criarFornecedor,
} from './cadastros.service'
import { lancarReceita, lancarDespesa, cancelarLancamento } from './lancamentos.service'
import { abrirPrestacao, ajustarSaldoAnterior, fecharPrestacao, reabrirPrestacao } from './prestacoes.service'
import { montarDocumentoPrestacao } from './documento-prestacao'

async function cenario({ comInstituicao = true } = {}) {
  const ctx = await ctxComPapel('COORDENACAO')

  if (comInstituicao) {
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
  }

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

describe('montarDocumentoPrestacao', () => {
  it('agrupa receitas pelo rótulo da prestação, não pelo nome interno', async () => {
    // O ponto do desenho: a contribuição sai como "Doação", somando com as
    // demais. Nenhum nome de idoso entra na prestação.
    const { ctx, conta } = await cenario()
    const doacao = await criarOrigemReceita(ctx, { nome: 'Doação avulsa', rotuloPrestacao: 'Doação' })
    const contribuicao = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: doacao.id,
      descricao: 'Doação avulsa',
      valor: 300,
      data: new Date('2026-08-05'),
    })
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: contribuicao.id,
      residenteId: residente.id,
      descricao: 'Contribuição de agosto',
      valor: 988.4,
      data: new Date('2026-08-05'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.recebimentosPorOrigem).toEqual([
      { rotulo: 'Doação', valor: 1288.4 },
    ])
    // E nenhum nome de residente em lugar nenhum do documento.
    expect(JSON.stringify(documento)).not.toContain('Maria das Dores')
  })

  it('calcula o saldo disponível a partir do saldo anterior', async () => {
    const { ctx, conta, origem, categoria, fornecedor } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 2000,
      data: new Date('2026-08-05'),
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

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.saldoAnterior).toBe(15000)
    expect(documento.conciliacao.totalReceitas).toBe(2000)
    expect(documento.conciliacao.totalDespesas).toBe(800)
    expect(documento.conciliacao.saldoDisponivel).toBe(16200)
  })

  it('usa o saldo ajustado quando existe, e leva a justificativa às observações', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await ajustarSaldoAnterior(ctx, prestacao.id, 14800, 'Tarifa fora do extrato de julho')

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.saldoAnterior).toBe(14800)
    expect(documento.encerramento.observacoes).toContain('Tarifa fora do extrato')
  })

  it('leva o motivo da reabertura às observações do documento regerado', async () => {
    // O documento protocolado não muda em silêncio: quem o gerar de novo lê,
    // no próprio papel, que ele foi reaberto e por quê.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)
    await reabrirPrestacao(ctx, prestacao.id, 'Nota fiscal de agosto chegou atrasada')

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)
    expect(documento.encerramento.observacoes).toContain('chegou atrasada')
  })

  it('numera os itens em sequência, a partir de 1', async () => {
    const { ctx, conta, origem } = await cenario()
    for (const valor of [100, 200, 300]) {
      await lancarReceita(ctx, {
        contaBancariaId: conta.id,
        origemReceitaId: origem.id,
        descricao: `Doação de ${valor}`,
        valor,
        data: new Date('2026-08-05'),
      })
    }

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas.map((r) => r.item)).toEqual([1, 2, 3])
  })

  it('não inclui lançamento cancelado', async () => {
    const { ctx, conta, origem } = await cenario()
    const cancelado = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação duplicada',
      valor: 999,
      data: new Date('2026-08-05'),
    })
    await cancelarLancamento(ctx, cancelado.id, 'Lançado em duplicidade')

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas).toHaveLength(0)
    expect(documento.conciliacao.totalReceitas).toBe(0)
  })

  it('escreve o mês por extenso, em português', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.capa.mesPorExtenso).toBe('agosto')
    expect(documento.capa.ano).toBe(2026)
    expect(documento.oficio.periodo).toBe('agosto de 2026')
  })

  it('escreve a declaração com a conta e a competência do documento', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.encerramento.declaracao).toContain('Conta Corrente 98765-4')
    expect(documento.encerramento.declaracao).toContain('mês de agosto de 2026')
    expect(documento.encerramento.declaracao).not.toContain('Instrução para Claude')
  })

  it('traz a categoria na conciliação, e não na folha de despesas', async () => {
    // O modelo do órgão é assim: a aba 3 tem credor, documento, forma e
    // valor; a categoria aparece só no demonstrativo da conciliação.
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

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.despesas[0]).not.toHaveProperty('categoria')
    expect(documento.conciliacao.despesasDetalhadas).toEqual([
      { credor: 'Energisa', categoria: 'Energia', valor: 800 },
    ])
  })

  it('recusa montar sem a configuração da instituição', async () => {
    // A capa, o ofício e as assinaturas saem dela. Sem ela o documento sairia
    // com lacunas onde deveria haver razão social e CNPJ.
    const { ctx, conta } = await cenario({ comInstituicao: false })
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(montarDocumentoPrestacao(ctx, prestacao.id)).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const saude = await ctxComPapel('SAUDE')

    await expect(montarDocumentoPrestacao(saude, prestacao.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('limites da competência', () => {
  it('inclui o lançamento do primeiro e do último dia do mês', async () => {
    // Coluna `@db.Date`: o Prisma devolve meia-noite UTC. Um limite construído
    // em hora local vira 03:00Z no Brasil, e o dia 1 — que está em 00:00Z —
    // fica de fora. O mês inteiro fecha sem ele, e a prestação não bate com o
    // extrato por um lançamento que ninguém consegue achar.
    const { ctx, conta, origem } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação do dia 1',
      valor: 100,
      data: new Date('2026-08-01'),
    })
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação do dia 31',
      valor: 200,
      data: new Date('2026-08-31'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas).toHaveLength(2)
    expect(documento.conciliacao.totalReceitas).toBe(300)
  })

  it('não puxa o lançamento do mês seguinte', async () => {
    const { ctx, conta, origem } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de setembro',
      valor: 500,
      data: new Date('2026-09-01'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas).toHaveLength(0)
  })
})
