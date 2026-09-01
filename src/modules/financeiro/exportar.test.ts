import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { criarContaBancaria, salvarConfiguracaoInstituicao } from './instituicao.service'
import { criarCategoriaDespesa, criarFornecedor, criarOrigemReceita } from './cadastros.service'
import { lancarDespesa, lancarReceita } from './lancamentos.service'
import { abrirPrestacao } from './prestacoes.service'
import { exportarPrestacao } from './exportar'
import { anexarComprovante } from './anexos.service'

/** Um PDF de verdade com o número de páginas e a largura pedidas. */
async function pdfCom(paginas: number, largura = 200): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) doc.addPage([largura, 200])
  return Buffer.from(await doc.save())
}

/**
 * As larguras das páginas, na ordem em que aparecem no documento — o mesmo
 * padrão de `anexos-prestacao.test.ts`: contar o total não prova ordem,
 * porque inverter os anexos entre si preserva a contagem e passaria
 * despercebido. Larguras diferentes por anexo tornam a sequência
 * reconhecível de verdade.
 */
async function largurasDe(buffer: Buffer): Promise<number[]> {
  const doc = await PDFDocument.load(buffer)
  return doc.getPages().map((pagina) => pagina.getWidth())
}

async function reabrirXlsx(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  // O `exceljs` embute uma versão antiga de `@types/node`, e o `Buffer` dele
  // não é o `Buffer<ArrayBufferLike>` deste projeto. O dado é o mesmo.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
  return wb
}

/**
 * `cenario()` mais categoria, fornecedor e uma prestação já aberta com duas
 * despesas `REALIZADO` ligadas a ela — na mesma forma direta que
 * `anexos.service.test.ts` usa para simular o congelamento, já que
 * `lancarDespesa` só grava `prestacaoContasId` no fechamento de verdade
 * (`fecharPrestacao`).
 *
 * Preparo próprio por teste, e não estado de módulo: é a forma que este
 * arquivo já usa, e evita um teste enxergar mutação de outro.
 */
