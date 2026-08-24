import type { Papel, Residente, Usuario } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashSenha } from '@/lib/senha'
import type { Ctx } from '@/lib/contexto'

let contador = 0

/**
 * A senha de toda conta criada por `criarUsuarioDeTeste`. Exportada porque
 * `definirSenha` passou a exigir a senha de quem troca: o teste precisa saber
 * qual é a do `ctx` que ele mesmo fabricou.
 */
export const SENHA_DE_TESTE = 'senha-de-teste-123'

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
      senhaHash: await hashSenha(SENHA_DE_TESTE),
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

export async function criarResidenteDeTeste(
  overrides: Partial<{ nomeCompleto: string; quarto: string; cpf: string | null }> = {}
): Promise<Residente> {
  contador += 1
  return prisma.residente.create({
    data: {
      nomeCompleto: overrides.nomeCompleto ?? `Residente ${contador}`,
      dataNascimento: new Date('1940-01-01'),
      sexo: 'FEMININO',
      dataAdmissao: new Date('2026-01-01'),
      quarto: overrides.quarto ?? '1',
      cpf: overrides.cpf ?? null,
    },
  })
}
