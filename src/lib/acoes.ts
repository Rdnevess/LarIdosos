import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from './erros'

/**
 * `mensagem` é o sucesso que precisa dizer mais do que "salvou": a mesclagem
 * de categorias devolve quantos lançamentos mudaram de lugar e quantos
 * ficaram presos a uma prestação fechada, e engolir esse número faria a tela
 * mentir por omissão sobre uma limpeza que não foi total.
 */
export type EstadoAcao = { erro?: string; sucesso?: boolean; mensagem?: string }

/**
 * Adapta a camada de serviço ao formulário: erro de domínio vira mensagem para
 * o usuário; qualquer outro vira mensagem genérica e vai para o log do
 * servidor. Detalhe de exceção interna na tela é vazamento de informação.
 */
export async function executarAcao<T>(fn: () => Promise<T>): Promise<EstadoAcao> {
  try {
    await fn()
    return { sucesso: true }
  } catch (erro) {
    if (
      erro instanceof ErroValidacao ||
      erro instanceof ErroPermissao ||
      erro instanceof ErroNaoEncontrado
    ) {
      return { erro: erro.message }
    }
    console.error(erro)
    return { erro: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
