import { FormularioSimples } from '@/components/formulario-simples'
import { CAMPOS_FUNCIONARIO } from '@/components/formulario-funcionario'
import { acaoCriarFuncionario } from '../acoes'

export default function PaginaNovoFuncionario() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Novo funcionário</h1>
      <FormularioSimples
        acao={acaoCriarFuncionario}
        campos={CAMPOS_FUNCIONARIO}
        rotuloBotao="Cadastrar funcionário"
      />
    </section>
  )
}
