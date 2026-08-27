import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * A travessia que só a tela prova: o alerta aparece, é dispensado, e some.
 *
 * O residente e a aferição são criados direto pelo Prisma — cadastrá-los pela
 * interface levaria minutos e não testaria nada que `prontuario.spec.ts` já não
 * teste. O prefixo permite filtrá-los e, no fim, apagá-los sem tocar em mais
 * nada do banco de desenvolvimento, que é compartilhado entre execuções.
 */
const PREFIXO = 'ZZAlerta'
const prisma = new PrismaClient()

async function limpar(): Promise<void> {
  await prisma.alertaDispensado.deleteMany({
    where: { sinalVital: { residente: { nomeCompleto: { startsWith: PREFIXO } } } },
  })
  await prisma.faixaReferencia.deleteMany({
    where: { residente: { nomeCompleto: { startsWith: PREFIXO } } },
  })
  await prisma.sinalVital.deleteMany({
    where: { residente: { nomeCompleto: { startsWith: PREFIXO } } },
  })
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })
}

test.beforeAll(async () => {
  await limpar()

  const residente = await prisma.residente.create({
    data: {
      nomeCompleto: `${PREFIXO} Maria`,
      dataNascimento: new Date('1940-01-01'),
      sexo: 'FEMININO',
      dataAdmissao: new Date('2026-01-01'),
    },
  })
  await prisma.sinalVital.create({
    data: { residenteId: residente.id, aferidoEm: new Date(), pressaoSistolica: 200 },
  })
})

test.afterAll(async () => {
  await limpar()
  await prisma.$disconnect()
})

test('o alerta aparece nas pendências e some ao ser dispensado', async ({ page }) => {
  await page.goto('/pendencias')

  const linha = page.locator('li', { hasText: `${PREFIXO} Maria` })
  await expect(linha).toContainText('Pressão sistólica')
  await expect(linha).toContainText('200')
  // A faixa aparece junto do valor: sem ela, "200" não diz se é muito.
  await expect(linha).toContainText('90–140')

  await linha.getByRole('button', { name: 'Dispensar' }).click()

  await expect(page.locator('li', { hasText: `${PREFIXO} Maria` })).toHaveCount(0)
})

test('ajustar a faixa do residente tira o alerta dele', async ({ page }) => {
  // O hipertenso conhecido: a coordenação sobe a faixa dele e o alerta diário
  // some, sem afrouxar a faixa de todo mundo. É o ciclo inteiro da
  // funcionalidade, e o único lugar onde ele é exercitado de ponta a ponta.
  const residente = await prisma.residente.findFirstOrThrow({
    where: { nomeCompleto: { startsWith: PREFIXO } },
  })

  // Uma aferição nova, porque a do primeiro teste foi dispensada.
  await prisma.sinalVital.create({
    data: { residenteId: residente.id, aferidoEm: new Date(), pressaoSistolica: 205 },
  })

  await page.goto('/pendencias')
  await expect(page.locator('li', { hasText: `${PREFIXO} Maria` })).toHaveCount(1)

  await page.goto(`/residentes/${residente.id}/faixas`)
  await page.getByLabel('Pressão sistólica — mínimo').fill('90')
  await page.getByLabel('Pressão sistólica — máximo').fill('210')
  await page.getByRole('button', { name: 'Salvar faixas' }).click()
  await expect(page.getByRole('status')).toHaveText('Registro salvo.')

  await page.goto('/pendencias')
  await expect(page.locator('li', { hasText: `${PREFIXO} Maria` })).toHaveCount(0)
})
