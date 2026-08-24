import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { hashSenha, verificarSenha } from '@/lib/senha'
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

  // Mesma família da recusa de auto-alvo em `desativarUsuario`, e com
  // consequência pior: a única conta de coordenação — a situação garantida
  // logo depois da implantação — que se rebaixasse a SAUDE deixaria o sistema
  // sem ninguém capaz de abrir `/usuarios`, e sem caminho de volta pela tela.
  // Só o banco desfaria.
  //
  // A recusa é da **mudança**, não do campo: o formulário de edição manda
  // `papel` sempre, e corrigir o próprio nome precisa continuar possível.
  if (id === ctx.usuarioId && entrada.papel && entrada.papel !== atual.papel) {
    throw new ErroValidacao('Não é possível trocar o próprio papel')
  }

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

/**
 * `senhaAtual` é a senha de **quem troca**, não a do alvo. É o que transforma
 * "estar com a sessão aberta" em "saber a senha", e o motivo de a conferência
 * existir: a sessão é um JWT de 12 horas sem timeout de inatividade
 * (`auth.config.ts`), então a tela deixada aberta na mesa da coordenação valia,
 * até aqui, poder de trocar a senha de qualquer conta — inclusive uma do papel
 * SAUDE, que enxerga evolução clínica.
 *
 * Conferir a senha do alvo não serviria: a senha inicial de uma conta recém
 * criada aparece em texto plano na própria tela de usuários, para quem a criou.
 *
 * A checagem vem antes de procurar o alvo de propósito. Quem erra a própria
 * senha recebe "Senha atual incorreta" mesmo com um id inexistente, e não
 * descobre pela mensagem quais contas existem.
 */
export async function definirSenha(
  ctx: Ctx,
  id: string,
  novaSenha: string,
  senhaAtual: string
): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO')
  if (novaSenha.length < 8) {
    throw new ErroValidacao('A senha deve ter ao menos 8 caracteres')
  }

  const autor = await prisma.usuario.findUnique({ where: { id: ctx.usuarioId } })
  if (!autor || !(await verificarSenha(autor.senhaHash, senhaAtual))) {
    throw new ErroValidacao('Senha atual incorreta')
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
      diff: { ativo: { de: atual.ativo, para: false } },
    })
  })
}
