import { test, expect } from '@playwright/test'

test('recusa credenciais inválidas', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()

  // O App Router do Next.js injeta em toda página um anunciador de rota
  // (`#__next-route-announcer__`) que também usa `role="alert"`, ainda que
  // vazio. Filtramos pelo texto para mirar no alerta do formulário, não no
  // anunciador do framework.
  const alerta = page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos.' })
  await expect(alerta).toHaveText('E-mail ou senha incorretos.')
})

test('entra com credenciais válidas e redireciona', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
})

test('redireciona visitante não autenticado para o login', async ({ page }) => {
  await page.goto('/residentes')
  await expect(page).toHaveURL(/\/login/)
})
