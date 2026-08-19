import { FormularioResidente } from '@/components/formulario-residente'
import { acaoCriarResidente } from '../acoes'

export default function PaginaNovoResidente() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Novo residente</h1>
      <FormularioResidente acao={acaoCriarResidente} rotuloBotao="Cadastrar residente" />
    </section>
  )
}
