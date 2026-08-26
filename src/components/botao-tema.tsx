'use client'

import { cookieDeTema, lerTema, oposto, type Tema } from '@/lib/tema'
import { Botao } from '@/components/ui/botao'

/**
 * O controle que alterna o tema, e que não depende de hidratação para mostrar
 * o rótulo certo.
 *
 * Ele renderiza **os dois rótulos** e deixa o CSS mostrar exatamente um. Isso
 * resolve um problema real: quando não há cookie, o servidor não tem como saber
 * a preferência do sistema operacional de quem está do outro lado. Qualquer
 * rótulo escolhido no servidor daria divergência de hidratação, e escolhê-lo em
 * JavaScript depois da primeira pintura faria o ícone piscar. O CSS já sabe a
 * resposta antes de qualquer script rodar — as regras de `[data-oferta]` no
 * `globals.css` acompanham os mesmos três blocos que decidem o tema.
 *
 * No clique — e só no clique, quando o navegador já sabe de tudo — o tema
 * efetivo é lido, o oposto é escrito no `<html>` (o que troca o tema na hora,
 * sem ida ao servidor) e o cookie é gravado para que o próximo SSR concorde com
 * o que a pessoa está vendo.
 *
 * O nome acessível vem do `aria-label`, que é estável. Os dois rótulos visíveis
 * são decoração e levam `aria-hidden`: sem isso, um leitor de tela anunciaria
 * "Escuro Claro", e o nome do botão mudaria conforme o tema.
 */
export function BotaoTema() {
  function alternar() {
    const raiz = document.documentElement

    // Sem cookie não há `data-tema`, e aí quem manda é o sistema operacional —
    // a mesma pergunta que o `@media` do CSS faz. Ler o atributo primeiro
    // garante que a escolha explícita continue ganhando do sistema.
    const atual: Tema =
      lerTema(raiz.dataset.tema) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro')

    const escolhido = oposto(atual)
    raiz.dataset.tema = escolhido
    document.cookie = cookieDeTema(escolhido)
  }

  return (
    <Botao
      tipo="button"
      variante="secundario"
      onClick={alternar}
      aria-label="Alternar tema claro e escuro"
      className="whitespace-nowrap"
    >
      <span aria-hidden data-oferta="escuro">
        ☾ Escuro
      </span>
      <span aria-hidden data-oferta="claro">
        ☀ Claro
      </span>
    </Botao>
  )
}
