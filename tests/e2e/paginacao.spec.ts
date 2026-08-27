import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * A paginação das listas, exercitada pela tela.
 *
 * Os testes de unidade dos serviços já provam a fatia, a contagem e a
 * estabilidade da ordem. O que só aqui se prova é o que a pessoa faz: chegar,
 * ver vinte, pedir mais, e a URL levar o filtro junto.
 *
 * **Os residentes são criados direto pelo Prisma, e não pela tela.** Vinte e
 * cinco cadastros pela interface levariam minutos e não testariam nada que o
 * `residentes.spec.ts` já não teste. O prefixo no nome é o que permite
 * filtrá-los e, no fim, apagá-los sem tocar em nada do banco de
 * desenvolvimento — que é compartilhado entre execuções.
 */
const PREFIXO = 'ZZPaginacao'
const QUANTOS = 25

const prisma = new PrismaClient()

test.beforeAll(async () => {
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })
  await prisma.residente.createMany({
    data: Array.from({ length: QUANTOS }, (_, i) => ({
      // Sufixo numérico com zeros à esquerda: a ordem alfabética passa a ser
      // previsível, e a asserção de quem está na página 2 deixa de depender
      // de como o banco desempata nomes parecidos.
      nomeCompleto: `${PREFIXO} ${String(i).padStart(3, '0')}`,
      dataNascimento: new Date('1940-01-01'),
      sexo: 'FEMININO' as const,
      dataAdmissao: new Date('2026-01-01'),
      quarto: '99',
    })),
  })
})

test.afterAll(async () => {
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })
  await prisma.$disconnect()
})

test('a lista abre com vinte, e a página seguinte traz o resto', async ({ page }) => {
  await page.goto(`/residentes?busca=${PREFIXO}`)

  await expect(page.locator('ul.cartao > li')).toHaveCount(20)
  await expect(page.getByText(`${QUANTOS} residente(s) · página 1 de 2`)).toBeVisible()

  await page.getByRole('link', { name: 'Próxima' }).click()

  await expect(page.locator('ul.cartao > li')).toHaveCount(5)
  await expect(page.getByText(`${QUANTOS} residente(s) · página 2 de 2`)).toBeVisible()

  // O filtro tem de sobreviver à troca de página: quem buscou e avançou espera
  // a página 2 *da busca*, e não da lista inteira.
  expect(page.url()).toContain(`busca=${PREFIXO}`)
})

test('o seletor de tamanho muda quantos aparecem, e volta para a primeira página', async ({
  page,
}) => {
  await page.goto(`/residentes?busca=${PREFIXO}&pagina=2`)
  await expect(page.getByText('página 2 de 2')).toBeVisible()

  await page.getByRole('link', { name: '40', exact: true }).click()

  // Vinte e cinco cabem em quarenta: uma página só, e todos visíveis.
  await expect(page.locator('ul.cartao > li')).toHaveCount(QUANTOS)
  await expect(page.getByText(`${QUANTOS} residente(s) · página 1 de 1`)).toBeVisible()

  // Voltar para a primeira página não é detalhe: mantendo `pagina=2` ao subir
  // para 40, a tela mostraria uma lista vazia — a página 2 deixou de existir.
  expect(page.url()).toContain('pagina=1')
  await expect(page.getByRole('link', { name: 'Próxima' })).toHaveCount(0)
})

test('um tamanho inventado na URL cai no padrão, em vez de trazer o banco inteiro', async ({
  page,
}) => {
  // A URL é digitável por quem já entrou. `?por=100000` numa lista grande
  // traria a tabela inteira para a memória do servidor.
  await page.goto(`/residentes?busca=${PREFIXO}&por=100000`)

  await expect(page.locator('ul.cartao > li')).toHaveCount(20)
  await expect(page.getByText(`${QUANTOS} residente(s) · página 1 de 2`)).toBeVisible()
})
