import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { hashSenha } from '@/lib/senha'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoUsuarioSchema,
  atualizacaoUsuarioSchema,
  type DadosNovoUsuario,
  type DadosAtualizacaoUsuario,
} from './usuarios.schema'

const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  nome: true,
  papel: true,
  ativo: true,
  ultimoAcessoEm: true,
} as const

export type UsuarioPublico = {
  id: string
  email: string
  nome: string
  papel: 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO'
  ativo: boolean
  ultimoAcessoEm: Date | null
}

export async function criarUsuario(
  ctx: Ctx,
  dados: DadosNovoUsuario
): Promise<UsuarioPublico> {
  exigirPapel(ctx, 'COORDENACAO')
  const entrada = validar(novoUsuarioSchema, dados)

  const existente = await prisma.usuario.findUnique({ where: { email: entrada.email } })
  if (existente) {
    throw new ErroValidacao('Já existe um usuário com este e-mail')
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.usuario.create({
      data: {
        email: entrada.email,
        nome: entrada.nome,
        papel: entrada.papel,
        funcionarioId: entrada.funcionarioId,
        senhaHash: await hashSenha(entrada.senha),
        criadoPorId: ctx.usuarioId,
      },
      select: CAMPOS_PUBLICOS,
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Usuario',
      entidadeId: criado.id,
      diff: { email: { de: null, para: criado.email }, papel: { de: null, para: criado.papel } },
    })

    return criado
  })
}

export async function listarUsuarios(ctx: Ctx): Promise<UsuarioPublico[]> {
  exigirPapel(ctx, 'COORDENACAO')
  return prisma.usuario.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  })
}

export async function atualizarUsuario(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoUsuario
): Promise<UsuarioPublico> {
  exigirPapel(ctx, 'COORDENACAO')
  const entrada = validar(atualizacaoUsuarioSchema, dados)

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.usuario.update({
      where: { id },
      data: entrada,
      select: CAMPOS_PUBLICOS,
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff,
    })

    return atualizado
  })
}

export async function definirSenha(
  ctx: Ctx,
  id: string,
  novaSenha: string
): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO')
  if (novaSenha.length < 8) {
    throw new ErroValidacao('A senha deve ter ao menos 8 caracteres')
  }

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: { senhaHash: await hashSenha(novaSenha), senhaAlteradaEm: new Date() },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff: { senha: { de: '(oculto)', para: '(alterada)' } },
    })
  })
}

export async function desativarUsuario(ctx: Ctx, id: string): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO')

  if (id === ctx.usuarioId) {
    throw new ErroValidacao('Não é possível desativar o próprio usuário')
  }

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { ativo: false } })
    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff: { ativo: { de: true, para: false } },
    })
  })
}
