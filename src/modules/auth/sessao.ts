import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import type { Ctx } from '@/lib/contexto'
import { dispararRegistroDeAcessoNegado } from '@/modules/audit/acesso-negado'
import { auth } from './config'

export async function obterCtx(): Promise<Ctx> {
  const sessao = await auth()
  if (!sessao?.user?.id) {
    throw new ErroPermissao('Sessão inválida')
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sessao.user.id } })
  if (!usuario || !usuario.ativo) {
    // Conta desativada que ainda apresenta token válido é evento forense: quem
    // perdeu o acesso continua batendo na porta. O e-mail sai do banco quando a
    // conta existe; quando o token aponta para um id que não existe mais, resta
    // o que a própria sessão carrega.
    dispararRegistroDeAcessoNegado(
      {
        usuarioId: sessao.user.id,
        email: usuario?.email ?? sessao.user.email ?? '(desconhecido)',
        papel: usuario?.papel ?? null,
      },
      'Usuario'
    )
    throw new ErroPermissao('Sessão inválida')
  }

  // Daqui para baixo a conta existe e está ativa, então a negação sempre sabe
  // quem tentou.
  const ator = { usuarioId: usuario.id, email: usuario.email, papel: usuario.papel }

  // Falha fechada: sem carimbo de emissão não há como comparar com a troca de
  // senha, e uma comparação contra `undefined` seria sempre falsa — aceitaria a
  // sessão justamente no ponto que existe para recusá-la.
  if (typeof sessao.emitidoEm !== 'number') {
    dispararRegistroDeAcessoNegado(ator, 'Usuario')
    throw new ErroPermissao('Sessão inválida')
  }

  const senhaAlteradaEmSegundos = Math.floor(usuario.senhaAlteradaEm.getTime() / 1000)
  if (senhaAlteradaEmSegundos > sessao.emitidoEm) {
    // O caso clássico: a senha foi trocada porque alguém suspeitou de invasão, e
    // o token antigo continua sendo apresentado. Sem registro, a trilha não
    // guardaria a única evidência de que a suspeita procedia.
    dispararRegistroDeAcessoNegado(ator, 'Usuario')
    throw new ErroPermissao('Sessão inválida')
  }

  const cabecalhos = await headers()

  return {
    usuarioId: usuario.id,
    email: usuario.email,
    papel: usuario.papel,
    ip: cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: cabecalhos.get('user-agent') ?? undefined,
  }
}

export async function obterCtxOuNulo(): Promise<Ctx | null> {
  try {
    return await obterCtx()
  } catch {
    return null
  }
}
