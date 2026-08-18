import type { Prisma, Residente, StatusResidente } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoResidenteSchema,
  atualizacaoResidenteSchema,
  desligamentoSchema,
  type DadosNovoResidente,
  type DadosAtualizacaoResidente,
  type DadosDesligamento,
} from './residentes.schema'

async function exigirResidente(id: string): Promise<Residente> {
  const residente = await prisma.residente.findUnique({ where: { id } })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
  return residente
}

export async function criarResidente(
  ctx: Ctx,
  dados: DadosNovoResidente
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(novoResidenteSchema, dados)

  if (entrada.cpf) {
    const existente = await prisma.residente.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um residente com este CPF')
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.residente.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Residente',
      entidadeId: criado.id,
      residenteId: criado.id,
      diff: { nomeCompleto: { de: null, para: criado.nomeCompleto } },
    })

    return criado
  })
}

export async function obterResidente(ctx: Ctx, id: string): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const residente = await exigirResidente(id)

  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'Residente',
    entidadeId: id,
    residenteId: id,
  })

  return residente
}

export async function listarResidentes(
  ctx: Ctx,
  filtro: { busca?: string; status?: StatusResidente } = {}
): Promise<Residente[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const where: Prisma.ResidenteWhereInput = {}
  if (filtro.status) where.status = filtro.status
  if (filtro.busca?.trim()) {
    where.OR = [
      { nomeCompleto: { contains: filtro.busca.trim(), mode: 'insensitive' } },
      { nomeSocial: { contains: filtro.busca.trim(), mode: 'insensitive' } },
    ]
  }

  return prisma.residente.findMany({ where, orderBy: { nomeCompleto: 'asc' } })
}

export async function atualizarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoResidente
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoResidenteSchema, dados)
  const atual = await exigirResidente(id)

  if (entrada.cpf && entrada.cpf !== atual.cpf) {
    const existente = await prisma.residente.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um residente com este CPF')
  }

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.residente.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Residente',
      entidadeId: id,
      residenteId: id,
      diff,
    })

    return atualizado
  })
}

export async function desligarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosDesligamento
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(desligamentoSchema, dados)
  const atual = await exigirResidente(id)

  if (atual.status !== 'ATIVO') {
    throw new ErroValidacao('Este residente já está desligado')
  }
  if (entrada.dataSaida < atual.dataAdmissao) {
    throw new ErroValidacao('A data de saída não pode ser anterior à admissão')
  }

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.residente.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Residente',
      entidadeId: id,
      residenteId: id,
      diff: { status: { de: atual.status, para: entrada.status } },
    })

    return atualizado
  })
}
