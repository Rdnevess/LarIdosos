import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { montarDocumentoPrestacao } from './documento-prestacao'
import { gerarXlsxPrestacao } from './xlsx-prestacao'
import { gerarPdfPrestacao } from './pdf-prestacao'

/**
 * A saída do documento pronto: `.xlsx` para o órgão, PDF para o arquivo e a
 * assinatura.
 *
 * **Exportar é auditado.** `EXPORTAR` existe no enum desde a Fase 1 e nunca
 * tinha sido usada; é o registro de que um documento saiu do sistema, com quem
 * o gerou e em que formato. Numa prestação de contas, saber quem gerou a via
 * que foi protocolada é o começo de qualquer conferência.
 */

export type FormatoExportacao = 'xlsx' | 'pdf'

const MIME: Record<FormatoExportacao, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
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

export async function exportarPrestacao(
  ctx: Ctx,
  prestacaoId: string,
  formato: FormatoExportacao
): Promise<PrestacaoExportada> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    include: { contaBancaria: { select: { numeroConta: true } } },
  })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')

  const documento = await montarDocumentoPrestacao(ctx, prestacaoId)
  const buffer =
    formato === 'xlsx' ? await gerarXlsxPrestacao(documento) : await gerarPdfPrestacao(documento)

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
