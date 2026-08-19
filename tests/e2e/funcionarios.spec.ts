import { test, expect, type Page } from '@playwright/test'

// O App Router injeta em toda página um anunciador de rota
// (`#__next-route-announcer__`) que também usa `role="alert"`, ainda que vazio.
// Filtrar pelo texto mira no alerta do formulário, não no do framework — mesmo
// ajuste que `residentes.spec.ts` precisou.
function alertaCom(page: Page, texto: string) {
  return page.getByRole('alert').filter({ hasText: texto })
}

function calcularDigitoVerificador(digitos: number[]): number {
  let soma = 0
  let peso = digitos.length + 1
  for (const digito of digitos) soma += digito * peso--
  const resto = (soma * 10) % 11
  return resto === 10 ? 0 : resto
}

/**
 * Gera um CPF com dígitos verificadores válidos a partir de uma semente. A
 * suíte grava no banco de desenvolvimento (não um banco efêmero por execução —
 * ver `global-setup.ts`), então um CPF fixo como o do brief original funciona
 * na primeira rodada e falha em todas as seguintes, porque o CPF já existe.
 * A semente muda a cada execução (`Date.now()`), o que evita a colisão.
 */
function gerarCpfValido(semente: number): string {
  const base = String(semente).slice(-9).padStart(9, '1').split('').map(Number)
  const d1 = calcularDigitoVerificador(base)
  const d2 = calcularDigitoVerificador([...base, d1])
  return [...base, d1, d2].join('')
}

// Os dois testes usam o mesmo CPF de propósito — o segundo depende do
// primeiro ter rodado antes e cadastrado esse CPF. O Playwright executa os
// testes de um arquivo na ordem em que aparecem.
const CPF_TESTE = gerarCpfValido(Date.now())

test('cadastra funcionário com registro de conselho', async ({ page }) => {
  const nome = `Ana Teste ${Date.now()}`

  await page.goto('/funcionarios/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('CPF').fill(CPF_TESTE)
  await page.getByLabel('Cargo').fill('Técnica de enfermagem')
  await page.getByLabel('Vínculo').selectOption('CLT')
  await page.getByLabel('Data de admissão').fill('2025-02-01')
  await page.getByRole('button', { name: 'Cadastrar funcionário' }).click()

  await expect(page.getByText(nome)).toBeVisible()
})

test('recusa CPF duplicado com mensagem clara', async ({ page }) => {
  await page.goto('/funcionarios/novo')
  await page.getByLabel('Nome completo').fill('Outro Nome Qualquer')
  await page.getByLabel('CPF').fill(CPF_TESTE)
  await page.getByLabel('Cargo').fill('Auxiliar')
  await page.getByLabel('Vínculo').selectOption('CLT')
  await page.getByLabel('Data de admissão').fill('2025-02-01')
  await page.getByRole('button', { name: 'Cadastrar funcionário' }).click()

  await expect(alertaCom(page, 'Já existe um funcionário com este CPF')).toBeVisible()
})
