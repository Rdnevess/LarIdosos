import type { Papel, Usuario } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashSenha } from '@/lib/senha'
import type { Ctx } from '@/lib/contexto'

let contador = 0

export async function criarUsuarioDeTeste(
  overrides: Partial<{ email: string; nome: string; papel: Papel; ativo: boolean }> = {}
): Promise<Usuario> {
  contador += 1
  return prisma.usuario.create({
    data: {
      email: overrides.email ?? `usuario${contador}@lar.local`,
      nome: overrides.nome ?? `Usuário ${contador}`,
      papel: overrides.papel ?? 'COORDENACAO',
      ativo: overrides.ativo ?? true,
      senhaHash: await hashSenha('senha-de-teste-123'),
    },
  })
}

export function ctxDe(usuario: Usuario): Ctx {
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    papel: usuario.papel,
    ip: '127.0.0.1',
    userAgent: 'vitest',
  }
}

export async function ctxComPapel(papel: Papel): Promise<Ctx> {
  return ctxDe(await criarUsuarioDeTeste({ papel }))
}
