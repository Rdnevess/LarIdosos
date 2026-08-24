import { test, expect } from '@playwright/test'
import { EMAIL_ADMINISTRATIVO, EMAIL_SEMENTE } from './credenciais'

/**
 * A fronteira da §7 do design exercitada por onde ela seria furada: pela URL.
 *
 * O ADMINISTRATIVO não vê o link do prontuário, mas esconder não é permissão.
 * Este é o único teste que prova que o serviço recusa, que a recusa chega ao
 * usuário em português sem vazar exceção interna, e que ela deixa rastro na
 * trilha — as três coisas que a Fase 2A prometeu.
 */
test('a rota do prontuário digitada na URL recusa o ADMINISTRATIVO, e a trilha registra', async ({
  page,
  browser,
}) => {
  const nome = `Idosa Fronteira ${Date.now()}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1939-09-09')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-02-02')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  // A ficha cadastral abre normalmente: é o prontuário que está fora do
  // alcance, não o residente.
  await expect(page.getByRole('link', { name: 'Prontuário' })).toHaveCount(0)

  const url = page.url()
  await page.goto(`${url}/prontuario`)

  await expect(
    page.getByRole('heading', { name: /Não foi possível abrir esta tela/ })
  ).toBeVisible()
  // Nada de mensagem de exceção interna vazando para a tela.
  await expect(page.getByText(/ErroPermissao|Prisma|at Object/)).toHaveCount(0)

  // A área de pendências é do mesmo lado da fronteira.
  await page.goto('/pendencias')
  await expect(
    page.getByRole('heading', { name: /Não foi possível abrir esta tela/ })
  ).toBeVisible()

  // E a trilha registra as tentativas — o sinal que a LGPD (art. 11) torna
  // relevante para dado de saúde.
  const coordenacao = await browser.newContext({
    storageState: 'tests/e2e/.sessao.json',
    baseURL: 'http://localhost:3000',
  })
  const paginaCoordenacao = await coordenacao.newPage()
  await paginaCoordenacao.goto('/auditoria')
  await paginaCoordenacao.getByLabel('Entidade').selectOption('AnotacaoSaude')
  await paginaCoordenacao.getByRole('button', { name: 'Filtrar' }).click()

  const linha = paginaCoordenacao
    .locator('tbody tr', { hasText: EMAIL_ADMINISTRATIVO })
    .filter({ hasText: 'Acesso negado' })
    .first()
  await expect(linha).toBeVisible()
  await expect(linha).toContainText('Papel: — → Administrativo')

  // A coordenação, no mesmo instante, alcança o prontuário sem tropeço — a
  // recusa é do papel, não da tela.
  await paginaCoordenacao.goto(`${url}/prontuario`)
  await expect(
    paginaCoordenacao.getByRole('heading', { name: /Prontuário/ })
  ).toBeVisible()
  expect(EMAIL_SEMENTE).not.toBe(EMAIL_ADMINISTRATIVO)
  await coordenacao.close()
})
