import { beforeEach, afterAll } from 'vitest'
import { rm } from 'node:fs/promises'
import { limparBanco, prisma } from './banco'

beforeEach(async () => {
  await limparBanco()
  // Os testes de documento gravam arquivos de verdade. Sem esta limpeza o
  // diretório cresce a cada execução, guardando anexos de testes já esquecidos.
  await rm(process.env.UPLOADS_DIR ?? './data/uploads-test', {
    recursive: true,
    force: true,
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})
