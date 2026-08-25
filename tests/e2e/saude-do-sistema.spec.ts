import { test, expect } from '@playwright/test'

test('o healthcheck responde sem autenticação', async ({ request }) => {
  // Precisa responder a quem não tem sessão: quem o consulta é o Docker, que
  // não faz login. O matcher do middleware pega tudo por padrão, então esta
  // rota tem de estar explicitamente de fora — senão o healthcheck recebe o
  // 307 para /login e o contêiner nunca fica saudável.
  const resposta = await request.get('/api/health')

  expect(resposta.status()).toBe(200)
  expect(await resposta.json()).toEqual({ status: 'ok' })
})

test('o healthcheck não vaza detalhe do sistema', async ({ request }) => {
  // Endpoint aberto: o corpo diz se está de pé e nada mais. Versão, host ou
  // mensagem de erro do banco aqui viram reconhecimento gratuito para quem
  // estiver varrendo.
  const corpo = await (await request.get('/api/health')).text()

  expect(corpo).not.toMatch(/postgres|prisma|versão|version|localhost|5432/i)
})

test('a política de segurança de conteúdo chega em toda página', async ({ request }) => {
  // A CSP mora no `next.config.ts` para que o E2E a atravesse: um cabeçalho
  // posto só no Caddy nunca seria exercitado por teste nenhum, e uma diretiva
  // errada só apareceria em produção.
  const csp = (await request.get('/login')).headers()['content-security-policy']

  expect(csp).toBeDefined()
  for (const diretiva of [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ]) {
    expect(csp).toContain(diretiva)
  }
})

test('o tema escuro continua funcionando sob a CSP', async ({ page }) => {
  // O botão de tema escreve `document.documentElement.dataset.tema` no clique.
  // Se a CSP barrasse o script da aplicação, é aqui que apareceria — e
  // apareceria como tela que não muda, não como erro.
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Alternar tema claro e escuro' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro')
})

test('nenhuma violação de CSP no caminho do login', async ({ page }) => {
  // CSP quebra em silêncio: o recurso é bloqueado, o console reclama, e nenhuma
  // asserção de tela percebe. Escutar o console é o que transforma esse
  // silêncio em teste vermelho.
  const violacoes: string[] = []
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) violacoes.push(msg.text())
  })
  page.on('pageerror', (erro) => {
    if (/content security policy/i.test(erro.message)) violacoes.push(erro.message)
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/residentes/)

  expect(violacoes, violacoes.join('\n')).toEqual([])
})
