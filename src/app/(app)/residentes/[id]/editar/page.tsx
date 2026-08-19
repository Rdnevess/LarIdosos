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
  const residente = await obterResidente(ctx, id)

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">
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
