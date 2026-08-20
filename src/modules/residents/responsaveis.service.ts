import { z } from 'zod'
import type { Responsavel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'

const responsavelSchema = z.object({
  residenteId: z.string().cuid(),
  nome: z.string().trim().min(3, 'Informe o nome do responsável'),
  parentesco: z.string().trim().min(2, 'Informe o parentesco'),
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor ? somenteDigitos(valor) : undefined))
    .refine((valor) => valor === undefined || validarCpf(valor), {
      message: 'CPF inválido',
    }),
  telefonePrincipal: z.string().trim().min(8, 'Informe um telefone de contato'),
  telefoneSecundario: z.string().trim().optional(),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase().optional(),
  cep: z.string().trim().optional(),
  ehResponsavelLegal: z.boolean().default(false),
  ehContatoEmergencia: z.boolean().default(false),
  autorizadoVisitar: z.boolean().default(true),
  observacao: z.string().trim().optional(),
})

const atualizacaoSchema = responsavelSchema.partial().omit({ residenteId: true })

export type DadosResponsavel = z.input<typeof responsavelSchema>
export type DadosAtualizacaoResponsavel = z.input<typeof atualizacaoSchema>

export async function adicionarResponsavel(
  ctx: Ctx,
  dados: DadosResponsavel
): Promise<Responsavel> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(responsavelSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.responsavel.create({
      data: { ...entrada, email: entrada.email || null, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Responsavel',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { nome: { de: null, para: criado.nome } },
    })

    return criado
  })
}

/**
 * Aceita os três papéis por desenho: devolve contato de familiar, não dado
 * clínico ou financeiro do residente, e é consultada com frequência na ficha.
 * Não audita pelo mesmo motivo — auditar aqui geraria uma linha a cada
 * abertura de ficha, afogando a trilha sem acrescentar rastro relevante.
 * Ordena o responsável legal primeiro: quem precisa ligar numa urgência não
 * deve procurar na lista.
 */
export async function listarResponsaveis(
  ctx: Ctx,
  residenteId: string
): Promise<Responsavel[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  return prisma.responsavel.findMany({
    where: { residenteId, ativo: true },
    orderBy: [{ ehResponsavelLegal: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
  })
}

async function exigirResponsavel(id: string): Promise<Responsavel> {
  const responsavel = await prisma.responsavel.findUnique({ where: { id } })
  if (!responsavel) throw new ErroNaoEncontrado('Responsável não encontrado')
  return responsavel
}

export async function atualizarResponsavel(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoResponsavel
): Promise<Responsavel> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoSchema, dados)
  const atual = await exigirResponsavel(id)

  // `adicionarResponsavel` grava `entrada.email || null`; sem o mesmo
  // tratamento aqui, salvar a edição com o campo apagado gravava string vazia.
  // A normalização vem ANTES do diff, senão a trilha registraria
  // "E-mail: — → —".
  const gravavel = entrada.email === '' ? { ...entrada, email: null } : entrada

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, gravavel)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.responsavel.update({ where: { id }, data: gravavel })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Responsavel',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff,
    })

    return atualizado
  })
}

export async function removerResponsavel(ctx: Ctx, id: string): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const atual = await exigirResponsavel(id)

  await prisma.$transaction(async (tx) => {
    await tx.responsavel.update({ where: { id }, data: { ativo: false } })
    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade: 'Responsavel',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { ativo: { de: atual.ativo, para: false } },
    })
  })
}
