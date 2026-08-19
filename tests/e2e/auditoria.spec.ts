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
  // O nome do campo também é traduzido: `nomeCompleto` vira "Nome completo".
  await expect(linhaCriacao).toContainText(`Nome completo: — → ${nome}`)

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

test('traduz o valor booleano da desativação de um usuário, sem vazar true/false em inglês', async ({
  page,
}) => {
  const nome = `Usuário Auditoria ${Date.now()}`
  const email = `auditoria.${Date.now()}@lar.local`

  // Gera um evento real de auditoria (ATUALIZAR/Usuario com
  // `ativo: { de: true, para: false }`) passando pelo fluxo de verdade — é a
  // própria tela de usuários quem chama `desativarUsuario`, cujo diff é
  // exatamente o caso que a coluna "Alteração" vazava em inglês antes desta
  // correção.
  await page.goto('/usuarios')
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Papel').selectOption('ADMINISTRATIVO')
  await page.getByLabel('Senha inicial (mínimo 8 caracteres)').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Criar usuário' }).click()

  const linhaUsuario = page.locator('li', { hasText: nome })
  await expect(linhaUsuario).toBeVisible()
  const idUsuario = await linhaUsuario.locator('input[name="id"]').first().getAttribute('value')

  await linhaUsuario.getByRole('button', { name: 'Desativar acesso' }).click()
  await expect(page.locator('li', { hasText: nome })).toContainText('(inativo)')

  await page.goto('/auditoria')
  await page.getByLabel('Entidade').selectOption('Usuario')
  await page.getByRole('button', { name: 'Filtrar' }).click()

  const linhaDesativacao = page
    .locator('tbody tr', { hasText: idUsuario! })
    .filter({ hasText: 'Atualização' })
  await expect(linhaDesativacao).toBeVisible()
  await expect(linhaDesativacao).toContainText('Ativo: sim → não')
  await expect(linhaDesativacao).not.toContainText('true')
  await expect(linhaDesativacao).not.toContainText('false')
})

test('a tabela rola dentro do próprio contêiner, sem empurrar a página', async ({ page }) => {
  await page.goto('/auditoria')

  // A tabela precisa de um ancestral com `overflow-x-auto`: no celular é ele
  // quem rola horizontalmente, não a página inteira.
  const contentor = page.locator('table').locator('xpath=ancestor::div[contains(@class, "overflow-x-auto")]')
  await expect(contentor).toHaveCount(1)
})
