import { z } from 'zod'
import { TipoDocumento } from '@prisma/client'
import type { Documento, Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { salvarArquivo, lerArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const TODOS: Papel[] = ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO']
const CLINICO: Papel[] = ['COORDENACAO', 'SAUDE']
const FINANCEIRO_E_PESSOAL: Papel[] = ['COORDENACAO', 'ADMINISTRATIVO']

/**
 * A ordem das checagens importa e é deliberada: o vínculo com funcionário vem
 * ANTES do tipo. Um laudo de funcionário — atestado, perícia — é assunto de
 * pessoal, não da equipe que cuida dos idosos; por isso fica visível ao
 * ADMINISTRATIVO e oculto ao SAUDE, ao contrário do laudo de um residente.
 * Inverter esses dois ifs abriria prontuário de funcionário à equipe clínica.
 */
export function papeisQuePodemVer(documento: {
  tipo: TipoDocumento
  funcionarioId: string | null
}): Papel[] {
  if (documento.funcionarioId) return FINANCEIRO_E_PESSOAL
  if (documento.tipo === 'EXAME' || documento.tipo === 'LAUDO') return CLINICO
  if (documento.tipo === 'COMPROVANTE_FISCAL') return FINANCEIRO_E_PESSOAL
  return TODOS
}

/**
 * Tipos que `papel` pode anexar ao alvo informado.
 *
 * Derivado de `papeisQuePodemVer`, consultando-a — não é uma segunda lista de
 * permissões. Era essa segunda lista que fazia a ficha esconder o formulário
 * de anexo justamente do papel SAUDE, autorizado a anexar EXAME e LAUDO, e o
 * seletor omitir os três tipos restritos: a enfermeira não conseguia anexar o
 * laudo do grau de dependência, documento que a fiscalização sanitária cobra.
 *
 * O universo vem de `Object.values(TipoDocumento)`, o enum gerado pelo Prisma
 * a partir de `prisma/schema.prisma`: um tipo novo no schema entra aqui
 * sozinho, e o `Record<TipoDocumento, string>` de `ROTULO_TIPO_DOCUMENTO`
 * (`src/lib/ptbr.ts`) quebra o typecheck se ele não tiver rótulo.
 *
 * O alvo importa porque `papeisQuePodemVer` testa `funcionarioId` ANTES do
 * tipo — um LAUDO de funcionário é assunto de pessoal, não da equipe clínica.
 * Passar o alvo adiante em vez de assumir residente preserva essa ordem.
 */
export function tiposQuePodeAnexar(
  papel: Papel,
  alvo: { funcionarioId?: string | null } = {}
): TipoDocumento[] {
  return Object.values(TipoDocumento).filter((tipo) =>
    papeisQuePodemVer({ tipo, funcionarioId: alvo.funcionarioId ?? null }).includes(papel)
  )
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

  // Confere o vínculo ANTES de gravar bytes. Sem isso, um `residenteId`
  // inexistente só falharia na chave estrangeira do insert — depois do arquivo
  // já estar no disco, sem registro e sem ninguém para limpá-lo.
  if (entrada.residenteId) {
    const residente = await prisma.residente.findUnique({
      where: { id: entrada.residenteId },
      select: { id: true },
    })
    if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
  }

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

  // Sem isso, `alvo` vazio produziria `where: { ativo: true }` — o Prisma ignora
  // chaves `undefined` — e a função varreria todos os documentos de todos os
  // residentes e funcionários. O contrato é "escopo em um alvo"; esta validação
  // é o que impede uma varredura global silenciosa.
  if (Boolean(alvo.residenteId) === Boolean(alvo.funcionarioId)) {
    throw new ErroValidacao('Informe exatamente um vínculo: residente ou funcionário')
  }

  const documentos = await prisma.documento.findMany({
    where: alvo.residenteId
      ? { residenteId: alvo.residenteId, ativo: true }
      : { funcionarioId: alvo.funcionarioId, ativo: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  return documentos.filter((documento) =>
    papeisQuePodemVer(documento).includes(ctx.papel)
  )
}

export async function excluirDocumento(ctx: Ctx, id: string): Promise<void> {
  const documento = await prisma.documento.findUnique({ where: { id } })
  if (!documento || !documento.ativo) {
    throw new ErroNaoEncontrado('Documento não encontrado')
  }

  exigirPapel(ctx, ...papeisQuePodemVer(documento))

  await prisma.$transaction(async (tx) => {
    await tx.documento.update({ where: { id }, data: { ativo: false } })

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade: 'Documento',
      entidadeId: id,
      residenteId: documento.residenteId ?? undefined,
      diff: { ativo: { de: documento.ativo, para: false } },
    })
  })
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
