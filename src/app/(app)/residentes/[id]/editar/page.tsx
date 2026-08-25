import { notFound } from 'next/navigation'
import { ErroNaoEncontrado } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { FormularioResidente } from '@/components/formulario-residente'
import { acaoAtualizarResidente } from '../../acoes'

export default async function PaginaEditarResidente({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()
  let residente
  try {
    residente = await obterResidente(ctx, id)
  } catch (erro) {
    // Id inexistente na URL vira 404 em português, e não a tela de exceção.
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-forte">
        Editar {residente.nomeSocial || residente.nomeCompleto}
      </h1>
      <FormularioResidente
        acao={acaoAtualizarResidente}
        residente={residente}
        rotuloBotao="Salvar alterações"
      />
    </section>
  )
}
