import { FormularioSimples } from './formulario-simples'
import {
  acaoCriarAnotacao,
  acaoAdicionarResponsavel,
  acaoRegistrarAvaliacao,
} from '@/app/(app)/residentes/acoes'

export function FormularioAnotacao({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoCriarAnotacao}
      ocultos={{ residenteId }}
      colunas={1}
      rotuloBotao="Registrar anotação"
      campos={[
        {
          nome: 'categoria',
          rotulo: 'Categoria',
          obrigatorio: true,
          opcoes: [
            { valor: 'COMPORTAMENTO', rotulo: 'Comportamento' },
            { valor: 'VISITA_FAMILIA', rotulo: 'Visita da família' },
            { valor: 'OCORRENCIA', rotulo: 'Ocorrência' },
            { valor: 'SOCIAL', rotulo: 'Social' },
            { valor: 'JURIDICO', rotulo: 'Jurídico' },
            { valor: 'OUTRO', rotulo: 'Outro' },
          ],
        },
        { nome: 'texto', rotulo: 'Anotação', obrigatorio: true },
      ]}
    />
  )
}

export function FormularioResponsavel({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoAdicionarResponsavel}
      ocultos={{ residenteId }}
      rotuloBotao="Adicionar responsável"
      campos={[
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        { nome: 'parentesco', rotulo: 'Parentesco', obrigatorio: true },
        { nome: 'cpf', rotulo: 'CPF' },
        { nome: 'telefonePrincipal', rotulo: 'Telefone principal', obrigatorio: true },
        { nome: 'telefoneSecundario', rotulo: 'Telefone secundário' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
      ]}
    />
  )
}

export function FormularioAvaliacao({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarAvaliacao}
      ocultos={{ residenteId }}
      rotuloBotao="Registrar avaliação"
      campos={[
        {
          nome: 'grau',
          rotulo: 'Grau de dependência',
          obrigatorio: true,
          opcoes: [
            { valor: 'I', rotulo: 'Grau I' },
            { valor: 'II', rotulo: 'Grau II' },
            { valor: 'III', rotulo: 'Grau III' },
          ],
        },
        { nome: 'dataAvaliacao', rotulo: 'Data da avaliação', tipo: 'date', obrigatorio: true },
        { nome: 'avaliadorNome', rotulo: 'Avaliado por', obrigatorio: true },
        { nome: 'justificativa', rotulo: 'Justificativa' },
      ]}
    />
  )
}
