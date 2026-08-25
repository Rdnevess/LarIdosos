import { test, expect, type Page } from '@playwright/test'
import { EMAIL_SEMENTE, SENHA_SEMENTE } from './credenciais'

/**
 * O tema escuro, no navegador de verdade.
 *
 * Toda asserção olha o atributo **e** a cor computada do fundo. Só o atributo
 * diria que `data-tema` mudou, que é o que o primeiro tema escuro deste sistema
 * também fazia: trocava uma variável e deixava as superfícies para trás. A cor
 * computada é o que distingue "o atributo mudou" de "a tela mudou".
 */

const BOTAO = { name: 'Alternar tema claro e escuro' }

/**
 * Luminância relativa do fundo efetivo da página, pela fórmula da WCAG. Não se
 * compara com um hex fixo de propósito: os valores dos tokens pertencem ao
 * `globals.css` e ao teste de contraste que o lê. Aqui a pergunta é outra e mais
 * grosseira — a tela está escura ou clara?
 */
async function luminanciaDoFundo(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cor = getComputedStyle(document.body).backgroundColor
    const [r, g, b] = (cor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
    const canal = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  })
}

async function esperarEscuro(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro')
  expect(await luminanciaDoFundo(page)).toBeLessThan(0.1)
}

async function esperarClaro(page: Page) {
  expect(await luminanciaDoFundo(page)).toBeGreaterThan(0.7)
}

async function entrar(page: Page) {
  await page.getByLabel('E-mail').fill(EMAIL_SEMENTE)
  await page.getByLabel('Senha').fill(SENHA_SEMENTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/residentes/)
}

test('a escolha atravessa o login, a navegação e o recarregamento', async ({ page }) => {
  // Sistema no claro, para que tudo que acontecer seja mérito da escolha.
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login')
  await esperarClaro(page)

  // Sem cookie não há atributo, e quem decide é o `@media`.
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', /.*/)

  await page.getByRole('button', BOTAO).click()
  await esperarEscuro(page)

  await entrar(page)
  await esperarEscuro(page)

  // Navegar entre abas é o que quebraria se o tema morasse só no estado do
  // React: cada uma destas é uma navegação de servidor.
  await page.getByRole('link', { name: 'Funcionários' }).click()
  await expect(page).toHaveURL(/\/funcionarios/)
  await esperarEscuro(page)

  await page.getByRole('link', { name: 'Pendências' }).click()
  await expect(page).toHaveURL(/\/pendencias/)
  await esperarEscuro(page)

  await page.reload()
  await esperarEscuro(page)

  await page.getByRole('button', BOTAO).click()
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro')
  await esperarClaro(page)

  await page.reload()
  await esperarClaro(page)
})

test('quem nunca escolheu herda o tema do sistema operacional', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')

  // Nenhum atributo é emitido, e mesmo assim a tela está escura: é o `@media`
  // trabalhando sozinho, sem cookie e sem JavaScript.
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', /.*/)
  expect(await luminanciaDoFundo(page)).toBeLessThan(0.1)
})

test('a escolha explícita ganha do sistema operacional', async ({ page }) => {
  // O caso que o `:root:not([data-tema="claro"])` existe para resolver: sistema
  // no escuro, pessoa que prefere claro. Sem o `:not`, o `@media` reescreveria
  // os tokens por cima da escolha e a preferência seria ignorada.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')

  await page.getByRole('button', BOTAO).click()
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro')
  await esperarClaro(page)

  await page.reload()
  await esperarClaro(page)
})

test('o rótulo do botão oferece o tema oposto ao atual', async ({ page }) => {
  // Quem decide qual rótulo aparece é o CSS, não a hidratação — por isso os dois
  // existem no DOM. Se um dia essa decisão voltar para o JavaScript, é aqui que
  // aparece: o rótulo errado, ou os dois ao mesmo tempo.
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login')

  await expect(page.getByText('☾ Escuro')).toBeVisible()
  await expect(page.getByText('☀ Claro')).toBeHidden()

  await page.getByRole('button', BOTAO).click()

  await expect(page.getByText('☀ Claro')).toBeVisible()
  await expect(page.getByText('☾ Escuro')).toBeHidden()
})

test('o texto digitado continua legível no tema escuro', async ({ page }) => {
  // O defeito que derrubou o primeiro tema escuro: os campos não declaravam cor
  // própria, herdavam quase-branco do `body` e ficavam sobre cartão branco. O
  // `login.spec.ts` guarda o caso do sistema em modo escuro; este guarda o do
  // tema escolhido no botão, que é o caminho novo.
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/login')
  await page.getByRole('button', BOTAO).click()
  await esperarEscuro(page)

  const email = page.getByLabel('E-mail')
  await email.fill(EMAIL_SEMENTE)

  const cores = await email.evaluate((elemento) => {
    const opaco = (no: Element | null): string => {
      while (no) {
        const cor = getComputedStyle(no).backgroundColor
        const alfa = cor.match(/[\d.]+/g)?.[3]
        if (cor !== 'transparent' && alfa !== '0') return cor
        no = no.parentElement
      }
      return 'rgb(255, 255, 255)'
    }
    return { texto: getComputedStyle(elemento).color, fundo: opaco(elemento) }
  })

  const luminancia = (cor: string) => {
    const [r, g, b] = (cor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
    const canal = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  }

  const [maior, menor] = [luminancia(cores.texto), luminancia(cores.fundo)].sort((a, b) => b - a)
  expect((maior + 0.05) / (menor + 0.05)).toBeGreaterThanOrEqual(4.5)
})
