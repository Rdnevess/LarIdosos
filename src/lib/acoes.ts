import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from './erros'

export type EstadoAcao = { erro?: string; sucesso?: boolean }

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
