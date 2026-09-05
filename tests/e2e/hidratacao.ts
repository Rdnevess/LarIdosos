import type { Page } from '@playwright/test'

/**
 * Espera os formulários da página hidratarem, antes de clicar em qualquer um.
 *
 * Sem isto o clique pode chegar antes do React: o `<form>` de uma ação de
 * servidor é enviado do jeito nativo, a ação **roda normalmente**, mas a
 * resposta vem como navegação inteira — com os `<details>` fechados e a
 * mensagem de resultado fora de vista. É a pendência 14 da Fase 3.
 *
 * Aparecia como falha intermitente, só na suíte cheia e em arquivos
 * diferentes: `financeiro.spec.ts` e `residentes.spec.ts`. Isolado, nunca.
 *
 * `data-hidratado` vem de `useHidratado`, em `src/lib/hidratacao.ts`. A
 * primeira versão disto esperava por `networkidle`, que fazia a intermitência
 * sumir sem dizer nada sobre hidratação — trocar uma aproximação que funciona
 * por um fato é o que separa um teste estável de um teste com sorte.
 */
export async function esperarHidratacao(pagina: Page): Promise<void> {
  // `attached`, e não o `visible` padrão: os formulários vivem dentro de
  // `<details>` fechados, e hidratar não tem nada a ver com estar à vista.
  await pagina.locator('form[data-hidratado="sim"]').first().waitFor({ state: 'attached' })
}
