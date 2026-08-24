import type { Responsavel } from '@prisma/client'
import { FormularioSimples } from './formulario-simples'
import { formatarCpf } from '@/lib/ptbr'
import {
  acaoCriarAnotacao,
  acaoAdicionarResponsavel,
  acaoAtualizarResponsavel,
  acaoRemoverResponsavel,
  acaoExcluirDocumento,
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
        // Sem estas três, a ação lê `dados.get(...) === 'on'` de campos que não
        // existem e grava tudo como `false`: o contato de emergência nunca
        // apareceria no cabeçalho da ficha — exatamente o dado que alguém
        // procura numa urgência —, e `autorizadoVisitar` sobrescreveria com
        // `false` o padrão `true` do schema.
        { nome: 'ehResponsavelLegal', rotulo: 'É responsável legal', tipo: 'checkbox' },
        { nome: 'ehContatoEmergencia', rotulo: 'É contato de emergência', tipo: 'checkbox' },
        {
          nome: 'autorizadoVisitar',
          rotulo: 'Autorizado a visitar',
          tipo: 'checkbox',
          marcadoInicial: true,
        },
      ]}
    />
  )
}

/**
 * Edição de responsável. Existia no serviço desde a Fase 1 e não tinha tela: um
 * telefone novo exigia remover e recadastrar — e remover também não existia,
 * então o telefone velho ficava na ficha para sempre.
 *
 * Oferece todos os campos, inclusive os opcionais em branco. É deliberado:
 * campo oferecido e deixado vazio chega ao serviço como `null` e limpa a
 * coluna (`src/lib/formulario.ts`), então esta é também a tela que apaga um
 * telefone secundário que deixou de existir.
 *
 * O `prefixoId` é obrigatório aqui — a ficha renderiza um destes por
 * responsável, e sem ele todos os campos `nome` da página dividiriam o mesmo
 * `id` (ver `campo.tsx`).
 */
export function FormularioEditarResponsavel({
  responsavel,
  residenteId,
}: {
  responsavel: Responsavel
  residenteId: string
}) {
  return (
    <FormularioSimples
      acao={acaoAtualizarResponsavel}
      ocultos={{ id: responsavel.id, residenteId }}
      prefixoId={`editar-responsavel-${responsavel.id}`}
      rotuloBotao="Salvar responsável"
      campos={[
        {
          nome: 'nome',
          rotulo: 'Nome',
          obrigatorio: true,
          valorInicial: responsavel.nome,
        },
        {
          nome: 'parentesco',
          rotulo: 'Parentesco',
          obrigatorio: true,
          valorInicial: responsavel.parentesco,
        },
        {
          nome: 'cpf',
          rotulo: 'CPF',
          // Formatado para leitura; o schema tira a pontuação de volta ao
          // gravar (`somenteDigitos`, em `residentes.schema.ts`).
          valorInicial: responsavel.cpf ? formatarCpf(responsavel.cpf) : undefined,
        },
        {
          nome: 'telefonePrincipal',
          rotulo: 'Telefone principal',
          obrigatorio: true,
          valorInicial: responsavel.telefonePrincipal,
        },
        {
          nome: 'telefoneSecundario',
          rotulo: 'Telefone secundário',
          valorInicial: responsavel.telefoneSecundario ?? undefined,
        },
        {
          nome: 'email',
          rotulo: 'E-mail',
          tipo: 'email',
          valorInicial: responsavel.email ?? undefined,
        },
        {
          nome: 'ehResponsavelLegal',
          rotulo: 'É responsável legal',
          tipo: 'checkbox',
          marcadoInicial: responsavel.ehResponsavelLegal,
        },
        {
          nome: 'ehContatoEmergencia',
          rotulo: 'É contato de emergência',
          tipo: 'checkbox',
          marcadoInicial: responsavel.ehContatoEmergencia,
        },
        {
          nome: 'autorizadoVisitar',
          rotulo: 'Autorizado a visitar',
          tipo: 'checkbox',
          marcadoInicial: responsavel.autorizadoVisitar,
        },
      ]}
    />
  )
}

/**
 * Remover é desativar: o registro fica no banco com `ativo: false` e sai das
 * listagens. Quem foi responsável por um residente é parte da história dele, e
 * a trilha de auditoria precisa poder mostrá-la.
 */
export function FormularioRemoverResponsavel({
  responsavelId,
  residenteId,
}: {
  responsavelId: string
  residenteId: string
}) {
  return (
    <FormularioSimples
      acao={acaoRemoverResponsavel}
      ocultos={{ id: responsavelId, residenteId }}
      colunas={1}
      prefixoId={`remover-responsavel-${responsavelId}`}
      rotuloBotao="Remover responsável"
      aviso="O responsável sai da ficha, mas o registro continua no banco e na trilha de auditoria. Use quando a pessoa deixou de ser responsável — não para corrigir um cadastro errado, que é caso de edição."
      campos={[]}
    />
  )
}

/**
 * Exclusão de documento — o caminho que faltava para tirar da ficha o que foi
 * anexado por engano. Sem ele, a única saída era o banco.
 *
 * Não recebe condição de papel: `excluirDocumento` autoriza com o mesmo
 * `papeisQuePodemVer` que filtra a listagem, então todo documento que a ficha
 * mostra é um documento que aquele papel pode excluir.
 */
export function FormularioExcluirDocumento({
  documentoId,
  residenteId,
}: {
  documentoId: string
  residenteId: string
}) {
  return (
    <FormularioSimples
      acao={acaoExcluirDocumento}
      ocultos={{ id: documentoId, residenteId }}
      colunas={1}
      prefixoId={`excluir-documento-${documentoId}`}
      rotuloBotao="Excluir documento"
      aviso="O documento sai da ficha, mas o arquivo e o registro continuam guardados, e a exclusão é auditada com o nome de quem a fez."
      campos={[]}
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
