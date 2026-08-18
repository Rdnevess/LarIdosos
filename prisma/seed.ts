import { PrismaClient } from '@prisma/client'
import { hashSenha } from '../src/lib/senha'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'coordenacao@lar.local'
  const senha = process.env.SEED_ADMIN_SENHA ?? 'trocar-esta-senha-123'

  const existente = await prisma.usuario.findUnique({ where: { email } })
  if (existente) {
    console.log(`Usuário ${email} já existe; nada a fazer.`)
    return
  }

  await prisma.usuario.create({
    data: {
      email,
      nome: 'Coordenação',
      papel: 'COORDENACAO',
      senhaHash: await hashSenha(senha),
    },
  })

  console.log(`Usuário inicial criado: ${email}`)
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
