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

// Incrementado a cada chamada: `Date.now()` sozinho pode repetir entre duas
// chamadas na mesma suíte (mesmo milissegundo), o que colidiria dois CPFs
// "únicos" gerados em sequência rápida.
let contadorCpf = 0

/**
 * Gera um CPF com dígitos verificadores válidos, um por chamada. A suíte
 * grava no banco de desenvolvimento (não um banco efêmero por execução — ver
 * `global-setup.ts`), então um CPF fixo como o do brief original funciona na
 * primeira rodada e falha em todas as seguintes, porque o CPF já existe.
 * Misturar `Date.now()` com o contador muda a semente a cada execução E a
 * cada chamada dentro da mesma execução.
 */
function gerarCpfValido(): string {
  contadorCpf += 1
  const semente = Date.now() * 1000 + contadorCpf
  const base = String(semente).slice(-9).padStart(9, '1').split('').map(Number)
  const d1 = calcularDigitoVerificador(base)
  const d2 = calcularDigitoVerificador([...base, d1])
  return [...base, d1, d2].join('')
}

// Os dois primeiros testes usam o mesmo CPF de propósito — o segundo depende
// do primeiro ter rodado antes e cadastrado esse CPF. O Playwright executa os
// testes de um arquivo na ordem em que aparecem.
const CPF_TESTE = gerarCpfValido()

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

test('funcionário desligado sai do aviso de conselho vencendo', async ({ page }) => {
  const nome = `Enfermeira Saida ${Date.now()}`
  const cpf = gerarCpfValido()
  const emVinteDias = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)

  await page.goto('/funcionarios/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('CPF').fill(cpf)
  await page.getByLabel('Cargo').fill('Enfermeira')
  await page.getByLabel('Vínculo').selectOption('CLT')
  await page.getByLabel('Data de admissão').fill('2025-01-10')
  await page.getByLabel('Conselho (COREN, CRM, CRN…)').fill('COREN')
  await page.getByLabel('Número do registro').fill('999999')
  await page.getByLabel('Validade do registro').fill(emVinteDias)
  await page.getByRole('button', { name: 'Cadastrar funcionário' }).click()

  // Antes do desligamento, o aviso cita a pessoa.
  await expect(page.getByRole('status')).toContainText(nome)

  await page.getByRole('link', { name: new RegExp(nome) }).click()
  await page.getByLabel('Data do desligamento').fill('2026-08-01')
  await page.getByLabel('Motivo').fill('Pedido de demissão')
  await page.getByRole('button', { name: 'Registrar desligamento' }).click()

  // A Server Action é assíncrona: sem esperar a confirmação, o `page.goto`
  // seguinte pode disparar antes de o desligamento ser gravado, e a lista
  // ainda mostraria a pessoa como ativa — não porque o desligamento falhou,
  // mas porque o teste não esperou por ele. O texto "Registro salvo" do
  // `FormularioSimples` não serve de sinal aqui: assim que a ação tem
  // sucesso, o Next também revalida a própria rota, `funcionario.ativo` vira
  // `false`, e a seção inteira do formulário de desligamento (com o parágrafo
  // de sucesso dentro dela) é substituída pelo aviso somente-leitura antes de
  // o texto chegar a aparecer. O sinal observável é esse aviso.
  await expect(page.getByText(/Desligado em/)).toBeVisible()

  // Depois, some — é isso que impede o aviso de encher de gente que já saiu.
  await page.goto('/funcionarios')
  await expect(page.getByText(nome)).toHaveCount(0)
})
