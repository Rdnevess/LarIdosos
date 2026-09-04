import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { montarDocumentoPrestacao, type LinhaDespesa } from './documento-prestacao'
import { gerarPdfPrestacao } from './pdf-prestacao'
import { fimDoMes } from '@/lib/periodo'
import { gerarCsvLancamentos } from './csv-lancamentos'
import { juntarAnexos, type AnexoParaJuntar } from './anexos-prestacao'

/**
 * A saída do documento pronto: PDF para o órgão, o arquivo e a assinatura.
 *
 * **Exportar é auditado.** `EXPORTAR` existe no enum desde a Fase 1 e nunca
 * tinha sido usada; é o registro de que um documento saiu do sistema, com quem
 * o gerou e em que formato. Numa prestação de contas, saber quem gerou a via
 * que foi protocolada é o começo de qualquer conferência.
 *
 * **A planilha saiu em 01/09/2026.** Ela reproduzia a geometria do modelo do
 * órgão e nunca a aparência dele — as bordas do original nunca foram
 * capturadas. Em vez de consertar dois renderizadores, o projeto passou a ter
 * um: o PDF, agora fiel. O CSV fica, porque atende outra pessoa (o contador,
 * que importa) e nunca passou pelo modelo.
 */

export type FormatoExportacao = 'pdf' | 'csv'

/**
 * A rota (`/api/prestacoes/[id]/[formato]/route.ts`) já filtra o formato
 * antes de chegar aqui, mas ela não é a única chamadora possível — um script,
 * um teste ou uma segunda rota no futuro podiam passar um formato
 * desconhecido. Sem esta lista, `gerarConteudo` caía no ramo do PDF por
 * omissão e devolvia um documento com `Content-Type` indefinido em vez de uma
 * recusa. Esta lista é do serviço, não a mesma da rota: a da rota decide 404,
 * esta decide `ErroValidacao` — são respostas diferentes para quem chama.
 */
const FORMATOS: FormatoExportacao[] = ['pdf', 'csv']

const MIME: Record<FormatoExportacao, string> = {
  pdf: 'application/pdf',
  // `charset=utf-8` junto do BOM que o CSV já carrega: os dois dizem a mesma
  // coisa, e programas diferentes acreditam em um ou no outro.
  csv: 'text/csv; charset=utf-8',
}

export type PrestacaoExportada = {
  buffer: Buffer
  nomeArquivo: string
  mimeType: string
}

/**
 * O número da conta é digitado por gente e vai parar no `Content-Disposition`.
 * Barra, ponto-ponto e o resto viram traço: um nome de arquivo não é caminho.
 */
function pedacoSeguro(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'conta'
  )
}

/**
 * Os anexos comprobatórios, na ordem em que entram no apêndice: para cada
 * despesa, a nota e depois o comprovante; o extrato por último.
 *
 * A ordem das despesas vem de `despesas`, que é a lista que a folha 3-Despesas
 * imprime — e não de uma segunda consulta ordenando de novo. A enésima despesa
 * da tabela é a enésima do apêndice porque é literalmente a mesma lista.
 */
async function anexosDaPrestacao(
  prestacaoId: string,
  despesas: LinhaDespesa[]
): Promise<AnexoParaJuntar[]> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { id: { in: despesas.map((despesa) => despesa.lancamentoId) } },
    select: {
      id: true,
      documentoFiscal: { select: { id: true, caminhoArmazenamento: true } },
      comprovantePagamento: { select: { id: true, caminhoArmazenamento: true } },
    },
  })
  const porId = new Map(lancamentos.map((lancamento) => [lancamento.id, lancamento]))

  const anexos: AnexoParaJuntar[] = []
  for (const despesa of despesas) {
    const lancamento = porId.get(despesa.lancamentoId)
    for (const documento of [lancamento?.documentoFiscal, lancamento?.comprovantePagamento]) {
      if (documento) {
        anexos.push({
          documentoId: documento.id,
          caminhoArmazenamento: documento.caminhoArmazenamento,
        })
      }
    }
  }

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    select: { extrato: { select: { id: true, caminhoArmazenamento: true } } },
  })
  if (prestacao?.extrato) {
    anexos.push({
      documentoId: prestacao.extrato.id,
      caminhoArmazenamento: prestacao.extrato.caminhoArmazenamento,
    })
  }

  return anexos
}

/**
 * O CSV é dos lançamentos da competência, e não do documento: o contador quer
 * a movimentação linha a linha, não a capa e o ofício. Por isso ele não passa
 * por `montarDocumentoPrestacao` — e por isso não exige a configuração da
 * instituição, que só a capa e as assinaturas usam.
 */
async function gerarConteudo(
  ctx: Ctx,
  prestacao: { id: string; contaBancariaId: string; anoCompetencia: number; mesCompetencia: number },
  formato: FormatoExportacao
): Promise<Buffer> {
  if (formato === 'csv') {
    const { anoCompetencia: ano, mesCompetencia: mes } = prestacao
    const csv = await gerarCsvLancamentos(ctx, {
      contaBancariaId: prestacao.contaBancariaId,
      de: new Date(ano, mes - 1, 1),
      ate: fimDoMes(ano, mes),
    })
    return Buffer.from(csv, 'utf8')
  }

  const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

  // Só o PDF ganha apêndice: o modelo do órgão tem seis abas e não comporta
  // anexo, e o CSV é listagem plana para o contador importar.
  const folhas = await gerarPdfPrestacao(documento)
  const anexos = await anexosDaPrestacao(prestacao.id, documento.despesas)
  return await juntarAnexos(folhas, anexos, { prestacaoId: prestacao.id })
}

export async function exportarPrestacao(
  ctx: Ctx,
  prestacaoId: string,
  formato: FormatoExportacao
): Promise<PrestacaoExportada> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  if (!FORMATOS.includes(formato)) {
    throw new ErroValidacao(`Formato não suportado: ${formato}`)
  }

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    include: { contaBancaria: { select: { numeroConta: true } } },
  })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')

  const buffer = await gerarConteudo(ctx, prestacao, formato)

  const conta = pedacoSeguro(prestacao.contaBancaria.numeroConta)
  const mes = String(prestacao.mesCompetencia).padStart(2, '0')
  const nomeArquivo = `prestacao-${conta}-${prestacao.anoCompetencia}-${mes}.${formato}`

  await registrarAuditoria(prisma, ctx, {
    acao: 'EXPORTAR',
    entidade: 'PrestacaoContas',
    entidadeId: prestacaoId,
    diff: {
      formato: { de: null, para: formato },
      competencia: { de: null, para: `${mes}/${prestacao.anoCompetencia}` },
      status: { de: null, para: prestacao.status },
    },
  })

  return { buffer, nomeArquivo, mimeType: MIME[formato] }
}
