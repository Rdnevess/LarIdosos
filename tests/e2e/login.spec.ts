import { test, expect } from '@playwright/test'

test('recusa credenciais inválidas', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()

  // O App Router do Next.js injeta em toda página um anunciador de rota
  // (`#__next-route-announcer__`) que também usa `role="alert"`, ainda que
  // vazio. Filtramos pelo texto para mirar no alerta do formulário, não no
  // anunciador do framework.
  const alerta = page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos.' })
  await expect(alerta).toHaveText('E-mail ou senha incorretos.')
})

test('entra com credenciais válidas e redireciona', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
})

test('redireciona visitante não autenticado para o login', async ({ page }) => {
  await page.goto('/residentes')
  await expect(page).toHaveURL(/\/login/)
})

/**
 * Contraste entre o texto e o fundo, pela fórmula da WCAG 2.1. O mínimo para
 * texto normal é 4,5:1 — abaixo disso alguém precisa apertar os olhos, e a
 * equipe do Lar digita nestes campos com o celular na mão, no corredor.
 */
function contraste(frente: string, fundo: string): number {
  const canais = (cor: string) =>
    (cor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)

  const luminancia = (cor: string) => {
    const [r, g, b] = canais(cor).map((canal) => {
      const c = canal / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const [claro, escuro] = [luminancia(frente), luminancia(fundo)].sort((a, b) => b - a)
  return (claro + 0.05) / (escuro + 0.05)
}

test('o texto digitado no login é legível no modo escuro do sistema', async ({ page }) => {
  // O `globals.css` nasceu com o bloco de tema escuro do template do Next, que
  // pintava o `body` de quase branco. Os campos não declaram cor própria, então
  // herdavam isso — e ficavam texto quase branco sobre cartão branco. Quem usa
  // o sistema com o Windows em modo escuro não conseguia ler o que digitava.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')

  const email = page.getByLabel('E-mail')
  await email.fill('coordenacao@lar.local')

  const cores = await email.evaluate((elemento) => {
    // O fundo EFETIVO, subindo pelos ancestrais: o campo é transparente, e
    // medir contra `rgba(0,0,0,0)` compararia com preto — daria contraste alto
    // justamente no caso que estamos tentando pegar.
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

  expect(contraste(cores.texto, cores.fundo)).toBeGreaterThanOrEqual(4.5)
})
