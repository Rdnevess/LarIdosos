import { beforeEach, afterAll } from 'vitest'
import { limparBanco, prisma } from './banco'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})
