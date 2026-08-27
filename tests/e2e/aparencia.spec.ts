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

test('a raiz fica em 16px em qualquer dispositivo', async ({ page }) => {
  // A densidade por dispositivo (15px no desktop) foi revertida: com 148
  // `text-sm` ainda fora da escala, ela encolhia o texto corrente para 13,1px.
  // A raiz é uma constante, não uma variável por breakpoint.
  //
  // A escala já foi adotada e a trava saiu, então este teste é hoje o que
  // segura a decisão de *não* ter voltado ainda: mudá-la é mudar este teste
  // junto, de propósito e não por descuido.
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
  expect(desktop).toBe('16px')
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

test('os links de navegação também alcançam 44px no celular', async ({ page }) => {
  // O teste do piso roda em /login, que não tem link nenhum — passava por
  // ausência de caso. A navegação do sistema inteiro é link, e era o que
  // estava fora do piso: 36px em todos os itens.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/residentes/)

  const pequenos: string[] = []
  for (const link of await page.locator('nav a').all()) {
    const caixa = await link.boundingBox()
    if (caixa && caixa.height < 44) pequenos.push(`${await link.innerText()} ${caixa.height.toFixed(0)}px`)
  }
  expect(pequenos, pequenos.join('\n')).toEqual([])
})

test('o botão primário tem contraste de componente nos dois temas', async ({
  page,
}) => {
  // Duas regras, e a segunda é a que escapa: o texto sobre o botão precisa de
  // 4,5:1 (WCAG 1.4.3) e o próprio botão precisa de 3:1 contra o fundo
  // adjacente (WCAG 1.4.11). Um botão legível por dentro e invisível por fora
  // passa no primeiro e reprova no segundo.
  //
  // O fundo adjacente é o do ancestral opaco mais próximo, e NÃO o do `body`:
  // o botão do login vive dentro de um `form` com `bg-superficie`, que cobre a
  // página inteira atrás dele. Medir contra o `body` foi o defeito que deixou
  // passar um 2,89:1 no tema escuro dando 3,53:1 como resposta.
  //
  // Só o `primario` é medido aqui: a tela de login só tem esta variante. As
  // outras duas — `secundario` e `perigo` — são verificadas por cálculo nos
  // comentários de `src/components/ui/botao.tsx`, e não por este teste. Nelas
  // o preenchimento é igual à superfície ao redor (razão ≈ 1,0) e quem carrega
  // o contraste é o `borderColor`; a asserção abaixo, que mede o fundo, as
  // reprovaria estando corretas.
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema })
    await page.goto('/login')

    const medidas = await page
      .getByRole('button', { name: 'Entrar' })
      .evaluate((el) => {
        const opaco = (no: Element | null): string => {
          while (no) {
            const cor = getComputedStyle(no).backgroundColor
            const alfa = cor.match(/[\d.]+/g)?.[3]
            if (cor !== 'transparent' && alfa !== '0') return cor
            no = no.parentElement
          }
          return 'rgb(255, 255, 255)'
        }
        return {
          fundo: getComputedStyle(el).backgroundColor,
          texto: getComputedStyle(el).color,
          atras: opaco(el.parentElement),
        }
      })

    const lum = (cor: string) => {
      const [r, g, b] = (cor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
      const canal = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
    }
    const razao = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }

    expect(razao(medidas.texto, medidas.fundo), `texto do botão no tema ${tema}`)
      .toBeGreaterThanOrEqual(4.5)
    expect(razao(medidas.fundo, medidas.atras), `botão contra o fundo no tema ${tema}`)
      .toBeGreaterThanOrEqual(3)
  }
})

test('o cabeçalho leva o filete dourado, nos dois temas', async ({ page }) => {
  // O dourado é a cor de assinatura da marca e entrou como token sem um único
  // chamador. A §3 da spec restringe onde ele pode aparecer — filete e anel,
  // nunca texto, botão ou fundo de aviso —, e o filete sob o cabeçalho é o
  // único dos dois que não depende dos vetores da marca.
  //
  // A asserção compara com o valor do token, e não com um hexadecimal escrito
  // aqui: assim ela vale nos dois temas sem duplicar literal, e o dia em que
  // alguém reafinar o dourado é o dia em que este teste continua certo. O que
  // ele prende é a ligação — o filete usa `--cor-detalhe` e não a borda comum.
  // A entrada acontece uma vez, fora do laço: o cabeçalho só existe em tela
  // autenticada, e uma segunda passagem por `/login` já logado é redirecionada
  // para `/residentes` — o formulário não estaria lá para ser preenchido.
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/residentes/)

  const filetePorTema: Record<string, string> = {}

  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema })

    const medidas = await page.locator('header').evaluate((el) => {
      const raiz = getComputedStyle(document.documentElement)
      const paraRgb = (valor: string) => {
        const hex = valor.trim().replace('#', '')
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
        return `rgb(${r}, ${g}, ${b})`
      }
      const estilo = getComputedStyle(el)
      return {
        filete: estilo.borderBottomColor,
        espessura: estilo.borderBottomWidth,
        detalhe: paraRgb(raiz.getPropertyValue('--cor-detalhe')),
        comum: paraRgb(raiz.getPropertyValue('--cor-borda')),
      }
    })

    expect(medidas.filete, `filete do cabeçalho no tema ${tema}`).toBe(medidas.detalhe)
    expect(medidas.filete, `filete não pode ser a borda comum (${tema})`).not.toBe(medidas.comum)
    expect(parseFloat(medidas.espessura), `filete visível no tema ${tema}`).toBeGreaterThan(0)
    filetePorTema[tema] = medidas.filete
  }

  // Sem isto o teste seria cego: se a troca de tema não surtisse efeito, ele
  // mediria o tema claro duas vezes e passaria nas três asserções acima. Os
  // dois dourados são medidos e diferentes de propósito — o do escuro é mais
  // claro, porque o do claro sobre superfície escura perderia o filete.
  expect(filetePorTema.light, 'os dois temas têm de dar dourados diferentes')
    .not.toBe(filetePorTema.dark)
})

test('o sistema se chama pelo nome do Lar', async ({ page }) => {
  // O sistema nasceu com o nome do template — "Lar de Idosos" — e ficou assim
  // no título da aba e no cabeçalho de toda tela. O Lar se chama Dona
  // Francisca, e quem abre o sistema tem de reconhecê-lo.
  await page.goto('/login')

  await expect(page).toHaveTitle(/Lar Dona Francisca/)
  await expect(page.getByRole('heading', { name: 'Lar Dona Francisca' })).toBeVisible()
})

test('cada item da navegação leva ícone, e nenhum deles é anunciado sozinho', async ({
  page,
}) => {
  // Os quinze ícones foram vendorizados e ficaram sem uso nenhum. Aqui eles
  // entram — e entram com regra: acompanham o rótulo, nunca o substituem.
  // Ícone sozinho vira adivinhação para quem está de plantão.
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/residentes/)

  const itens = page.locator('nav a')
  const total = await itens.count()
  expect(total).toBeGreaterThan(0)

  for (let i = 0; i < total; i += 1) {
    const item = itens.nth(i)
    await expect(item.locator('svg')).toHaveCount(1)
    // O texto continua lá: o ícone soma, não troca.
    expect((await item.innerText()).trim().length).toBeGreaterThan(0)
    // E o SVG sai da árvore de acessibilidade, senão o leitor de tela
    // anunciaria o nome do ícone antes do rótulo.
    await expect(item.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  }
})