import { z } from 'zod'
import type { ConfiguracaoInstituicao, ContaBancaria } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { validarCnpj, somenteDigitos } from '@/lib/ptbr'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Os dados da instituição e as contas bancárias.
 *
 * A configuração alimenta a capa, o ofício, os rodapés de assinatura e a
 * declaração de encerramento — sem ela, esses textos seriam constantes
 * espalhadas pelo código de exportação, e mudariam de lugar em lugar.
 *
 * A conta é o eixo do módulo: cada lançamento pertence a uma, e cada prestação
 * cobre uma conta num mês.
 */

const cnpjSchema = z
  .string()
  .trim()
  .transform(somenteDigitos)
  .refine(validarCnpj, { message: 'CNPJ inválido' })

const instituicaoSchema = z.object({
  razaoSocial: z.string().trim().min(3, 'Informe a razão social'),
  cnpj: cnpjSchema,
  enderecoCompleto: z.string().trim().min(5, 'Informe o endereço completo'),
  cidade: z.string().trim().min(2, 'Informe a cidade'),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase(),
  orgaoDestinatario: z.string().trim().min(3, 'Informe o órgão destinatário'),
  nomePresidente: z.string().trim().min(3, 'Informe o nome do presidente'),
  nomeTesoureiro: z.string().trim().min(3, 'Informe o nome do tesoureiro'),
})

const contaSchema = z.object({
  banco: z.string().trim().min(2, 'Informe o banco'),
  agencia: z.string().trim().min(1, 'Informe a agência'),
  numeroConta: z.string().trim().min(1, 'Informe o número da conta'),
  tipo: z.enum(['CORRENTE', 'POUPANCA', 'APLICACAO']),
  titular: z.string().trim().min(3, 'Informe o titular'),
  // Sem piso: conta no vermelho é um fato, e recusá-lo obrigaria a
  // instituição a mentir no cadastro para conseguir usar o sistema.
  saldoInicial: z.number(),
  dataSaldoInicial: z.date(),
  prestaContas: z.boolean().optional(),
})

export type DadosInstituicao = z.input<typeof instituicaoSchema>
export type DadosContaBancaria = z.input<typeof contaSchema>

/**
 * Registro único: cria na primeira vez, atualiza nas seguintes. Uma segunda
 * linha faria a exportação escolher uma sem critério.
 */
export async function salvarConfiguracaoInstituicao(
  ctx: Ctx,
  dados: DadosInstituicao
): Promise<ConfiguracaoInstituicao> {
  exigirPapel(ctx, 'ConfiguracaoInstituicao', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(instituicaoSchema, dados)

  const atual = await prisma.configuracaoInstituicao.findFirst()

  return prisma.$transaction(async (tx) => {
    const salva = atual
      ? await tx.configuracaoInstituicao.update({ where: { id: atual.id }, data: entrada })
      : await tx.configuracaoInstituicao.create({
          data: { ...entrada, criadoPorId: ctx.usuarioId },
        })

    await registrarAuditoria(tx, ctx, {
      acao: atual ? 'ATUALIZAR' : 'CRIAR',
      entidade: 'ConfiguracaoInstituicao',
      entidadeId: salva.id,
      diff: { razaoSocial: { de: atual?.razaoSocial ?? null, para: salva.razaoSocial } },
    })

    return salva
  })
}

export async function obterConfiguracaoInstituicao(
  ctx: Ctx
): Promise<ConfiguracaoInstituicao | null> {
  exigirPapel(ctx, 'ConfiguracaoInstituicao', 'COORDENACAO', 'ADMINISTRATIVO')
  return prisma.configuracaoInstituicao.findFirst()
}

export async function criarContaBancaria(
  ctx: Ctx,
  dados: DadosContaBancaria
): Promise<ContaBancaria> {
  exigirPapel(ctx, 'ContaBancaria', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(contaSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.contaBancaria.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'ContaBancaria',
      entidadeId: criada.id,
      diff: {
        banco: { de: null, para: criada.banco },
        numeroConta: { de: null, para: criada.numeroConta },
      },
    })

    return criada
  })
}

export async function listarContasBancarias(ctx: Ctx): Promise<ContaBancaria[]> {
  exigirPapel(ctx, 'ContaBancaria', 'COORDENACAO', 'ADMINISTRATIVO')

  return prisma.contaBancaria.findMany({
    where: { ativa: true },
    orderBy: [{ banco: 'asc' }, { numeroConta: 'asc' }],
  })
}

/**
 * Exclusão lógica: a conta some da lista, mas os lançamentos dela continuam no
 * histórico e nas prestações já entregues ao órgão.
 */
export async function desativarContaBancaria(ctx: Ctx, id: string): Promise<void> {
  exigirPapel(ctx, 'ContaBancaria', 'COORDENACAO', 'ADMINISTRATIVO')

  const atual = await prisma.contaBancaria.findUnique({ where: { id } })
  if (!atual || !atual.ativa) throw new ErroNaoEncontrado('Conta bancária não encontrada')

  await prisma.$transaction(async (tx) => {
    await tx.contaBancaria.update({ where: { id }, data: { ativa: false } })

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade: 'ContaBancaria',
      entidadeId: id,
      diff: { ativa: { de: true, para: false } },
    })
  })
}
