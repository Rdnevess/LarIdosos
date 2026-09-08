'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icone, type NomeIcone } from '@/components/icones'

export type ItemDeMenu = { href: string; rotulo: string; icone: NomeIcone }

/**
 * Marca o item da seção em que a pessoa está.
 *
 * **Por subrota, e não por igualdade.** Em `/financeiro/cadastros` quem está
 * aceso é "Financeiro": o menu diz em que seção você está, não em que URL. A
 * checagem é `href + '/'` e não `startsWith(href)` porque este último acenderia
 * "/usuarios" estando em "/usuarios-arquivados", se um dia existir.
 */
export function estaAtivo(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`)
}

/**
 * O menu do topo.
 *
 * Componente de cliente porque saber a rota corrente exige `usePathname`, e o
 * layout que o contém é de servidor — é ele que resolve a sessão e o papel. A
 * lista de itens continua sendo montada lá, a partir do papel: quem decide o
 * que aparece é o servidor, e este componente só decide o que está aceso.
 */
export function MenuPrincipal({ itens }: { itens: ItemDeMenu[] }) {
  const caminho = usePathname()

  return (
    <nav className="mx-auto flex max-w-5xl justify-between gap-1 overflow-x-auto px-3 pb-2">
      {itens.map((item) => {
        const ativo = estaAtivo(caminho, item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            // `aria-current` antes do visual: para quem navega por leitor de
            // tela, é isto — e não o fundo — que diz onde a pessoa está.
            aria-current={ativo ? 'page' : undefined}
            // Dois sinais somados, e não só o fundo: `hover:bg-realce` já
            // ocupa o fundo sozinho, então o ativo precisa de algo que o
            // passar do mouse não produza. A barra inferior é isso.
            //
            // `border-b-2` sempre presente, transparente quando inativo: sem
            // isso o item saltaria dois pixels ao ficar ativo, e a linha
            // inteira do menu tremeria a cada navegação.
            className={`min-h-11 inline-flex items-center gap-2 whitespace-nowrap rounded-lg border-b-2 px-3 py-2 text-corpo hover:bg-realce ${
              ativo
                ? 'border-acao bg-realce font-medium text-forte'
                : 'border-transparent text-firme'
            }`}
          >
            {/* O ícone acompanha o rótulo, nunca o substitui: sozinho ele
                vira adivinhação para quem está de plantão. Sem `rotulo`,
                ele sai da árvore de acessibilidade — o texto ao lado já
                diz o que ele significa. */}
            <Icone nome={item.icone} className="size-4" />
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
