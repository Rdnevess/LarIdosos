import type { Documento, TipoDocumento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { salvarArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { papeisQuePodemVer } from '@/modules/residents/documentos.service'

/**
 * Os três anexos comprobatórios do financeiro: a nota e o comprovante de cada
 * despesa, e o extrato de cada prestação.
 *
 * **Um serviço só para os três**, e não dois campos no `lancamentos.service` e
 * um no `prestacoes.service`: as três regras que valem aqui — o papel, só
 * despesa, e só com a prestação aberta — são exatamente as mesmas nos três
 * casos, e separá-las por tabela seria escrevê-las três vezes.
 */

export type AlvoAnexo =
  | { tipo: 'DESPESA_FISCAL'; lancamentoId: string }
  | { tipo: 'DESPESA_COMPROVANTE'; lancamentoId: string }
  | { tipo: 'EXTRATO'; prestacaoId: string }

const TIPO_DO_ALVO: Record<AlvoAnexo['tipo'], TipoDocumento> = {
  DESPESA_FISCAL: 'COMPROVANTE_FISCAL',
  DESPESA_COMPROVANTE: 'COMPROVANTE_PAGAMENTO',
  EXTRATO: 'EXTRATO_BANCARIO',
}

// Só para o `diff` da auditoria, onde a chave dinâmica é aceitável — `ligar`
// ramifica por alvo explicitamente, porque uma chave computada em `data` vira
// `{ [x: string]: string | null }` e não casa com o tipo de update do Prisma.
const CAMPO_DO_ALVO: Record<AlvoAnexo['tipo'], string> = {
  DESPESA_FISCAL: 'documentoFiscalId',
  DESPESA_COMPROVANTE: 'comprovantePagamentoId',
  EXTRATO: 'extratoId',
}

const FECHADA = 'Esta prestação está fechada. Reabra-a antes de mexer nos anexos.'

/**
 * Confere que o alvo existe, que é despesa quando devia ser, e que a prestação
 * a que ele pertence ainda aceita mudança.
 *
 * Um lançamento sem `prestacaoContasId` não pertence a prestação nenhuma
 * ainda — nada a travar.
 */
async function exigirAlvoEditavel(alvo: AlvoAnexo): Promise<void> {
  if (alvo.tipo === 'EXTRATO') {
    const prestacao = await prisma.prestacaoContas.findUnique({
      where: { id: alvo.prestacaoId },
      select: { status: true },
    })
    if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')
    if (prestacao.status === 'FECHADA') throw new ErroValidacao(FECHADA)
    return
  }

  const lancamento = await prisma.lancamento.findUnique({
    where: { id: alvo.lancamentoId },
    select: { natureza: true, prestacaoContas: { select: { status: true } } },
  })
  if (!lancamento) throw new ErroNaoEncontrado('Lançamento não encontrado')
  if (lancamento.natureza !== 'DESPESA') {
    throw new ErroValidacao('Nota fiscal e comprovante de pagamento são só de despesa.')
  }
  if (lancamento.prestacaoContas?.status === 'FECHADA') throw new ErroValidacao(FECHADA)
}

/**
 * Liga (ou desliga, com `documentoId: null`) o alvo ao documento.
 *
 * Ramifica por alvo em vez de montar `data` com `CAMPO_DO_ALVO[alvo.tipo]`
 * como chave computada: essa chave vira `{ [x: string]: string | null }`, que
 * não casa com o tipo de update gerado pelo Prisma para `Lancamento` nem para
 * `PrestacaoContas`, e o typecheck reprova.
 */
async function ligar(alvo: AlvoAnexo, documentoId: string | null): Promise<void> {
  if (alvo.tipo === 'EXTRATO') {
    await prisma.prestacaoContas.update({
      where: { id: alvo.prestacaoId },
      data: { extratoId: documentoId },
    })
    return
  }

  if (alvo.tipo === 'DESPESA_FISCAL') {
    await prisma.lancamento.update({
      where: { id: alvo.lancamentoId },
      data: { documentoFiscalId: documentoId },
    })
    return
  }

  await prisma.lancamento.update({
    where: { id: alvo.lancamentoId },
    data: { comprovantePagamentoId: documentoId },
  })
}

function idDoAlvo(alvo: AlvoAnexo): string {
  return alvo.tipo === 'EXTRATO' ? alvo.prestacaoId : alvo.lancamentoId
}

function entidadeDoAlvo(alvo: AlvoAnexo): 'Lancamento' | 'PrestacaoContas' {
  return alvo.tipo === 'EXTRATO' ? 'PrestacaoContas' : 'Lancamento'
}

/**
 * Os extratos já anexados, para uma lista de ids de documento, numa consulta
 * só.
 *
 * Existe para a tela de prestações, que lista várias prestações de uma vez e
 * precisa do nome de cada extrato sem uma consulta por prestação. A
 * visibilidade não é um papel fixo escrito aqui: vem de `papeisQuePodemVer`,
 * a mesma política que rege toda leitura de `Documento`. Se um dia
 * EXTRATO_BANCARIO for restrito só a COORDENACAO, este ponto de leitura
 * herda o corte automaticamente, em vez de continuar servindo o nome do
 * arquivo a um papel que a política já não autoriza mais.
 */
export async function extratosAnexados(
  ctx: Ctx,
  extratoIds: string[]
): Promise<Map<string, { id: string; nome: string }>> {
  exigirPapel(ctx, 'Documento', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  if (extratoIds.length === 0) return new Map()

  const documentos = await prisma.documento.findMany({
    where: { id: { in: extratoIds } },
    select: { id: true, nomeArquivoOriginal: true, tipo: true, funcionarioId: true },
  })

  return new Map(
    documentos
      .filter((documento) => papeisQuePodemVer(documento).includes(ctx.papel))
      .map((documento) => [documento.id, { id: documento.id, nome: documento.nomeArquivoOriginal }])
  )
}

export async function anexarComprovante(
  ctx: Ctx,
  alvo: AlvoAnexo,
  arquivo: { nomeArquivoOriginal: string; mimeType: string; conteudo: Buffer }
): Promise<Documento> {
  exigirPapel(ctx, entidadeDoAlvo(alvo), 'COORDENACAO', 'ADMINISTRATIVO')

  // Só PDF. `salvarArquivo` aceitaria JPG, PNG e WEBP, e a foto entraria no
  // banco para nunca sair no apêndice — o montador só copia página de PDF.
  // Recusar aqui é o que impede o anexo silenciosamente inútil.
  if (arquivo.mimeType !== 'application/pdf') {
    throw new ErroValidacao('Envie o arquivo em PDF.')
  }

  await exigirAlvoEditavel(alvo)

  // Grava bytes só depois de tudo conferido: um alvo inválido deixaria o
  // arquivo no disco sem registro e sem ninguém para limpá-lo.
  const salvo = await salvarArquivo(arquivo.conteudo, arquivo.mimeType)

  const documento = await prisma.documento.create({
    data: {
      tipo: TIPO_DO_ALVO[alvo.tipo],
      nomeArquivoOriginal: arquivo.nomeArquivoOriginal,
      caminhoArmazenamento: salvo.caminhoRelativo,
      mimeType: arquivo.mimeType,
      tamanhoBytes: salvo.tamanhoBytes,
      hashSha256: salvo.hashSha256,
      criadoPorId: ctx.usuarioId,
    },
  })

  await ligar(alvo, documento.id)

  await registrarAuditoria(prisma, ctx, {
    acao: 'ATUALIZAR',
    entidade: entidadeDoAlvo(alvo),
    entidadeId: idDoAlvo(alvo),
    diff: { [CAMPO_DO_ALVO[alvo.tipo]]: { de: null, para: documento.id } },
  })

  return documento
}

/**
 * Desliga o anexo do alvo. **Não apaga o `Documento` nem o arquivo** — exclusão
 * neste sistema é sempre lógica, e um anexo trocado por engano ainda pode ser
 * reencontrado pelo banco e pela trilha.
 */
export async function removerComprovante(ctx: Ctx, alvo: AlvoAnexo): Promise<void> {
  exigirPapel(ctx, entidadeDoAlvo(alvo), 'COORDENACAO', 'ADMINISTRATIVO')
  await exigirAlvoEditavel(alvo)

  await ligar(alvo, null)

  await registrarAuditoria(prisma, ctx, {
    acao: 'ATUALIZAR',
    entidade: entidadeDoAlvo(alvo),
    entidadeId: idDoAlvo(alvo),
    diff: { [CAMPO_DO_ALVO[alvo.tipo]]: { de: 'anexado', para: null } },
  })
}
