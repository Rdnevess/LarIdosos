import { redirect } from 'next/navigation'

// A raiz do sistema não tem conteúdo próprio: quem entra vai para a lista de
// residentes, que é a tela de trabalho da equipe. O acesso continua barrado
// pelo middleware e por `obterCtx` quando não há sessão.
export default function PaginaInicial() {
  redirect('/residentes')
}
