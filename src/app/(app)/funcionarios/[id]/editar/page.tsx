import { notFound } from 'next/navigation'
import { ErroNaoEncontrado } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import { obterFuncionario } from '@/modules/staff/funcionarios.service'
import { FormularioSimples } from '@/components/formulario-simples'
import { CAMPOS_FUNCIONARIO } from '@/components/formulario-funcionario'
import { formatarData } from '@/lib/ptbr'
import { acaoAtualizarFuncionario, acaoDesligarFuncionario } from '../../acoes'

export default async function PaginaEditarFuncionario({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()
  let funcionario
  try {
    funcionario = await obterFuncionario(ctx, id)
  } catch (erro) {
    // Id inexistente na URL vira 404 em português, e não a tela de exceção.
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  const valorInicial = (nome: string): string | undefined => {
    const valor = funcionario[nome as keyof typeof funcionario]
    if (valor instanceof Date) return valor.toISOString().slice(0, 10)
    return valor == null ? undefined : String(valor)
  }

  return (
    <section className="space-y-6">
      <h1 className="text-lg font-semibold text-forte">
        {funcionario.nomeCompleto}
      </h1>

      <div className="rounded border bg-superficie p-4">
        <h2 className="mb-3 font-medium text-forte">Dados cadastrais</h2>
        <FormularioSimples
          acao={acaoAtualizarFuncionario}
          ocultos={{ id: funcionario.id }}
          rotuloBotao="Salvar alterações"
          campos={CAMPOS_FUNCIONARIO.map((campo) => ({
            ...campo,
            valorInicial: valorInicial(campo.nome),
          }))}
        />
      </div>

      {funcionario.ativo ? (
        <div className="rounded border bg-superficie p-4">
          <h2 className="mb-1 font-medium text-forte">Desligamento</h2>
          <p className="mb-3 text-sm text-apoio">
            O registro é preservado; o funcionário deixa de aparecer nas listas e
            nos avisos de registro profissional.
          </p>
          <FormularioSimples
            acao={acaoDesligarFuncionario}
            ocultos={{ id: funcionario.id }}
            rotuloBotao="Registrar desligamento"
            variante="perigo"
            campos={[
              {
                nome: 'dataDesligamento',
                rotulo: 'Data do desligamento',
                tipo: 'date',
                obrigatorio: true,
              },
              { nome: 'motivoDesligamento', rotulo: 'Motivo', obrigatorio: true },
            ]}
          />
        </div>
      ) : (
        <p className="rounded border bg-suave p-4 text-sm text-medio">
          Desligado em{' '}
          {funcionario.dataDesligamento
            ? formatarData(funcionario.dataDesligamento)
            : '—'}{' '}
          — {funcionario.motivoDesligamento ?? 'sem motivo registrado'}
        </p>
      )}
    </section>
  )
}
