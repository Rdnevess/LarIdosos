import { test, expect } from '@playwright/test'
import { SENHA_SEMENTE } from './credenciais'

/**
 * A tela de usuários é a única que muda credencial, e a conferência da senha
 * de quem troca não aparece em nenhum outro teste de ponta a ponta. O serviço
 * a cobre isolado; o que só se vê aqui é se o campo chega à ação com o `name`
 * que ela lê — um `name` errado no formulário passaria por toda a suíte de
 * unidade e só apareceria na mão de quem tentasse trocar uma senha.
 *
 * A conta alvo é criada pelo próprio teste. Trocar a senha da conta-semente
 * derrubaria a sessão que os demais testes reaproveitam.
 */
test('só troca a senha de outra conta com a senha de quem troca', async ({ page }) => {
  const nome = `Usuário Senha ${Date.now()}`
  const email = `senha.${Date.now()}@lar.local`

  await page.goto('/usuarios')
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Papel').selectOption('ADMINISTRATIVO')
  await page.getByLabel('Senha inicial (mínimo 8 caracteres)').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Criar usuário' }).click()

  const linha = page.locator('li', { hasText: nome })
  await expect(linha).toBeVisible()

  await linha.getByLabel('Sua senha atual').fill('chute-errado')
  await linha.getByLabel('Nova senha').fill('outra-senha-forte-456')
  await linha.getByRole('button', { name: 'Definir nova senha' }).click()

  await expect(linha.getByRole('alert')).toHaveText('Senha atual incorreta')

  await linha.getByLabel('Sua senha atual').fill(SENHA_SEMENTE)
  await linha.getByLabel('Nova senha').fill('outra-senha-forte-456')
  await linha.getByRole('button', { name: 'Definir nova senha' }).click()

  await expect(linha.getByRole('status')).toHaveText('Registro salvo.')
})
