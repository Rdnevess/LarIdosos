import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import type { Ctx } from '@/lib/contexto'
import { auth } from './config'

export async function obterCtx(): Promise<Ctx> {
  const sessao = await auth()
  if (!sessao?.user?.id) {
    throw new ErroPermissao('Sessão inválida')
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sessao.user.id } })
  if (!usuario || !usuario.ativo) {
    throw new ErroPermissao('Sessão inválida')
  }

  // Falha fechada: sem carimbo de emissão não há como comparar com a troca de
  // senha, e uma comparação contra `undefined` seria sempre falsa — aceitaria a
  // sessão justamente no ponto que existe para recusá-la.
  if (typeof sessao.emitidoEm !== 'number') {
    throw new ErroPermissao('Sessão inválida')
  }

  const senhaAlteradaEmSegundos = Math.floor(usuario.senhaAlteradaEm.getTime() / 1000)
  if (senhaAlteradaEmSegundos > sessao.emitidoEm) {
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
