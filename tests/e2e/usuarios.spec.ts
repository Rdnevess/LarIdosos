import { test, expect, type Page } from '@playwright/test'
import { EMAIL_SEMENTE, SENHA_SEMENTE } from './credenciais'

/**
 * Sempre pelo nome da região: cada linha da lista tem um formulário de edição
 * com os mesmos rótulos "Nome" e "Papel", e um `getByLabel` solto na página
 * seria ambíguo.
 */
async function criarUsuario(
  page: Page,
  nome: string,
  email: string,
  papel: 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO'
): Promise<void> {
  const novoUsuario = page.getByRole('region', { name: 'Novo usuário' })
  await novoUsuario.getByLabel('Nome').fill(nome)
  await novoUsuario.getByLabel('E-mail').fill(email)
  await novoUsuario.getByLabel('Papel').selectOption(papel)
  await novoUsuario.getByLabel('Senha inicial (mínimo 8 caracteres)').fill('senha-de-teste-123')
  await novoUsuario.getByRole('button', { name: 'Criar usuário' }).click()
  // Esperar a confirmação, e não só clicar: quem navega em seguida corre
  // contra a Server Action, e a conta ainda não existe quando a próxima tela
  // carrega. Antes da paginação isto não aparecia — a asserção seguinte
  // ficava na mesma página e esperava sozinha.
  await expect(novoUsuario.getByRole('status')).toHaveText('Registro salvo.')
}

/**
 * Filtra a lista até sobrar a conta recém-criada.
 *
 * A lista passou a mostrar vinte por página, e o banco de desenvolvimento
 * carrega mais de cem contas de execuções anteriores — a conta que este teste
 * acabou de criar quase nunca cai na primeira página. Procurá-la é o que uma
 * pessoa de verdade faz numa lista longa, e de quebra exercita o filtro por
 * e-mail em todos os testes desta tela.
 */
async function acharUsuario(page: Page, email: string) {
  await page.goto(`/usuarios?nome=${encodeURIComponent(email)}`)
  const linha = page.locator('li', { hasText: email })
  await expect(linha).toBeVisible()
  return linha
}

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
  await criarUsuario(page, nome, email, 'ADMINISTRATIVO')

  const linha = await acharUsuario(page, email)

  await linha.getByLabel('Sua senha atual').fill('chute-errado')
  await linha.getByLabel('Nova senha').fill('outra-senha-forte-456')
  await linha.getByRole('button', { name: 'Definir nova senha' }).click()

  await expect(linha.getByRole('alert')).toHaveText('Senha atual incorreta')

  await linha.getByLabel('Sua senha atual').fill(SENHA_SEMENTE)
  await linha.getByLabel('Nova senha').fill('outra-senha-forte-456')
  await linha.getByRole('button', { name: 'Definir nova senha' }).click()

  await expect(linha.getByRole('status')).toHaveText('Registro salvo.')
})

test('corrige o papel de um usuário, sem desativar e recriar a conta', async ({ page }) => {
  // Era a consequência mais dura da falta desta tela: papel errado no cadastro
  // só se resolvia desativando a conta e criando outra, o que trocava o
  // histórico de acesso de uma pessoa por duas contas pela metade.
  const nome = `Usuário Papel ${Date.now()}`
  const email = `papel.${Date.now()}@lar.local`

  await page.goto('/usuarios')
  await criarUsuario(page, nome, email, 'SAUDE')

  const linha = await acharUsuario(page, email)
  await expect(linha).toContainText('Saúde')

  await linha.locator('summary').filter({ hasText: 'Editar' }).click()
  await linha.getByLabel('Papel').selectOption('ADMINISTRATIVO')
  await linha.getByRole('button', { name: 'Salvar usuário' }).click()

  // Pela linha descritiva, e não pelo `li` inteiro: o seletor de papel do
  // formulário de edição carrega "Saúde" e "Coordenação" como opções, então
  // procurar o rótulo solto acharia a opção em vez do papel em vigor.
  await expect(page.locator('li', { hasText: email })).toContainText(
    `${email} · Administrativo`
  )
})

test('não oferece troca do próprio papel, e ainda deixa corrigir o próprio nome', async ({
  page,
}) => {
  // Rebaixar a única conta de coordenação deixaria o sistema sem ninguém capaz
  // de abrir esta tela, e sem caminho de volta que não fosse o banco. O
  // serviço recusa; a tela nem oferece.
  const propria = await acharUsuario(page, EMAIL_SEMENTE)
  await propria.locator('summary').filter({ hasText: 'Editar' }).click()

  await expect(propria.getByLabel('Nome')).toBeVisible()
  await expect(propria.getByLabel('Papel')).toHaveCount(0)
})
