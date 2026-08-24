import { test as setup, expect } from '@playwright/test'
import {
  EMAIL_SEMENTE,
  SENHA_SEMENTE,
  EMAIL_ADMINISTRATIVO,
  EMAIL_SAUDE,
  SENHA_ADMINISTRATIVO,
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

/**
 * Terceira sessão, no papel ADMINISTRATIVO. A Fase 2A pôs o prontuário
 * inteiro fora do alcance dele, e uma fronteira que nenhum teste atravessa é
 * uma fronteira que ninguém sabe se existe.
 */
setup('autentica como administrativo', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(EMAIL_ADMINISTRATIVO)
  await page.getByLabel('Senha').fill(SENHA_ADMINISTRATIVO)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
  await page.context().storageState({ path: 'tests/e2e/.sessao-administrativo.json' })
})
