import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * A travessia que só a tela prova: chegar pelo prontuário, trocar de medida e
 * de janela pela URL, e ver o desenho mudar junto.
 *
 * Residente e aferições vêm direto do Prisma, como em `alertas-vitais.spec.ts`:
 * cadastrá-los pela interface levaria minutos e não testaria nada que
 * `prontuario.spec.ts` já não teste. O prefixo permite apagá-los no fim sem
 * tocar em mais nada do banco de desenvolvimento, compartilhado entre execuções.
 */
const PREFIXO = 'ZZTendencia'
const prisma = new PrismaClient()

const DIAS = 86_400_000
let residenteId = ''

/**
 * O gráfico, pelo papel que ele ocupa na árvore de acessibilidade. Um
 * `svg circle` solto pegaria junto os ícones do layout, que também são
 * círculos em SVG — foi o que aconteceu na primeira versão deste teste.
 */
function grafico(page: Page, medida = 'Peso') {
  return page.getByRole('img', { name: new RegExp(`^${medida}:`) })
}

async function limpar(): Promise<void> {
  await prisma.sinalVital.deleteMany({
    where: { residente: { nomeCompleto: { startsWith: PREFIXO } } },
  })
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })
}

test.beforeAll(async () => {
  await limpar()

  const residente = await prisma.residente.create({
    data: {
      nomeCompleto: `${PREFIXO} Maria`,
      dataNascimento: new Date('1938-03-02'),
      sexo: 'FEMININO',
      dataAdmissao: new Date('2025-01-01'),
    },
  })
  residenteId = residente.id

  // Duas pesagens dentro de trinta dias e uma de duzentos dias atrás. A antiga
  // é o que separa uma janela da outra.
  await prisma.sinalVital.createMany({
    data: [
      { residenteId, aferidoEm: new Date(Date.now() - 200 * DIAS), peso: 78 },
      { residenteId, aferidoEm: new Date(Date.now() - 20 * DIAS), peso: 72 },
      { residenteId, aferidoEm: new Date(Date.now() - 3 * DIAS), peso: 70.5 },
    ],
  })
  // Uma pressão fora da faixa, para o ponto vermelho existir.
  await prisma.sinalVital.create({
    data: { residenteId, aferidoEm: new Date(Date.now() - 2 * DIAS), pressaoSistolica: 190 },
  })
  // Glicemia **só** fora de qualquer janela menor que um ano: é o caso do
  // vazio que pede abrir o período, e não do vazio que pede começar a medir.
  // Saturação fica sem nenhuma aferição, e é o outro caso.
  await prisma.sinalVital.create({
    data: { residenteId, aferidoEm: new Date(Date.now() - 200 * DIAS), glicemia: 110 },
  })
})

test.afterAll(async () => {
  await limpar()
  await prisma.$disconnect()
})

test('o prontuário leva à tendência, e ela abre no peso', async ({ page }) => {
  await page.goto(`/residentes/${residenteId}/prontuario`)
  // O prontuário tem dois `summary` com este texto: o da lista de aferições,
  // que traz a contagem entre parênteses, e o do formulário de registro rápido.
  await page.locator('summary').filter({ hasText: /Sinais vitais \(/ }).click()
  await page.getByRole('link', { name: 'Ver tendência' }).click()

  await expect(page.getByRole('heading', { name: /Tendência/ })).toBeVisible()
  // Peso abre a tela por ser a única medida sem alerta nenhum.
  await expect(page.getByRole('link', { name: 'Peso' })).toHaveAttribute(
    'aria-current',
    'page'
  )

  // Escopado ao gráfico pelo papel na árvore de acessibilidade, e não por
  // `svg circle` solto: os ícones do layout também são círculos em SVG.
  // Duas pesagens na janela padrão de noventa dias — a de duzentos fica fora.
  await expect(grafico(page).locator('circle')).toHaveCount(2)
})

test('a janela maior traz a aferição antiga, e a menor a deixa de fora', async ({
  page,
}) => {
  await page.goto(`/residentes/${residenteId}/prontuario/tendencia?medida=PESO&dias=365`)
  await expect(grafico(page).locator('circle')).toHaveCount(3)

  await page.getByRole('link', { name: '30 dias' }).click()
  await expect(grafico(page).locator('circle')).toHaveCount(2)

  // O resumo acessível é o que quem não enxerga o desenho recebe, e ele tem de
  // acompanhar a janela em vez de descrever o gráfico anterior.
  await expect(grafico(page)).toHaveAttribute('aria-label', /2 aferições/)
})

test('o ponto fora da faixa se distingue do que está dentro', async ({ page }) => {
  await page.goto(
    `/residentes/${residenteId}/prontuario/tendencia?medida=PRESSAO_SISTOLICA&dias=30`
  )

  // 190 com faixa do sistema de 90–140: o ponto é de perigo, não de ação.
  const desenho = grafico(page, 'Pressão sistólica')
  await expect(desenho.locator('circle.fill-perigo')).toHaveCount(1)
  await expect(desenho.locator('circle.fill-acao')).toHaveCount(0)
})

test('parâmetro inventado na URL não derruba a tela', async ({ page }) => {
  await page.goto(
    `/residentes/${residenteId}/prontuario/tendencia?medida=BANANA&dias=100000`
  )

  await expect(page.getByRole('heading', { name: /Tendência/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Peso' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByRole('link', { name: '90 dias' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByText(/ErroPermissao|Prisma|at Object/)).toHaveCount(0)
})

test('os dois vazios dizem coisas diferentes', async ({ page }) => {
  // Nunca aferida: o conselho é começar a medir.
  await page.goto(
    `/residentes/${residenteId}/prontuario/tendencia?medida=SATURACAO_O2&dias=90`
  )
  await expect(page.getByText(/nunca foi aferid/)).toBeVisible()

  // Aferida, mas antes da janela: o conselho é o oposto — abrir o período. Os
  // dois trechos precisam existir, e não só diferir na segunda tela: a
  // primeira versão deste teste passava com as duas mensagens iguais, porque
  // a medida que ele escolheu tinha aferição recente e a tela nem ficava vazia.
  await page.goto(
    `/residentes/${residenteId}/prontuario/tendencia?medida=GLICEMIA&dias=90`
  )
  await expect(page.getByText(/período maior/)).toBeVisible()
  await expect(page.getByText(/nunca foi aferid/)).toHaveCount(0)
})

test('a tendência é recusada ao perfil ADMINISTRATIVO, e a trilha registra', async ({
  browser,
  page,
}) => {
  const administrativo = await browser.newContext({
    storageState: 'tests/e2e/.sessao-administrativo.json',
    baseURL: 'http://localhost:3000',
  })
  const paginaAdministrativo = await administrativo.newPage()
  await paginaAdministrativo.goto(`/residentes/${residenteId}/prontuario/tendencia`)

  await expect(
    paginaAdministrativo.getByRole('heading', { name: /Não foi possível abrir esta tela/ })
  ).toBeVisible()
  await expect(
    paginaAdministrativo.getByText(/ErroPermissao|Prisma|at Object/)
  ).toHaveCount(0)
  await administrativo.close()

  await page.goto('/auditoria')
  await page.getByLabel('Entidade').selectOption('SinalVital')
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByText('Acesso negado').first()).toBeVisible()
})
