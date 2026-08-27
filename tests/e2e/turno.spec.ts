import { test, expect, type Page } from '@playwright/test'
import { horarioDoTurnoCorrente, inicioDoTurnoCorrente } from './turno-corrente'

async function cadastrarEAbrirProntuario(page: Page, nome: string): Promise<void> {
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1937-03-03')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-03')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await page.getByRole('link', { name: 'Prontuário' }).click()
  await expect(page.getByRole('heading', { name: /Prontuário/ })).toBeVisible()
}

test('a tela do turno lista a dose e a marca como administrada em um toque', async ({
  page,
}) => {
  const nome = `Idosa Turno ${Date.now()}`
  const farmaco = `Losartana ${Date.now()}`
  await cadastrarEAbrirProntuario(page, nome)

  const secao = page.locator('details').filter({ hasText: 'Medicações' })
  await secao.locator('summary').first().click()
  await secao.getByLabel('Fármaco').fill(farmaco)
  await secao.getByLabel('Dose').fill('1 comprimido')
  await secao.getByLabel('Via').selectOption('ORAL')
  await secao.getByLabel('Tipo').selectOption('HORARIO_FIXO')
  await secao.getByLabel('Horários').fill(horarioDoTurnoCorrente())
  // A vigência começa no início do turno: sem isso, uma prescrição criada
  // agora não derivaria a dose de uma hora atrás — o que é o comportamento
  // certo do produto, e tornaria este teste dependente da hora do relógio.
  await secao.getByLabel('Vigente a partir de').fill(inicioDoTurnoCorrente())
  await secao.getByRole('button', { name: 'Prescrever' }).click()

  // `click()` resolve quando o clique é despachado, e não quando a Server
  // Action termina. Sem esperar, a navegação seguinte vence a corrida sempre
  // que a máquina está ocupada: o `/turno` renderiza sem a dose, e a
  // asserção seguinte repete o seletor por 20 s numa página que nunca mais
  // é buscada.
  //
  // `toHaveCount` e não `toBeVisible`: o `<details>` recolhe ao re-renderizar
  // depois da action, e medir visibilidade mediria a gaveta em vez do commit.
  //
  // É a mesma pós-condição de que o teste da suspensão já depende, logo
  // abaixo, e por isso aquele nunca falhou.
  await expect(secao.locator('li', { hasText: farmaco })).toHaveCount(1)

  await page.goto('/turno')
  const linha = page.locator('li', { hasText: farmaco })
  await expect(linha).toContainText(nome)

  // O "um toque" do turno corrente: sem formulário no caminho.
  await linha.getByRole('button', { name: 'Administrada' }).click()
  await expect(page.locator('li', { hasText: farmaco })).toContainText('Administrada')
})

test('a medicação suspensa sai da tela do turno', async ({ page }) => {
  // A vigência é quem manda: suspensa agora, a dose seguinte deixa de ser
  // derivada — e a anterior, já registrada, continua no histórico.
  const nome = `Idosa Suspensa ${Date.now()}`
  const farmaco = `Enalapril ${Date.now()}`
  await cadastrarEAbrirProntuario(page, nome)

  const secao = page.locator('details').filter({ hasText: 'Medicações' })
  await secao.locator('summary').first().click()
  await secao.getByLabel('Fármaco').fill(farmaco)
  await secao.getByLabel('Dose').fill('1 comprimido')
  await secao.getByLabel('Via').selectOption('ORAL')
  await secao.getByLabel('Tipo').selectOption('HORARIO_FIXO')
  await secao.getByLabel('Horários').fill('23:59')
  await secao.getByRole('button', { name: 'Prescrever' }).click()

  // Escopado à seção: o cabeçalho clínico também lista a medicação ativa, e
  // um `li` solto na página pegaria os dois.
  const item = secao.locator('li', { hasText: farmaco })
  await item.locator('summary').filter({ hasText: 'Suspender' }).click()
  await item.getByLabel('Motivo da suspensão').fill('Suspensa pelo médico')
  await item.getByRole('button', { name: 'Suspender medicação' }).click()

  await expect(secao.locator('li', { hasText: farmaco })).toContainText('Suspensa')

  // E some do cabeçalho, que só lista as ativas.
  const cabecalho = page.getByRole('region', { name: 'Cabeçalho clínico' })
  await expect(cabecalho).not.toContainText(farmaco)
})
