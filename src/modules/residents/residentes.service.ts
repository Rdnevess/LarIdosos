import { Prisma } from '@prisma/client'
import type { Residente, StatusResidente } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { normalizarBusca } from '@/lib/busca'
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
  exigirPapel(ctx, 'Residente', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(novoResidenteSchema, dados)

  try {
    return await prisma.$transaction(async (tx) => {
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
  } catch (erro) {
    // O índice único do banco é quem barra; aqui a recusa vira frase de gente.
    //
    // Não há mais checagem antecipada. Um `findUnique` antes do `create` deixa
    // uma janela entre ler e escrever: duas telas salvando o mesmo CPF ao mesmo
    // tempo passariam as duas pela checagem, e só então uma bateria no índice —
    // com o erro cru do Prisma chegando a quem está cadastrando. Com um caminho
    // só, a janela não existe.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroValidacao('Já existe um residente com este CPF')
    }
    throw erro
  }
}

export async function obterResidente(ctx: Ctx, id: string): Promise<Residente> {
  exigirPapel(ctx, 'Residente', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const residente = await exigirResidente(id)

  // Sem `try`, de propósito: se a trilha não registrar quem olhou, o dado não
  // é devolvido. O registro é a contrapartida do acesso — ver a seção 8.1 do
  // design. É o oposto do `ACESSO_NEGADO`, que falha em silêncio porque lá não
  // há acesso a proteger.
  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'Residente',
    entidadeId: id,
    residenteId: id,
  })

  return residente
}

/**
 * Campos que a listagem devolve. Deliberadamente sem CPF, RG, CNS, benefício e
 * plano de saúde: a tela de lista não precisa deles, e devolvê-los exporia dado
 * sensível de trinta pessoas a cada busca. Quem precisa do cadastro completo
 * abre a ficha, e `obterResidente` audita esse acesso.
 */
const CAMPOS_LISTA = {
  id: true,
  nomeCompleto: true,
  nomeSocial: true,
  dataNascimento: true,
  dataAdmissao: true,
  quarto: true,
  leito: true,
  status: true,
} as const

export type ResidenteResumo = Pick<
  Residente,
  'id' | 'nomeCompleto' | 'nomeSocial' | 'dataNascimento' | 'dataAdmissao' | 'quarto' | 'leito' | 'status'
>

export async function listarResidentes(
  ctx: Ctx,
  filtro: { busca?: string; status?: StatusResidente } = {}
): Promise<ResidenteResumo[]> {
  exigirPapel(ctx, 'Residente', 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const where: Prisma.ResidenteWhereInput = {}
  if (filtro.status) where.status = filtro.status
  if (filtro.busca?.trim()) {
    // `busca` e gerada pelo banco: minusculas e sem acento. O termo passa pela
    // mesma normalizacao para que os dois lados falem a mesma lingua — sem isso,
    // procurar "José" nao acharia o "jose" ja normalizado da coluna.
    where.busca = { contains: normalizarBusca(filtro.busca) }
  }

  return prisma.residente.findMany({
    where,
    select: CAMPOS_LISTA,
    orderBy: [{ nomeCompleto: 'asc' }, { id: 'asc' }],
  })
}

export async function atualizarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoResidente
): Promise<Residente> {
  exigirPapel(ctx, 'Residente', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoResidenteSchema, dados)
  const atual = await exigirResidente(id)

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  try {
    return await prisma.$transaction(async (tx) => {
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
  } catch (erro) {
    // O índice único do banco é quem barra; aqui a recusa vira frase de gente.
    //
    // Não há mais checagem antecipada. Um `findUnique` antes do `create` deixa
    // uma janela entre ler e escrever: duas telas salvando o mesmo CPF ao mesmo
    // tempo passariam as duas pela checagem, e só então uma bateria no índice —
    // com o erro cru do Prisma chegando a quem está cadastrando. Com um caminho
    // só, a janela não existe.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroValidacao('Já existe um residente com este CPF')
    }
    throw erro
  }
}

export async function desligarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosDesligamento
): Promise<Residente> {
  exigirPapel(ctx, 'Residente', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(desligamentoSchema, dados)
  const atual = await exigirResidente(id)

  // "Já está desligado" para quem consta como falecido é uma frase que a
  // equipe teria de traduzir sozinha — e que soa como erro do sistema para
  // quem está registrando o óbito de novo por engano.
  if (atual.status === 'FALECIDO') {
    throw new ErroValidacao('Este residente já consta como falecido')
  }
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
      diff: calcularDiff(atual as unknown as Record<string, unknown>, entrada),
    })

    return atualizado
  })
}
