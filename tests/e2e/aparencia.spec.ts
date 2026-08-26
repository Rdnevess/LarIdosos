import { test, expect } from '@playwright/test'

test('a interface usa a Geist, e não a Arial de sobra do template', async ({ page }) => {
  // O `layout.tsx` baixa a Geist pelo `next/font` desde o primeiro commit, e o
  // `globals.css` a expõe como `--font-sans`. Um `font-family: Arial` no `body`
  // — sobra do template do Next — descartava tudo isso: o sistema pagava o
  // download e renderizava em Arial.
  await page.goto('/login')

  const familia = await page
    .locator('body')
    .evaluate((el) => getComputedStyle(el).fontFamily)

  expect(familia).toMatch(/geist/i)
  expect(familia).not.toMatch(/arial/i)
})

test('o texto corrente tem 16px no celular e 15px no desktop', async ({ page }) => {
  // Densidade por dispositivo, em uma regra só: o `font-size` da raiz muda no
  // breakpoint e toda a escala em `rem` acompanha. É o que concilia "legível em
  // pé no corredor" com a tabela densa que a §9 do design-mãe promete a quem
  // confere duzentos lançamentos.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  const celular = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(celular).toBe('16px')

  await page.setViewportSize({ width: 1280, height: 800 })
  const desktop = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(desktop).toBe('15px')
})

test('nenhum controle é menor que 44px no celular', async ({ page }) => {
  // 44px é o mínimo que a diretriz de toque recomenda, e aqui não é teoria:
  // quem usa este sistema o faz em pé, no corredor, com uma mão só e às vezes
  // com luva. Alvo pequeno vira toque errado, e toque errado num registro de
  // medicação é o pior tipo de erro que este sistema pode induzir.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  const pequenos: string[] = []
  for (const controle of await page.locator('button, a, select, input:not([type=hidden])').all()) {
    if (!(await controle.isVisible())) continue
    const caixa = await controle.boundingBox()
    if (caixa && caixa.height < 44) {
      pequenos.push(`${await controle.evaluate((el) => el.tagName)} ${caixa.height.toFixed(0)}px`)
    }
  }

  expect(pequenos, pequenos.join('\n')).toEqual([])
})

test('o botão primário usa a cor da marca e tem contraste de componente', async ({ page }) => {
  // Duas regras, e a segunda é a que costuma escapar: o texto sobre o botão
  // precisa de 4,5:1 (WCAG 1.4.3), e o próprio botão precisa de 3:1 contra o
  // fundo (WCAG 1.4.11). Um botão legível por dentro e invisível por fora
  // passa no primeiro e reprova no segundo.
  await page.goto('/login')
  const botao = page.getByRole('button', { name: 'Entrar' })

  const cores = await botao.evaluate((el) => ({
    fundo: getComputedStyle(el).backgroundColor,
    texto: getComputedStyle(el).color,
    pagina: getComputedStyle(document.body).backgroundColor,
  }))

  const lum = (cor: string) => {
    const [r, g, b] = (cor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const c = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
  }
  const razao = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  expect(razao(cores.texto, cores.fundo)).toBeGreaterThanOrEqual(4.5)
  expect(razao(cores.fundo, cores.pagina)).toBeGreaterThanOrEqual(3)
})
