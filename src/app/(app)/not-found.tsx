import Link from 'next/link'

/**
 * Tela de "não encontrado" das rotas autenticadas. Alcançada quando uma
 * página chama `notFound()` — hoje, as telas de `[id]` que recebem um id
 * inexistente na URL e traduzem o `ErroNaoEncontrado` do serviço
 * (`src/app/(app)/residentes/[id]/page.tsx` e as outras três com `[id]`).
 *
 * Sem ela, um id errado na barra de endereço caía na fronteira de erro, que
 * fala de "falha temporária" — mensagem errada para um registro que
 * simplesmente não existe.
 */
export default function NaoEncontrado() {
  return (
    <section className="space-y-4 rounded border bg-white p-4">
      <h1 className="text-lg font-semibold text-slate-800">
        Registro não encontrado
      </h1>
      <p className="text-sm text-slate-600">
        O endereço não corresponde a nenhum cadastro. Ele pode ter sido
        digitado errado, ou o link pode estar desatualizado.
      </p>
      <Link
        href="/residentes"
        className="inline-block rounded bg-slate-800 px-4 py-3 text-sm text-white"
      >
        Voltar aos residentes
      </Link>
    </section>
  )
}
