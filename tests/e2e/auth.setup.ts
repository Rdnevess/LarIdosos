import { test as setup, expect } from '@playwright/test'
import { EMAIL_SEMENTE, SENHA_SEMENTE } from './credenciais'

const ARQUIVO_SESSAO = 'tests/e2e/.sessao.json'

setup('autentica como coordenação', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(EMAIL_SEMENTE)
  await page.getByLabel('Senha').fill(SENHA_SEMENTE)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
  await page.context().storageState({ path: ARQUIVO_SESSAO })
})
