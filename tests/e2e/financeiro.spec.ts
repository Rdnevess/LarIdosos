import { test, expect, type Page } from '@playwright/test'

/**
 * O caminho inteiro do dinheiro, pela tela: cadastrar a instituição e a conta,
 * lançar uma receita e uma despesa, e ver as duas na lista com o valor em
 * reais.
 *
 * Os nomes levam o relógio junto porque o banco de E2E não é limpo entre as
 * rodadas — dois `Energisa` na lista fariam o `getByText` reclamar de
 * ambiguidade e o teste falhar por um motivo que não é o dele.
 */

const marca = Date.now()
const CONTA = `9${String(marca).slice(-5)}-4`
const ORIGEM = `Doação ${marca}`
const CATEGORIA = `Energia ${marca}`
const FORNECEDOR = `Energisa ${marca}`
// A descrição também leva a marca: sem ela, a segunda rodada acha duas
// "Doação de agosto" na lista e o `getByText` reclama de ambiguidade.
const RECEITA = `Doação de agosto ${marca}`
const DESPESA = `Conta de luz de agosto ${marca}`

/**
 * Os rótulos obrigatórios carregam um asterisco ("Nome *"), então `exact` nunca
 * casa; e "Saldo inicial" sem âncora casaria também "Data do saldo inicial".
 * Daí as regexes ancoradas no início.
 */
async function abrirSecao(pagina: Page, titulo: string) {
  const secao = pagina.locator('details', { has: pagina.getByRole('heading', { name: titulo }) })
  await secao.locator('summary').click()
  return secao
}

test.describe.configure({ mode: 'serial' })

test('cadastra a instituição, a conta e os auxiliares', async ({ page }) => {
  await page.goto('/financeiro/cadastros')

  const instituicao = await abrirSecao(page, 'Dados da instituição')
  await instituicao.getByLabel('Razão social').fill('Associação Lar dos Idosos')
  await instituicao.getByLabel('CNPJ').fill('11.222.333/0001-81')
  await instituicao.getByLabel('Endereço completo').fill('Rua das Flores, 100 — Centro')
  await instituicao.getByLabel('Cidade').fill('Cuiabá')
  await instituicao.getByLabel('UF').fill('MT')
  await instituicao.getByLabel('Órgão destinatário').fill('Prefeitura Municipal de Cuiabá/MT')
  await instituicao.getByLabel('Nome do presidente').fill('Ana Ribeiro')
  await instituicao.getByLabel('Nome do tesoureiro').fill('Carlos Menezes')
  await instituicao.getByRole('button', { name: 'Salvar dados da instituição' }).click()
  await expect(instituicao.getByRole('status')).toBeVisible()

  // Recarregada, a tela volta preenchida: é registro único, não um formulário
  // que cria uma linha nova a cada salvamento.
  await page.reload()
  const recarregada = await abrirSecao(page, 'Dados da instituição')
  await expect(recarregada.getByLabel('Razão social')).toHaveValue('Associação Lar dos Idosos')

  const contas = await abrirSecao(page, 'Contas bancárias')
  await contas.getByLabel('Banco').fill('Banco do Brasil')
  await contas.getByLabel('Agência').fill('1234-5')
  await contas.getByLabel('Número da conta').fill(CONTA)
  await contas.getByLabel(/^Tipo/).selectOption('CORRENTE')
  await contas.getByLabel('Titular').fill('Associação Lar dos Idosos')
  await contas.getByLabel(/^Saldo inicial/).fill('15000')
  await contas.getByLabel('Data do saldo inicial').fill('2026-01-01')
  await contas.getByRole('button', { name: 'Cadastrar conta' }).click()
  await expect(page.getByText(CONTA).first()).toBeVisible()

  const origens = await abrirSecao(page, 'Origens de receita')
  await origens.getByLabel(/^Nome/).fill(ORIGEM)
  await origens.getByLabel('Rótulo na prestação').fill('Doação')
  await origens.getByRole('button', { name: 'Cadastrar origem' }).click()
  await expect(page.getByText(ORIGEM).first()).toBeVisible()

  const categorias = await abrirSecao(page, 'Categorias de despesa')
  await categorias.getByLabel(/^Nome/).fill(CATEGORIA)
  await categorias.getByRole('button', { name: 'Cadastrar categoria' }).click()
  await expect(page.getByText(CATEGORIA).first()).toBeVisible()

  const fornecedores = await abrirSecao(page, 'Fornecedores')
  await fornecedores.getByLabel(/^Nome/).fill(FORNECEDOR)
  await fornecedores.getByLabel('Tipo de documento').selectOption('CNPJ')
  await fornecedores.getByLabel(/^Documento/).fill('11.222.333/0001-81')
  await fornecedores.getByRole('button', { name: 'Cadastrar fornecedor' }).click()
  await expect(page.getByText(FORNECEDOR).first()).toBeVisible()
})

test('recusa um CNPJ inválido, em português e sem vazar exceção', async ({ page }) => {
  await page.goto('/financeiro/cadastros')

  const fornecedores = await abrirSecao(page, 'Fornecedores')
  await fornecedores.getByLabel(/^Nome/).fill(`Inválido ${marca}`)
  await fornecedores.getByLabel('Tipo de documento').selectOption('CNPJ')
  await fornecedores.getByLabel(/^Documento/).fill('11.111.111/1111-11')
  await fornecedores.getByRole('button', { name: 'Cadastrar fornecedor' }).click()

  await expect(fornecedores.getByRole('alert')).toContainText('Documento inválido')
  await expect(page.getByText(/ZodError|Prisma|at Object/)).toHaveCount(0)
})

test('lança uma receita e uma despesa, e mostra as duas em reais', async ({ page }) => {
  await page.goto('/financeiro')

  const receita = await abrirSecao(page, 'Lançar receita')
  await receita.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await receita.getByLabel('Origem').selectOption({ label: ORIGEM })
  await receita.getByLabel('Descrição').fill(RECEITA)
  await receita.getByLabel('Valor').fill('2000')
  await receita.getByLabel('Data').fill('2026-08-05')
  await receita.getByRole('button', { name: 'Lançar receita' }).click()
  await expect(receita.getByRole('status')).toBeVisible()

  const despesa = await abrirSecao(page, 'Lançar despesa')
  await despesa.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await despesa.getByLabel('Fornecedor').selectOption({ label: FORNECEDOR })
  await despesa.getByLabel('Categoria').selectOption({ label: CATEGORIA })
  await despesa.getByLabel('Forma de pagamento').selectOption('PIX')
  await despesa.getByLabel('Descrição').fill(DESPESA)
  await despesa.getByLabel('Valor').fill('800')
  await despesa.getByLabel('Data').fill('2026-08-15')
  await despesa.getByRole('button', { name: 'Lançar despesa' }).click()
  // Esperar a confirmação antes de navegar: `page.goto` no mesmo instante do
  // clique aborta a Server Action em curso, e o lançamento nunca chega ao banco.
  await expect(despesa.getByRole('status')).toBeVisible()

  await page.goto('/financeiro?de=2026-08-01&ate=2026-08-31')
  await expect(page.getByText(RECEITA)).toBeVisible()
  await expect(page.getByText(DESPESA)).toBeVisible()
  await expect(page.getByText('R$ 2.000,00').first()).toBeVisible()
  await expect(page.getByText('R$ 800,00').first()).toBeVisible()
})
