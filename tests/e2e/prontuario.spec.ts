import { test, expect, type Page } from '@playwright/test'

async function cadastrarResidente(page: Page, nome: string): Promise<void> {
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1938-05-20')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-10')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
}

test('a coordenação abre o prontuário e vê o cabeçalho clínico', async ({ page }) => {
  const nome = `Idosa Prontuario ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.getByRole('link', { name: 'Prontuário' }).click()

  await expect(page).toHaveURL(/\/prontuario$/)
  await expect(page.getByRole('heading', { name: /Prontuário/ })).toBeVisible()

  // Lista vazia mostra frase própria, nunca um bloco em branco: bloco em
  // branco na tela clínica se lê como "não tem", e a diferença entre "não
  // tem" e "ninguém registrou" é grande.
  await expect(page.getByText('Nenhuma alergia registrada.')).toBeVisible()
  await expect(page.getByText('Nenhuma condição crônica registrada.')).toBeVisible()
  await expect(page.getByText('Nenhuma restrição alimentar registrada.')).toBeVisible()
})

test('registra alergia grave e ela aparece destacada no cabeçalho', async ({ page }) => {
  const nome = `Idosa Alergia ${Date.now()}`
  await cadastrarResidente(page, nome)
  await page.getByRole('link', { name: 'Prontuário' }).click()

  await page.locator('summary').filter({ hasText: 'Alergias' }).click()
  await page.getByLabel('Agente').fill('Dipirona')
  await page.getByLabel('Tipo').selectOption('MEDICAMENTO')
  await page.getByLabel('Gravidade').selectOption('GRAVE')
  await page.getByLabel('Reação').fill('Edema de glote')
  await page.getByRole('button', { name: 'Registrar alergia' }).click()

  const cabecalho = page.getByRole('region', { name: 'Cabeçalho clínico' })
  await expect(cabecalho).toContainText('Dipirona')
  await expect(cabecalho).toContainText('Edema de glote')
})
