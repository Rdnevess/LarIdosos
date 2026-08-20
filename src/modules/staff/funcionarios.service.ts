import type { Funcionario, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoFuncionarioSchema,
  atualizacaoFuncionarioSchema,
  desligamentoFuncionarioSchema,
  type DadosNovoFuncionario,
  type DadosAtualizacaoFuncionario,
  type DadosDesligamentoFuncionario,
} from './funcionarios.schema'

async function exigirFuncionario(id: string): Promise<Funcionario> {
  const funcionario = await prisma.funcionario.findUnique({ where: { id } })
  if (!funcionario) throw new ErroNaoEncontrado('Funcionário não encontrado')
  return funcionario
}

export async function criarFuncionario(
  ctx: Ctx,
  dados: DadosNovoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(novoFuncionarioSchema, dados)

  const existente = await prisma.funcionario.findUnique({ where: { cpf: entrada.cpf } })
  if (existente) throw new ErroValidacao('Já existe um funcionário com este CPF')

  return prisma.$transaction(async (tx) => {
    const criado = await tx.funcionario.create({
      data: { ...entrada, email: entrada.email || null, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Funcionario',
      entidadeId: criado.id,
      diff: { nomeCompleto: { de: null, para: criado.nomeCompleto } },
    })

    return criado
  })
}

/**
 * Audita a visualização: devolve o cadastro completo (CPF, RG, endereço) de
 * UMA pessoa, o mesmo critério que `obterResidente` já aplica. `listarFuncionarios`
 * não precisa desse rastro porque seus campos já são reduzidos — aqui não há
 * minimização possível, quem abre a ficha vê o dado sensível inteiro.
 */
export async function obterFuncionario(ctx: Ctx, id: string): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const funcionario = await exigirFuncionario(id)

  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'Funcionario',
    entidadeId: id,
  })

  return funcionario
}

/**
 * Campos da tela de lista. Sem CPF, RG, endereço nem contatos: a listagem
 * aponta para a pessoa, quem precisa do cadastro completo abre a ficha. Mesmo
 * critério aplicado a `listarResidentes`.
 */
const CAMPOS_LISTA_FUNCIONARIO = {
  id: true,
  nomeCompleto: true,
  cargo: true,
  vinculo: true,
  dataAdmissao: true,
  dataDesligamento: true,
  ativo: true,
} as const

export type FuncionarioResumo = Pick<
  Funcionario,
  'id' | 'nomeCompleto' | 'cargo' | 'vinculo' | 'dataAdmissao' | 'dataDesligamento' | 'ativo'
>

export async function listarFuncionarios(
  ctx: Ctx,
  filtro: { busca?: string; apenasAtivos?: boolean } = {}
): Promise<FuncionarioResumo[]> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')

  const where: Prisma.FuncionarioWhereInput = {}
  if (filtro.apenasAtivos) where.ativo = true
  if (filtro.busca?.trim()) {
    where.OR = [
      { nomeCompleto: { contains: filtro.busca.trim(), mode: 'insensitive' } },
      { cargo: { contains: filtro.busca.trim(), mode: 'insensitive' } },
    ]
  }

  return prisma.funcionario.findMany({
    where,
    select: CAMPOS_LISTA_FUNCIONARIO,
    orderBy: [{ nomeCompleto: 'asc' }, { id: 'asc' }],
  })
}

export async function atualizarFuncionario(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoFuncionarioSchema, dados)
  const atual = await exigirFuncionario(id)

  if (entrada.cpf && entrada.cpf !== atual.cpf) {
    const existente = await prisma.funcionario.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um funcionário com este CPF')
  }

  // Mantém a invariante de `criarFuncionario` (linha 34) para chamadores que
  // passem `entrada.email === ''`. A tela hoje não passa: `dadosDoFuncionario`
  // usa `texto()`, que devolve `undefined` para campo em branco, e
  // `semIndefinidos` omite a chave — por isso limpar o e-mail pela tela
  // também não é possível hoje (ver `src/lib/formulario.ts`). Se algum dia um
  // chamador passar `''` diretamente, a normalização precisa vir ANTES do
  // diff, senão a trilha registraria "E-mail: — → —".
  const gravavel = entrada.email === '' ? { ...entrada, email: null } : entrada

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, gravavel)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.funcionario.update({ where: { id }, data: gravavel })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Funcionario',
      entidadeId: id,
      diff,
    })

    return atualizado
  })
}

export async function desligarFuncionario(
  ctx: Ctx,
  id: string,
  dados: DadosDesligamentoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(desligamentoFuncionarioSchema, dados)
  const atual = await exigirFuncionario(id)

  if (!atual.ativo) throw new ErroValidacao('Este funcionário já está desligado')
  if (entrada.dataDesligamento < atual.dataAdmissao) {
    throw new ErroValidacao('A data de desligamento não pode ser anterior à admissão')
  }

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.funcionario.update({
      where: { id },
      data: { ...entrada, ativo: false },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Funcionario',
      entidadeId: id,
      diff: { ativo: { de: atual.ativo, para: false } },
    })

    return atualizado
  })
}

/**
 * Não audita, ao contrário de `listarAnotacoes`. É relatório operacional
 * multi-pessoa, com campos já reduzidos: sigla, número, UF e validade de
 * registro profissional são dados verificáveis no cadastro público do próprio
 * conselho, não a categoria que o resto do módulo trata como sensível (CPF, RG,
 * endereço — todos fora do `select`). Cai na regra geral de listagem, não na
 * exceção.
 */
export type ConselhoVencendo = Pick<
  Funcionario,
  'id' | 'nomeCompleto' | 'conselhoSigla' | 'conselhoNumero' | 'conselhoUf' | 'conselhoValidade'
>

export async function listarConselhosVencendo(
  ctx: Ctx,
  ateDias: number
): Promise<ConselhoVencendo[]> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')

  const limite = new Date(Date.now() + ateDias * 86_400_000)

  return prisma.funcionario.findMany({
    where: { ativo: true, conselhoValidade: { not: null, lte: limite } },
    select: {
      id: true,
      nomeCompleto: true,
      conselhoSigla: true,
      conselhoNumero: true,
      conselhoUf: true,
      conselhoValidade: true,
    },
    orderBy: [{ conselhoValidade: 'asc' }, { id: 'asc' }],
  })
}
