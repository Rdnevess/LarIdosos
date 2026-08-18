import { z } from 'zod'
import type { Documento, Papel, TipoDocumento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { salvarArquivo, lerArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const TODOS: Papel[] = ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO']
const CLINICO: Papel[] = ['COORDENACAO', 'SAUDE']
const FINANCEIRO_E_PESSOAL: Papel[] = ['COORDENACAO', 'ADMINISTRATIVO']

export function papeisQuePodemVer(documento: {
  tipo: TipoDocumento
  funcionarioId: string | null
}): Papel[] {
  if (documento.funcionarioId) return FINANCEIRO_E_PESSOAL
  if (documento.tipo === 'EXAME' || documento.tipo === 'LAUDO') return CLINICO
  if (documento.tipo === 'COMPROVANTE_FISCAL') return FINANCEIRO_E_PESSOAL
  return TODOS
}

const anexoSchema = z
  .object({
    tipo: z.enum([
      'RG', 'CPF', 'CNS', 'CERTIDAO', 'LAUDO', 'PROCURACAO',
      'TERMO_RESPONSABILIDADE', 'TERMO_LGPD', 'FOTO', 'EXAME',
      'COMPROVANTE_FISCAL', 'CONSELHO_PROFISSIONAL', 'OUTRO',
    ]),
    descricao: z.string().trim().optional(),
    nomeArquivoOriginal: z.string().trim().min(1, 'Informe o nome do arquivo'),
    mimeType: z.string().trim().min(1),
    conteudo: z.instanceof(Buffer),
    residenteId: z.string().cuid().optional(),
    funcionarioId: z.string().cuid().optional(),
  })
  .refine((d) => Boolean(d.residenteId) !== Boolean(d.funcionarioId), {
    message: 'Informe exatamente um vínculo: residente ou funcionário',
  })

export type DadosAnexo = z.input<typeof anexoSchema>

export async function anexarDocumento(ctx: Ctx, dados: DadosAnexo): Promise<Documento> {
  const entrada = validar(anexoSchema, dados)
  exigirPapel(
    ctx,
    ...papeisQuePodemVer({
      tipo: entrada.tipo,
      funcionarioId: entrada.funcionarioId ?? null,
    })
  )

  const salvo = await salvarArquivo(entrada.conteudo, entrada.mimeType)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.documento.create({
      data: {
        tipo: entrada.tipo,
        descricao: entrada.descricao,
        nomeArquivoOriginal: entrada.nomeArquivoOriginal,
        caminhoArmazenamento: salvo.caminhoRelativo,
        mimeType: entrada.mimeType,
        tamanhoBytes: salvo.tamanhoBytes,
        hashSha256: salvo.hashSha256,
        residenteId: entrada.residenteId,
        funcionarioId: entrada.funcionarioId,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Documento',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { tipo: { de: null, para: criado.tipo } },
    })

    return criado
  })
}

/**
 * Aceita os três papéis por desenho: a permissão real é por documento
 * (`papeisQuePodemVer`), não por tela. Recusar a listagem inteira para quem
 * não pode ver um tipo específico vazaria por omissão a existência desse
 * documento — por isso a função filtra o resultado em vez de recusar o
 * acesso.
 */
export async function listarDocumentos(
  ctx: Ctx,
  alvo: { residenteId?: string; funcionarioId?: string }
): Promise<Documento[]> {
  exigirPapel(ctx, ...TODOS)

  const documentos = await prisma.documento.findMany({
    where: { ...alvo, ativo: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  return documentos.filter((documento) =>
    papeisQuePodemVer(documento).includes(ctx.papel)
  )
}

export async function obterDocumentoParaDownload(
  ctx: Ctx,
  id: string
): Promise<{ documento: Documento; conteudo: Buffer }> {
  const documento = await prisma.documento.findUnique({ where: { id } })
  if (!documento || !documento.ativo) {
    throw new ErroNaoEncontrado('Documento não encontrado')
  }

  if (!papeisQuePodemVer(documento).includes(ctx.papel)) {
    throw new ErroPermissao()
  }

  const conteudo = await lerArquivo(documento.caminhoArmazenamento)

  await registrarAuditoria(prisma, ctx, {
    acao: 'DOWNLOAD',
    entidade: 'Documento',
    entidadeId: id,
    residenteId: documento.residenteId ?? undefined,
  })

  return { documento, conteudo }
}
