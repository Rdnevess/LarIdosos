import { z } from 'zod'
import type { CategoriaDespesa, Fornecedor, OrigemReceita } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { validarCpf, validarCnpj, somenteDigitos } from '@/lib/ptbr'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Os três cadastros auxiliares do financeiro: de onde vem o dinheiro, em que
 * se gasta, e para quem se paga.
 *
 * Ficam num arquivo só porque são a mesma forma vista de três ângulos — um
 * nome, um estado de ativação, e nenhuma regra própria além da validação do
 * documento do fornecedor.
 */

const origemSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da origem'),
  // O caso comum é os dois coincidirem, e exigir a digitação dupla seria
  // convidar ao erro que o agrupamento por texto do Excel já pune.
  rotuloPrestacao: z.string().trim().min(2).optional(),
  exigeResidente: z.boolean().optional(),
})

const categoriaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da categoria'),
})

const fornecedorSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome do fornecedor'),
    documento: z.string().trim().transform(somenteDigitos),
    tipoDocumento: z.enum(['CNPJ', 'CPF']),
    telefone: z.string().trim().nullish(),
    email: z.string().trim().email('E-mail inválido').nullish(),
  })
  // O tipo escolhido decide qual verificação roda: um CPF válido não é um
  // CNPJ válido, e o documento errado aqui sai errado na prestação — este
  // cadastro substitui o XLOOKUP quebrado da planilha.
  .refine(
    (d) => (d.tipoDocumento === 'CPF' ? validarCpf(d.documento) : validarCnpj(d.documento)),
    { message: 'Documento inválido para o tipo informado', path: ['documento'] }
  )

export type DadosOrigemReceita = z.input<typeof origemSchema>
export type DadosCategoriaDespesa = z.input<typeof categoriaSchema>
export type DadosFornecedor = z.input<typeof fornecedorSchema>

export async function criarOrigemReceita(
  ctx: Ctx,
  dados: DadosOrigemReceita
): Promise<OrigemReceita> {
  exigirPapel(ctx, 'OrigemReceita', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(origemSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.origemReceita.create({
      data: {
        nome: entrada.nome,
        rotuloPrestacao: entrada.rotuloPrestacao ?? entrada.nome,
        exigeResidente: entrada.exigeResidente ?? false,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'OrigemReceita',
      entidadeId: criada.id,
      diff: {
        nome: { de: null, para: criada.nome },
        rotuloPrestacao: { de: null, para: criada.rotuloPrestacao },
      },
    })

    return criada
  })
}

export async function listarOrigensReceita(ctx: Ctx): Promise<OrigemReceita[]> {
  exigirPapel(ctx, 'OrigemReceita', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativas = await prisma.origemReceita.findMany({ where: { ativa: true } })
  return ativas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function criarCategoriaDespesa(
  ctx: Ctx,
  dados: DadosCategoriaDespesa
): Promise<CategoriaDespesa> {
  exigirPapel(ctx, 'CategoriaDespesa', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(categoriaSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.categoriaDespesa.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'CategoriaDespesa',
      entidadeId: criada.id,
      diff: { nome: { de: null, para: criada.nome } },
    })

    return criada
  })
}

export async function listarCategoriasDespesa(ctx: Ctx): Promise<CategoriaDespesa[]> {
  exigirPapel(ctx, 'CategoriaDespesa', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativas = await prisma.categoriaDespesa.findMany({ where: { ativa: true } })
  // Ordem alfabética brasileira: sem o `localeCompare` com `pt-BR`, "Água"
  // cairia depois de "Salário".
  return ativas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function criarFornecedor(
  ctx: Ctx,
  dados: DadosFornecedor
): Promise<Fornecedor> {
  exigirPapel(ctx, 'Fornecedor', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(fornecedorSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.fornecedor.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Fornecedor',
      entidadeId: criado.id,
      diff: { nome: { de: null, para: criado.nome } },
    })

    return criado
  })
}

export async function listarFornecedores(ctx: Ctx): Promise<Fornecedor[]> {
  exigirPapel(ctx, 'Fornecedor', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativos = await prisma.fornecedor.findMany({ where: { ativo: true } })
  return ativos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * As três desativações são o mesmo ato sobre tabelas diferentes, e o Prisma
 * não dá um cliente genérico sem que os tipos de cada tabela se percam. O ramo
 * repetido é o preço de manter a checagem de existência e a chamada de
 * auditoria escritas uma vez — que é a parte onde um descuido não apareceria
 * em teste nenhum.
 */
async function desativar(
  ctx: Ctx,
  entidade: 'OrigemReceita' | 'CategoriaDespesa' | 'Fornecedor',
  id: string
): Promise<void> {
  exigirPapel(ctx, entidade, 'COORDENACAO', 'ADMINISTRATIVO')

  const atual =
    entidade === 'OrigemReceita'
      ? await prisma.origemReceita.findUnique({ where: { id } })
      : entidade === 'CategoriaDespesa'
        ? await prisma.categoriaDespesa.findUnique({ where: { id } })
        : await prisma.fornecedor.findUnique({ where: { id } })

  const estaAtivo =
    atual && ('ativa' in atual ? atual.ativa : atual.ativo)
  if (!atual || !estaAtivo) throw new ErroNaoEncontrado('Registro não encontrado')

  await prisma.$transaction(async (tx) => {
    if (entidade === 'OrigemReceita') {
      await tx.origemReceita.update({ where: { id }, data: { ativa: false } })
    } else if (entidade === 'CategoriaDespesa') {
      await tx.categoriaDespesa.update({ where: { id }, data: { ativa: false } })
    } else {
      await tx.fornecedor.update({ where: { id }, data: { ativo: false } })
    }

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade,
      entidadeId: id,
      diff: { ativo: { de: true, para: false } },
    })
  })
}

export const desativarOrigemReceita = (ctx: Ctx, id: string) =>
  desativar(ctx, 'OrigemReceita', id)
export const desativarCategoriaDespesa = (ctx: Ctx, id: string) =>
  desativar(ctx, 'CategoriaDespesa', id)
export const desativarFornecedor = (ctx: Ctx, id: string) =>
  desativar(ctx, 'Fornecedor', id)
