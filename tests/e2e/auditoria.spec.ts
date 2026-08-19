import { test, expect } from '@playwright/test'

test('registra e mostra a criação de um residente, com rótulos em pt-BR', async ({ page }) => {
  const nome = `Auditoria Teste ${Date.now()}`

  // Gera um evento real de auditoria (CRIAR/Residente) passando pelo
  // fluxo de verdade, não inserindo direto no banco — é a própria página
  // de cadastro quem chama `registrarAuditoria`.
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  // A própria visita à ficha gera um segundo evento (VISUALIZAR/Residente).
  const idResidente = new URL(page.url()).pathname.split('/').pop()

  await page.goto('/auditoria')
  await page.getByLabel('Entidade').selectOption('Residente')
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page).toHaveURL(/entidade=Residente/)

  const linhaCriacao = page.locator('tbody tr', { hasText: idResidente! }).filter({
    hasText: 'Criação',
  })
  await expect(linhaCriacao).toBeVisible()
  // Rótulo em pt-BR na tela, não o valor cru do enum `AcaoAuditoria`.
  await expect(linhaCriacao).not.toContainText('CRIAR')
  await expect(linhaCriacao).toContainText('Residente')
  await expect(linhaCriacao).toContainText(`nomeCompleto: — → ${nome}`)

  const linhaVisualizacao = page.locator('tbody tr', { hasText: idResidente! }).filter({
    hasText: 'Visualização',
  })
  await expect(linhaVisualizacao).toBeVisible()
  await expect(linhaVisualizacao).not.toContainText('VISUALIZAR')
})

test('filtra por período e mostra o total e a página', async ({ page }) => {
  await page.goto('/auditoria')

  await expect(page.getByRole('heading', { name: 'Trilha de auditoria' })).toBeVisible()
  await expect(page.getByText(/registro\(s\) · página 1 de \d+/)).toBeVisible()

  // Um período totalmente no passado não tem nenhum evento gravado —
  // exercita o filtro de data e o estado vazio.
  // `exact: true` porque "Entidade" contém "de" como substring e o
  // casamento por rótulo do Playwright é por padrão parcial.
  await page.getByLabel('De', { exact: true }).fill('2000-01-01')
  await page.getByLabel('Até', { exact: true }).fill('2000-01-31')
  await page.getByRole('button', { name: 'Filtrar' }).click()

  await expect(page).toHaveURL(/de=2000-01-01/)
  await expect(page.getByText('0 registro(s) · página 1 de 1')).toBeVisible()
  await expect(page.getByText('Nenhum registro no filtro selecionado.')).toBeVisible()
})

test('a tabela rola dentro do próprio contêiner, sem empurrar a página', async ({ page }) => {
  await page.goto('/auditoria')

  // A tabela precisa de um ancestral com `overflow-x-auto`: no celular é ele
  // quem rola horizontalmente, não a página inteira.
  const contentor = page.locator('table').locator('xpath=ancestor::div[contains(@class, "overflow-x-auto")]')
  await expect(contentor).toHaveCount(1)
})
