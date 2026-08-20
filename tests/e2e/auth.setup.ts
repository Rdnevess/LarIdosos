import { test as setup, expect } from '@playwright/test'
import {
  EMAIL_SEMENTE,
  SENHA_SEMENTE,
  EMAIL_SAUDE,
  SENHA_SAUDE,
} from './credenciais'

const ARQUIVO_SESSAO = 'tests/e2e/.sessao.json'
const ARQUIVO_SESSAO_SAUDE = 'tests/e2e/.sessao-saude.json'

setup('autentica como coordenação', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(EMAIL_SEMENTE)
  await page.getByLabel('Senha').fill(SENHA_SEMENTE)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
  await page.context().storageState({ path: ARQUIVO_SESSAO })
})

/**
 * Segunda sessão, no papel SAUDE. Metade da interface é condicionada a papel
 * e nunca foi executada por ninguém além da coordenação — foi lá que o
 * defeito do anexo clínico se escondeu.
 */
setup('autentica como saúde', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(EMAIL_SAUDE)
  await page.getByLabel('Senha').fill(SENHA_SAUDE)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
  await page.context().storageState({ path: ARQUIVO_SESSAO_SAUDE })
})
