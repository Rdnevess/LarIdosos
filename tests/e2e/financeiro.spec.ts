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
// Duas origens, como na realidade: a doação avulsa e a contribuição do
// residente. As duas saem na prestação com o mesmo rótulo "Doação"; só a
// segunda exige informar de quem é.
const ORIGEM_CONTRIB = `Contribuição de residente ${marca}`
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

  await origens.getByLabel(/^Nome/).fill(ORIGEM_CONTRIB)
  await origens.getByLabel('Rótulo na prestação').fill('Doação')
  await origens.getByLabel('Exige informar o residente').check()
  await origens.getByRole('button', { name: 'Cadastrar origem' }).click()
  await expect(page.getByText(ORIGEM_CONTRIB).first()).toBeVisible()

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

test('abre a prestação, fecha, e baixa os dois arquivos', async ({ page }) => {
  await page.goto('/financeiro/prestacoes')

  const abrir = await abrirSecao(page, 'Abrir prestação')
  await abrir.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await abrir.getByLabel('Ano').fill('2026')
  await abrir.getByLabel('Mês').selectOption('8')
  await abrir.getByRole('button', { name: 'Abrir prestação' }).click()
  await expect(abrir.getByRole('status')).toBeVisible()

  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const prestacao = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()

  // O saldo anterior vem do saldo inicial da conta: não há prestação fechada
  // anterior de onde herdar.
  await expect(prestacao.getByText('R$ 15.000,00')).toBeVisible()
  await expect(prestacao.getByText('Aberta', { exact: true })).toBeVisible()

  await prestacao.getByRole('button', { name: 'Fechar prestação' }).click()

  // O formulário de fechar some na revalidação, e leva a confirmação junto:
  // quem prova que fechou é o próprio cartão, que passa a "Fechada" e a
  // oferecer os downloads.
  const fechada = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()
  await expect(fechada.getByText('Fechada')).toBeVisible()

  // Os dois formatos, pelo endpoint, com a sessão do navegador.
  const xlsx = await page.request.get(
    (await fechada.getByRole('link', { name: 'Baixar .xlsx' }).getAttribute('href')) ?? ''
  )
  expect(xlsx.status()).toBe(200)
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml')

  const pdf = await page.request.get(
    (await fechada.getByRole('link', { name: 'Baixar PDF' }).getAttribute('href')) ?? ''
  )
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
})

test('reabrir exige motivo, e o motivo sai no documento regerado', async ({ page }) => {
  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const prestacao = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()

  const reabrir = prestacao.getByRole('group').filter({ hasText: 'Reabrir' })
  await reabrir.locator('summary').click()
  await reabrir.getByLabel('Motivo da reabertura').fill('Nota fiscal do telhado chegou atrasada')
  await reabrir.getByRole('button', { name: 'Reabrir prestação' }).click()

  const reaberta = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()
  // `exact`: sem ele, "Aberta" casa também o "Reaberta:" da linha do motivo.
  await expect(reaberta.getByText('Aberta', { exact: true })).toBeVisible()
  await expect(reaberta.getByText(/chegou atrasada/)).toBeVisible()
})

test('define a contribuição na ficha e a lança pela proposta do mês', async ({ page }) => {
  const nome = `Idosa Contribuinte ${marca}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-04-04')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-10')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  const contribuicao = page
    .locator('details')
    .filter({ hasText: 'Contribuição' })
    .first()
  await contribuicao.locator('summary').click()
  await contribuicao.getByLabel('Percentual do benefício (%)').fill('70')
  await contribuicao.getByLabel('Valor do benefício').fill('1412')
  await contribuicao.getByLabel('Vigente a partir de').fill('2026-01-10')
  await contribuicao.getByRole('button', { name: 'Definir contribuição' }).click()
  await expect(page.getByText('70% de R$ 1.412,00')).toBeVisible()

  // 70% de 1412 = 988,40. O sistema propõe; quem lança é gente.
  await page.goto('/financeiro/contribuicoes?ano=2026&mes=8')
  const linha = page.getByRole('listitem').filter({ hasText: nome })
  await expect(linha.getByText('R$ 988,40')).toBeVisible()

  await linha.getByRole('button', { name: 'Lançar contribuição' }).click()
  await expect(linha.getByText('Já lançado')).toBeVisible()
})
