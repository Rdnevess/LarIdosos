import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { registrosDeNegacaoPendentes } from '@/modules/audit/acesso-negado'
import { criarContaBancaria } from './instituicao.service'
import { criarCategoriaDespesa, criarFornecedor, criarOrigemReceita } from './cadastros.service'
import { lancarDespesa, lancarReceita } from './lancamentos.service'
import { abrirPrestacao } from './prestacoes.service'
import { anexarComprovante, removerComprovante } from './anexos.service'

const PDF = Buffer.from('%PDF-1.4 nota')
const arquivo = { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: PDF }

/**
 * Monta ctx + conta + categoria + fornecedor + origem, na forma de
 * `lancamentos.service.test.ts`, e abre uma prestação `ABERTA` própria — o
 * isolamento por teste de `exportar.test.ts`, em vez de um `beforeEach`
 * global que faria um teste enxergar mutação de outro.
 *
 * A despesa sai com `prestacaoContasId` já apontando para a prestação aberta,
 * do mesmo jeito direto que `lancamentos.service.test.ts` usa para simular o
 * congelamento — `lancarDespesa` só grava esse vínculo no fechamento de
 * verdade (`fecharPrestacao`).
 */
async function cenario() {
  const ctx = await ctxComPapel('COORDENACAO')
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

  const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

  const despesa = await lancarDespesa(ctx, {
    contaBancariaId: conta.id,
    fornecedorId: fornecedor.id,
    categoriaDespesaId: categoria.id,
    formaPagamento: 'PIX',
    descricao: 'Conta de luz de agosto',
    valor: 800,
    data: new Date('2026-08-15'),
  })
  await prisma.lancamento.update({
    where: { id: despesa.id },
    data: { prestacaoContasId: prestacao.id },
  })

  const receita = await lancarReceita(ctx, {
    contaBancariaId: conta.id,
    origemReceitaId: origem.id,
    descricao: 'Doação avulsa',
    valor: 250,
    data: new Date('2026-08-10'),
  })

  return {
    ctx,
    prestacaoId: prestacao.id,
    despesaId: despesa.id,
    receitaId: receita.id,
  }
}

describe('anexarComprovante', () => {
  it('anexa o documento fiscal a uma despesa', async () => {
    const { ctx, despesaId } = await cenario()

    const documento = await anexarComprovante(
      ctx,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      arquivo
    )

    expect(documento.tipo).toBe('COMPROVANTE_FISCAL')
    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.documentoFiscalId).toBe(documento.id)
  })

  it('anexa o comprovante de pagamento no campo separado', async () => {
    // Dois campos, e nao um: e o que faz o apendice saber qual e qual sem
    // depender de ninguem ter escrito no nome do arquivo.
    const { ctx, despesaId } = await cenario()

    const documento = await anexarComprovante(
      ctx,
      { tipo: 'DESPESA_COMPROVANTE', lancamentoId: despesaId },
      arquivo
    )

    expect(documento.tipo).toBe('COMPROVANTE_PAGAMENTO')
    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.comprovantePagamentoId).toBe(documento.id)
    expect(lancamento.documentoFiscalId).toBeNull()
  })

  it('anexa o extrato a prestacao', async () => {
    const { ctx, prestacaoId } = await cenario()

    const documento = await anexarComprovante(ctx, { tipo: 'EXTRATO', prestacaoId }, arquivo)

    expect(documento.tipo).toBe('EXTRATO_BANCARIO')
    const prestacao = await prisma.prestacaoContas.findUniqueOrThrow({
      where: { id: prestacaoId },
    })
    expect(prestacao.extratoId).toBe(documento.id)
  })

  it('recusa anexar a uma receita', async () => {
    // "Para todas as despesas e apenas despesas". A tabela `lancamentos` guarda
    // as duas naturezas, entao a regra e do servico.
    const { ctx, receitaId } = await cenario()

    await expect(
      anexarComprovante(ctx, { tipo: 'DESPESA_FISCAL', lancamentoId: receitaId }, arquivo)
    ).rejects.toThrow('Nota fiscal e comprovante de pagamento são só de despesa.')
  })

  it('recusa arquivo que nao seja PDF', async () => {
    const { ctx, despesaId } = await cenario()

    await expect(
      anexarComprovante(
        ctx,
        { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
        { ...arquivo, nomeArquivoOriginal: 'foto.jpg', mimeType: 'image/jpeg' }
      )
    ).rejects.toThrow('Envie o arquivo em PDF.')

    // A recusa e antes de gravar: nenhum documento deveria ter sido criado.
    expect(await prisma.documento.count()).toBe(0)
  })

  it('recusa com a prestacao fechada', async () => {
    // Uma regra so: fechar congela o documento entregue ao orgao, e anexo faz
    // parte dele. Se precisar mudar depois, a reabertura ja existe e imprime o
    // motivo.
    const { ctx, prestacaoId } = await cenario()
    await prisma.prestacaoContas.update({
      where: { id: prestacaoId },
      data: { status: 'FECHADA' },
    })

    await expect(
      anexarComprovante(ctx, { tipo: 'EXTRATO', prestacaoId }, arquivo)
    ).rejects.toThrow('Esta prestação está fechada. Reabra-a antes de mexer nos anexos.')
  })

  it('recusa o papel SAUDE, e a recusa fica na trilha', async () => {
    const { despesaId } = await cenario()
    const saude = await ctxComPapel('SAUDE')

    await expect(
      anexarComprovante(saude, { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId }, arquivo)
    ).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const negado = await prisma.logAuditoria.findFirst({
      where: { acao: 'ACESSO_NEGADO', usuarioId: saude.usuarioId },
      orderBy: { criadoEm: 'desc' },
    })
    expect(negado).not.toBeNull()
    expect(negado?.entidade).toBe('Lancamento')

    // E a recusa nao gravou nada: nem documento, nem campo ligado.
    expect(await prisma.documento.count()).toBe(0)
  })
})

describe('removerComprovante', () => {
  it('desliga o campo e deixa o documento no banco', async () => {
    // Exclusao logica, como no resto do sistema: o arquivo continua no disco e
    // o registro continua no banco. Trocar um anexo nao apaga o anterior.
    const { ctx, despesaId } = await cenario()
    const documento = await anexarComprovante(
      ctx,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      arquivo
    )

    await removerComprovante(ctx, { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId })

    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.documentoFiscalId).toBeNull()
    expect(await prisma.documento.findUnique({ where: { id: documento.id } })).not.toBeNull()
  })

  it('recusa remover com a prestacao fechada', async () => {
    const { ctx, prestacaoId } = await cenario()
    await anexarComprovante(ctx, { tipo: 'EXTRATO', prestacaoId }, arquivo)
    await prisma.prestacaoContas.update({
      where: { id: prestacaoId },
      data: { status: 'FECHADA' },
    })

    await expect(
      removerComprovante(ctx, { tipo: 'EXTRATO', prestacaoId })
    ).rejects.toThrow('Esta prestação está fechada. Reabra-a antes de mexer nos anexos.')

    // O extrato continua ligado: a recusa nao desfez o anexo anterior.
    const prestacao = await prisma.prestacaoContas.findUniqueOrThrow({
      where: { id: prestacaoId },
    })
    expect(prestacao.extratoId).not.toBeNull()
  })
})