async function cenarioComDespesas() {
  const { ctx, conta } = await cenario()
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

  const outraDespesa = await lancarDespesa(ctx, {
    contaBancariaId: conta.id,
    fornecedorId: fornecedor.id,
    categoriaDespesaId: categoria.id,
    formaPagamento: 'PIX',
    descricao: 'Manutenção do gerador',
    valor: 400,
    data: new Date('2026-08-20'),
  })
  await prisma.lancamento.update({
    where: { id: outraDespesa.id },
    data: { prestacaoContasId: prestacao.id },
  })

  return {
    ctx,
    prestacaoId: prestacao.id,
    despesaId: despesa.id,
    outraDespesaId: outraDespesa.id,
  }
}

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

  it('gera o CSV da competência, para o contador', async () => {
    // Mesma competência, terceiro formato. O contador não usa o sistema: ele
    // recebe um arquivo e importa.
    const { ctx, conta } = await cenario()
    const origem = await criarOrigemReceita(ctx, { nome: 'Doação' })
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de agosto',
      valor: 2000,
      data: new Date('2026-08-05'),
    })
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const { buffer, nomeArquivo, mimeType } = await exportarPrestacao(ctx, prestacao.id, 'csv')

    expect(nomeArquivo).toBe('prestacao-98765-4-2026-08.csv')
    expect(mimeType).toContain('text/csv')
    expect(buffer.toString('utf8')).toContain('05/08/2026;Receita;Doação de agosto;2000,00')
  })

  it('não leva ao CSV o lançamento de outra competência', async () => {
    const { ctx, conta } = await cenario()
    const origem = await criarOrigemReceita(ctx, { nome: 'Doação' })
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de setembro',
      valor: 999,
      data: new Date('2026-09-05'),
    })
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const { buffer } = await exportarPrestacao(ctx, prestacao.id, 'csv')
    expect(buffer.toString('utf8')).not.toContain('Doação de setembro')
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

  it('o apendice mantem a ordem certa: nota e comprovante da mesma despesa, o apendice entre despesas, e o extrato por ultimo', async () => {
    // A ordem do apendice e a mesma da folha 3-Despesas — `data` crescente, `id`
    // como desempate — e dentro de cada despesa, nota antes do comprovante.
    // Contar o total nao prova isso: o extrato colado antes da nota, ou os
    // anexos embaralhados entre despesas, dariam a mesma contagem e passariam
    // despercebidos. Por isso cada anexo aqui tem uma largura diferente, e a
    // sequencia inteira e conferida — inclusive com DUAS despesas com anexo ao
    // mesmo tempo, para que inverter a ordem de `despesas` no laço de
    // `anexosDaPrestacao` (`exportar.ts`) reprove este teste. `despesaId` e de
    // 15/08 e `outraDespesaId` e de 20/08 (`cenarioComDespesas`) — a primeira
    // vem antes no apendice.
    const { ctx: coordenacao, prestacaoId, despesaId, outraDespesaId } = await cenarioComDespesas()

    const semAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')
    const antes = (await PDFDocument.load(semAnexo.buffer)).getPageCount()

    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1, 300) }
    )
    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_COMPROVANTE', lancamentoId: despesaId },
      { nomeArquivoOriginal: 'pago.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1, 400) }
    )
    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: outraDespesaId },
      { nomeArquivoOriginal: 'nota-gerador.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1, 600) }
    )
    await anexarComprovante(
      coordenacao,
      { tipo: 'EXTRATO', prestacaoId },
      { nomeArquivoOriginal: 'extrato.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1, 500) }
    )

    const comAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')
    const larguras = await largurasDe(comAnexo.buffer)

    expect(larguras).toHaveLength(antes + 4)
    // As seis folhas do modelo continuam intactas antes do apendice; so a
    // sequencia dos quatro anexos importa aqui: nota e comprovante de
    // `despesaId` (15/08), a nota de `outraDespesaId` (20/08), e o extrato.
    expect(larguras.slice(antes)).toEqual([300, 400, 600, 500])
  })

  it('despesa sem anexo e pulada, e a seguinte nao sai do lugar', async () => {
    // O caso mais comum de todos: metade das despesas com nota e metade sem. A
    // que tem entra; a que nao tem nao empurra nada, nao deixa pagina em branco
    // e nao desloca a proxima.
    const { ctx: coordenacao, prestacaoId, outraDespesaId } = await cenarioComDespesas()

    const soASegunda = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')
    const antes = (await PDFDocument.load(soASegunda.buffer)).getPageCount()

    // `outraDespesaId` fica sem anexo nenhum, de proposito.
    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_COMPROVANTE', lancamentoId: outraDespesaId },
      { nomeArquivoOriginal: 'pago.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1) }
    )

    const comAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')

    expect((await PDFDocument.load(comAnexo.buffer)).getPageCount()).toBe(antes + 1)
  })

  it('o xlsx e o csv nao ganham anexo nenhum', async () => {
    // "So o PDF muda": o modelo do orgao tem seis abas e nao comporta anexo, e o
    // CSV e listagem plana para o contador importar.
    //
    // `buffer.length` nao prova isso — dois .xlsx diferentes podem pesar
    // igual — e `Buffer.compare` tambem nao serve: o ExcelJS grava
    // `created`/`modified` em `docProps/core.xml`, e duas exportacoes da
    // mesma prestacao em segundos de relogio diferentes ja saem byte a byte
    // diferentes (medido: 18415 x 18418 bytes com 1.5s de intervalo). A
    // asserção estrutural — as seis folhas certas, com os nomes certos — e o
    // que prova que nenhum apendice vazou para a planilha, sem depender do
    // relogio.
    const { ctx: coordenacao, prestacaoId, despesaId } = await cenarioComDespesas()

    const xlsxAntes = await exportarPrestacao(coordenacao, prestacaoId, 'xlsx')
    const csvAntes = await exportarPrestacao(coordenacao, prestacaoId, 'csv')

    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(2) }
    )

    const xlsxDepois = await exportarPrestacao(coordenacao, prestacaoId, 'xlsx')
    const csvDepois = await exportarPrestacao(coordenacao, prestacaoId, 'csv')

    const NOMES_DAS_SEIS_FOLHAS = [
      '1-Capa',
      '2-Contra-Capa',
      '3-Despesas',
      '4-Receitas',
      '5-Conciliação',
      '6-Encerramento',
    ]
    expect((await reabrirXlsx(xlsxAntes.buffer)).worksheets.map((f) => f.name)).toEqual(
      NOMES_DAS_SEIS_FOLHAS
    )
    expect((await reabrirXlsx(xlsxDepois.buffer)).worksheets.map((f) => f.name)).toEqual(
      NOMES_DAS_SEIS_FOLHAS
    )

    // O CSV nem passa por `montarDocumentoPrestacao` — não tem folha para
    // levar apêndice, e o conteúdo é idêntico byte a byte, sem timestamp de
    // formato de planilha para atrapalhar a comparação.
    expect(csvDepois.buffer.toString('utf8')).toBe(csvAntes.buffer.toString('utf8'))
  })
})
