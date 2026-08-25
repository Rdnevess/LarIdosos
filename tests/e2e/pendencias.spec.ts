import { test, expect } from '@playwright/test'

test('o exame entra nas pendências e sai quando o resultado chega', async ({ page }) => {
  // Só este teste percorre o caminho que dá razão ao módulo: exame solicitado
  // e esquecido é o problema real em ILPI, e a ida e a volta pela tela não é
  // coberta por teste de unidade nenhum.
  const nome = `Idosa Pendencia ${Date.now()}`
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-02-02')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-05')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await page.getByRole('link', { name: 'Prontuário' }).click()

  const tipoExame = `Hemograma ${Date.now()}`
  const secao = page.locator('details').filter({ hasText: 'Exames' })
  await secao.locator('summary').click()
  await secao.getByLabel('Tipo do exame').fill(tipoExame)
  await secao.getByLabel('Data da solicitação').fill('2026-07-01')
  await secao.getByRole('button', { name: 'Registrar exame' }).click()
  // Mesma espera que a segunda metade deste teste já fazia, e pelo mesmo
  // motivo: `click()` resolve quando o clique é despachado, não quando a
  // Server Action termina. Sem ela o `goto` corre com a gravação e
  // `/pendencias` renderiza antes de o exame existir.
  await expect(secao.getByRole('status')).toHaveText('Registro salvo.')

  await page.goto('/pendencias')
  const linha = page.locator('li', { hasText: tipoExame })
  await expect(linha).toContainText(nome)
  await expect(linha).toContainText('Solicitado')

  await linha.getByRole('link', { name: nome }).click()
  // A ficha chega com as seções fechadas: entrar pelo link de pendências não
  // abre a seção do exame, e o "Atualizar" de dentro dela não está visível.
  const secaoExames = page.locator('details').filter({ hasText: 'Exames' })
  await secaoExames.locator('summary').first().click()
  const doExame = secaoExames.locator('li', { hasText: tipoExame })
  await doExame.locator('summary').filter({ hasText: 'Atualizar' }).click()
  await doExame.getByLabel('Situação').selectOption('RESULTADO_RECEBIDO')
  await doExame.getByLabel('Resumo do resultado').fill('Hemoglobina 11,2 — anemia leve.')
  await doExame.getByRole('button', { name: 'Salvar exame' }).click()
  // Espera a confirmação antes de navegar: sem isto o `goto` corre com a
  // Server Action, e a próxima página carrega antes de a gravação terminar.
  await expect(doExame.getByRole('status')).toHaveText('Registro salvo.')

  await page.goto('/pendencias')
  await expect(page.locator('li', { hasText: tipoExame })).toHaveCount(0)
})
