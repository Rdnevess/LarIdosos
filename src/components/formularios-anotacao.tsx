import { FormularioSimples } from './formulario-simples'
import { JANELA_EDICAO_MINUTOS } from '@/lib/janela-edicao'
import { acaoEditarAnotacao, acaoRetificarAnotacao } from '@/app/(app)/residentes/acoes'

/**
 * Os dois caminhos que a regra R3 prevê para corrigir uma anotação já
 * registrada. Estavam implementados e testados no serviço, e sem tela: a
 * ficha até exibia o rótulo "· retificação" para anotações que ninguém
 * conseguia criar.
 *
 * Cada formulário recebe um `prefixoId` próprio porque a ficha os renderiza
 * em laço, um por anotação — sem isso todos os campos `texto` da página
 * dividiriam o mesmo `id` (ver `campo.tsx`).
 */
export function FormularioEditarAnotacao({
  anotacaoId,
  residenteId,
  textoAtual,
}: {
  anotacaoId: string
  residenteId: string
  textoAtual: string
}) {
  return (
    <FormularioSimples
      acao={acaoEditarAnotacao}
      ocultos={{ id: anotacaoId, residenteId }}
      colunas={1}
      prefixoId={`editar-${anotacaoId}`}
      rotuloBotao="Salvar correção"
      aviso={`A correção substitui o texto e só vale nos primeiros ${JANELA_EDICAO_MINUTOS} minutos. Passado esse prazo, use "Retificar".`}
      campos={[
        {
          nome: 'texto',
          rotulo: 'Texto corrigido',
          obrigatorio: true,
          valorInicial: textoAtual,
        },
      ]}
    />
  )
}

/**
 * Não oferece o campo de categoria, embora `retificacaoSchema` o aceite como
 * opcional: a retificação corrige o que foi escrito, não reclassifica o
 * evento, e `retificarAnotacao` herda a categoria da original quando o campo
 * não vem (`src/modules/residents/anotacoes.service.ts`, no `entrada.categoria
 * ?? original.categoria`). Reclassificar exigiria uma decisão de produto que
 * esta fase não tomou.
 */
export function FormularioRetificarAnotacao({
  anotacaoId,
  residenteId,
}: {
  anotacaoId: string
  residenteId: string
}) {
  return (
    <FormularioSimples
      acao={acaoRetificarAnotacao}
      ocultos={{ id: anotacaoId, residenteId }}
      colunas={1}
      prefixoId={`retificar-${anotacaoId}`}
      rotuloBotao="Registrar retificação"
      aviso="A anotação original continua na ficha, sem alteração. A retificação entra como um registro novo, ligado a ela."
      campos={[{ nome: 'texto', rotulo: 'Texto da retificação', obrigatorio: true }]}
    />
  )
}
