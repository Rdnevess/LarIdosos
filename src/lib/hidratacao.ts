'use client'

import { useEffect, useState } from 'react'

/**
 * `'sim'` depois que o React assumiu o formulário no navegador; `undefined`
 * antes disso.
 *
 * Existe por causa de uma falha real, não por gosto de instrumentação. Um
 * formulário de ação de servidor **funciona** antes de hidratar: o navegador
 * envia do jeito nativo e a ação roda. O que muda é que a resposta vem como
 * navegação inteira, e o `open` do `<details>` é estado do DOM que ela
 * descarta. Quem devolve a seção aberta é o `enlace` de `secao.tsx`; este
 * atributo é o que permite ao teste saber por qual dos dois caminhos o envio
 * foi (pendência 14 da Fase 3).
 *
 * Na suíte E2E isso aparecia como falha intermitente, só sob carga e em
 * arquivos diferentes: o clique chegava antes do React. `networkidle` fazia a
 * intermitência sumir, mas é aproximação — não diz nada sobre hidratação. Este
 * atributo diz, e é por isso que ele vive no código de produção em vez de num
 * ajudante de teste: o teste não tem como observar de fora um estado que só o
 * cliente conhece.
 */
export function useHidratado(): 'sim' | undefined {
  const [hidratado, setHidratado] = useState(false)
  useEffect(() => setHidratado(true), [])
  return hidratado ? 'sim' : undefined
}
