'use client'

import Link from 'next/link'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'

/**
 * Fronteira de erro das telas autenticadas. Sem ela, qualquer exceção que
 * escapasse de um componente de servidor — um `ErroPermissao` de
 * `exigirPapel` (`src/lib/contexto.ts`) num serviço chamado por uma rota que
 * o papel não alcança, uma falha de conexão com o banco — entregava a tela
 * genérica do Next, em inglês.
 *
 * Não é `obterCtx` (`src/modules/auth/sessao.ts`): sessão revogada é tratada
 * antes de chegar aqui, porque `(app)/layout.tsx` chama `obterCtxOuNulo` e
 * redireciona para `/login` quando o retorno é nulo.
 *
 * **Não mostra `error.message`.** A mensagem pode carregar caminho de
 * arquivo, host e porta do banco ou trecho de SQL; é o mesmo motivo pelo qual
 * `executarAcao` troca exceção inesperada por texto genérico
 * (`src/lib/acoes.ts`). O `digest` é um hash que o Next gera para correlacionar
 * esta tela com a linha correspondente no log do servidor — ele não contém a
 * mensagem, e é o que a coordenação pode repassar a quem for investigar.
 *
 * Precisa ser componente de cliente: é exigência do Next para `error.tsx`, que
 * recebe `reset` como função.
 */
export default function ErroNaTela({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Cartao className="space-y-4">
      <h1 className="text-secao font-semibold text-forte">
        Não foi possível abrir esta tela
      </h1>
      <p className="text-suporte text-medio">
        Pode ser uma falha temporária, ou o seu perfil pode não ter permissão
        para esta parte do sistema. Tente de novo; se continuar, avise a
        coordenação.
      </p>

      <div className="flex flex-wrap gap-3">
        <Botao tipo="button" onClick={reset}>
          Tentar de novo
        </Botao>
        <Link
          href="/residentes"
          className="min-h-11 inline-flex items-center rounded border border-borda px-4 py-3 text-suporte text-firme"
        >
          Voltar aos residentes
        </Link>
      </div>

      {error.digest && (
        <p className="text-legenda text-medio">
          Código para o suporte: {error.digest}
        </p>
      )}
    </Cartao>
  )
}
