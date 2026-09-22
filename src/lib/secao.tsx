'use client'

import { createContext, useContext } from 'react'

/**
 * O endereço que reabre a seção onde o formulário está.
 *
 * Existe por causa da pendência 14 da Fase 3. Um formulário de ação de
 * servidor funciona antes de a página hidratar — o navegador envia do jeito
 * nativo e a ação roda —, só que a resposta vem como navegação inteira e o
 * `open` do `<details>` é estado do DOM: a navegação o descarta. A operação
 * acontece, e o que ela informa fica fora de vista dentro da seção recolhida.
 *
 * O conserto usa o terceiro argumento do `useActionState`, que o React criou
 * exatamente para isto: antes da hidratação o `<form>` passa a apontar para
 * este endereço em vez da URL corrente, e o estado devolvido pela ação é
 * reencontrado no destino pela chave `"p" + enlace`. Basta que o destino
 * renderize o mesmo formulário — e que saiba abrir a seção, o que ele faz
 * lendo `?secao=` da própria URL.
 *
 * Depois da hidratação o argumento não tem efeito nenhum: o React chama a
 * ação direto e não há navegação para descartar coisa alguma.
 *
 * É contexto, e não propriedade, porque quem conhece a seção é o `<details>`
 * que a envolve, e quem precisa do endereço é o `<form>` lá dentro — com
 * listas, títulos e outros formulários no meio. Encadear a propriedade por
 * todos eles só produziria oportunidade de esquecer um.
 */
const ContextoSecao = createContext<string | undefined>(undefined)

export function ProvedorSecao({
  enlace,
  children,
}: {
  enlace: string
  children: React.ReactNode
}) {
  return <ContextoSecao.Provider value={enlace}>{children}</ContextoSecao.Provider>
}

/** `undefined` fora de uma seção — aí o formulário envia para a URL corrente,
 *  que é o comportamento de sempre. */
export function useEnlaceDaSecao(): string | undefined {
  return useContext(ContextoSecao)
}
