import { PrismaClient } from '@prisma/client'
import { hashSenha, verificarSenha } from '../../src/lib/senha'
import { EMAIL_SEMENTE, SENHA_SEMENTE } from './credenciais'

/**
 * Garante o usuário-semente antes da suíte: sem isto o E2E dependeria de um
 * `npm run db:seed` manual e falharia numa máquina recém-clonada.
 *
 * Roda fora do Next, que é quem normalmente carrega o `.env` — daí a carga
 * explícita. Se `DATABASE_URL` já veio do ambiente, ela vence: o `.env` não
 * pode sequestrar uma execução apontada de propósito para outro banco.
 */
export default async function garantirUsuarioSemente(): Promise<void> {
  if (!process.env.DATABASE_URL) process.loadEnvFile('.env')

  const prisma = new PrismaClient()

  try {
    const existente = await prisma.usuario.findUnique({ where: { email: EMAIL_SEMENTE } })

    if (!existente) {
      await prisma.usuario.create({
        data: {
          email: EMAIL_SEMENTE,
          nome: 'Coordenação',
          papel: 'COORDENACAO',
          senhaHash: await hashSenha(SENHA_SEMENTE),
        },
      })
      return
    }

    // Conta desativada ou com outra senha derrubaria o login do `auth.setup`
    // com uma falha que não é do sistema, e sim do estado do banco.
    const senhaConfere = await verificarSenha(existente.senhaHash, SENHA_SEMENTE)
    if (!existente.ativo || existente.papel !== 'COORDENACAO' || !senhaConfere) {
      await prisma.usuario.update({
        where: { id: existente.id },
        data: {
          ativo: true,
          papel: 'COORDENACAO',
          senhaHash: senhaConfere ? existente.senhaHash : await hashSenha(SENHA_SEMENTE),
        },
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}
