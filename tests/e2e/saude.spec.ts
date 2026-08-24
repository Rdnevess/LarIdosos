import { test, expect, type Page } from '@playwright/test'
import { NOME_RESIDENTE_SAUDE } from './credenciais'

/**
 * A interface vista pelo papel SAUDE. Até a Tarefa 19 nenhum teste, de
 * nenhuma camada, exercitou a ficha com outro perfil que não a coordenação —
 * e foi exatamente aí que se escondeu o defeito que impedia a enfermeira de
 * anexar um exame ou o laudo do grau de dependência.
 */
async function abrirFicha(page: Page): Promise<void> {
  await page.goto('/residentes')
  await page.getByLabel('Buscar por nome').fill(NOME_RESIDENTE_SAUDE)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await page.getByRole('link', { name: new RegExp(NOME_RESIDENTE_SAUDE) }).click()
  await expect(page.getByRole('heading', { name: NOME_RESIDENTE_SAUDE })).toBeVisible()
}

test('o menu do papel SAUDE traz só a área de residentes', async ({ page }) => {
  await page.goto('/residentes')

  const menu = page.getByRole('navigation')
  await expect(menu.getByRole('link', { name: 'Residentes' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Funcionários' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Usuários' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Auditoria' })).toHaveCount(0)
})

test('a ficha oferece anexar exame e laudo ao papel SAUDE', async ({ page }) => {
  await abrirFicha(page)

  await page.locator('summary').filter({ hasText: 'Documentos' }).click()

  // O formulário existia e era escondido justamente de quem tem permissão de
  // anexar documento clínico.
  const seletor = page.getByLabel('Tipo do documento')
  await expect(seletor).toBeVisible()

  // Os tipos clínicos, que o seletor omitia de todo mundo.
  await expect(seletor.locator('option[value="EXAME"]')).toHaveCount(1)
  await expect(seletor.locator('option[value="LAUDO"]')).toHaveCount(1)
  // E o que este papel não pode ver continua fora.
  await expect(seletor.locator('option[value="COMPROVANTE_FISCAL"]')).toHaveCount(0)

  // Rótulos em português, nunca o valor cru do enum.
  await expect(seletor).toContainText('Exame')
  await expect(seletor).not.toContainText('COMPROVANTE_FISCAL')
})

test('a enfermeira anexa o laudo do grau de dependência e ele aparece na ficha', async ({
  page,
}) => {
  await abrirFicha(page)

  await page.locator('summary').filter({ hasText: 'Documentos' }).click()
  await page.getByLabel('Tipo do documento').selectOption('LAUDO')
  await page.getByLabel('Descrição').fill('Laudo do grau de dependência')

  const nomeArquivo = `laudo-${Date.now()}.pdf`
  await page.getByLabel('Arquivo').setInputFiles({
    name: nomeArquivo,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 laudo de grau de dependência'),
  })
  await page.getByRole('button', { name: 'Anexar documento' }).click()

  // Gravado de verdade: a listagem da ficha vem do banco.
  const secaoDocumentos = page.locator('details').filter({ hasText: 'Documentos (' })
  await expect(secaoDocumentos).toContainText(nomeArquivo)

  // A seção pode estar fechada aqui, e a causa é do ambiente de teste, não da
  // ficha: esta suíte roda contra `npm run dev`, cujo bundle é grande o
  // bastante para o Playwright clicar em "Anexar documento" antes de o React
  // hidratar. Sem hidratação o navegador faz o POST nativo do HTML — a Server
  // Action grava do mesmo jeito, mas o retorno é uma navegação de documento,
  // que devolve a página no estado do servidor, com as seções fechadas.
  //
  // Medido em 21/08/2026 contra build de produção, com CPU estrangulada em 6x,
  // rede 3G e espera zero entre carregar e enviar: nenhuma recarga, em nenhum
  // caso. Nenhum usuário alcança isso — ver `docs/operacao/pendencias-fase-1.md`,
  // item 6. Por isso o `if` é defensivo em vez de uma espera fixa: quando a
  // máquina é rápida a seção já está aberta e nada acontece.
  const aberta = await secaoDocumentos.evaluate((e: HTMLDetailsElement) => e.open)
  if (!aberta) await secaoDocumentos.locator('summary').first().click()

  const link = secaoDocumentos.getByRole('link', { name: new RegExp(nomeArquivo) })
  await expect(link).toBeVisible()
  await expect(link).toContainText('Laudo')

  // E o papel consegue lê-lo de volta pelo endpoint autenticado.
  const href = await link.getAttribute('href')
  const resposta = await page.request.get(href!)
  expect(resposta.status()).toBe(200)
})

test('a ficha não oferece ao papel SAUDE desligamento nem edição de cadastro', async ({
  page,
}) => {
  await abrirFicha(page)

  await expect(page.getByRole('link', { name: /Registrar saída ou óbito/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Ver registro de saída/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Editar cadastro' })).toHaveCount(0)
})

test('a tela de desligamento digitada na URL recusa o papel SAUDE em pt-BR', async ({
  page,
}) => {
  await abrirFicha(page)
  const url = page.url()

  await page.goto(`${url}/desligar`)

  await expect(page.getByText(/registro de desligamento ou óbito é feito pela coordenação/i)).toBeVisible()
  // Nenhum formulário de saída, e nada de mensagem de exceção interna.
  await expect(page.getByRole('button', { name: 'Registrar saída' })).toHaveCount(0)
  await expect(page.getByText(/Acesso negado|ErroPermissao/)).toHaveCount(0)
})

test('o papel SAUDE registra anotação, que é a escrita que lhe cabe', async ({ page }) => {
  await abrirFicha(page)

  const texto = `Aferição de pressão sem alteração ${Date.now()}.`
  // A ficha cadastral so oferece categoria nao-clinica desde a Fase 2A; o
  // clinico do papel SAUDE vive no prontuario.
  await page.getByLabel('Categoria').selectOption('SOCIAL')
  await page.getByLabel('Anotação').fill(texto)
  await page.getByRole('button', { name: 'Registrar anotação' }).click()

  const secaoAnotacoes = page.getByRole('group').filter({ hasText: 'Anotações (' })
  await expect(secaoAnotacoes).toContainText(texto)
})
