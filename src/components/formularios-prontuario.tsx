import { FormularioSimples } from './formulario-simples'
import { JANELA_EDICAO_MINUTOS } from '@/lib/janela-edicao'
import {
  acaoRegistrarAlergia,
  acaoRegistrarCondicaoCronica,
  acaoRegistrarRestricaoAlimentar,
  acaoDesativarAlergia,
  acaoDesativarCondicaoCronica,
  acaoDesativarRestricaoAlimentar,
  acaoCriarAnotacaoSaude,
  acaoEditarAnotacaoSaude,
  acaoRetificarAnotacaoSaude,
  acaoRegistrarSinalVital,
  acaoRegistrarExame,
  acaoAtualizarExame,
  acaoRegistrarConsulta,
  acaoAtualizarConsulta,
  acaoRegistrarVacina,
} from '@/app/(app)/residentes/[id]/prontuario/acoes'

/**
 * Os formulários do prontuário. Cada um recebe `prefixoId` porque a página os
 * renderiza em laço — sem isso todos os campos `descricao` dividiriam o mesmo
 * `id` (ver `campo.tsx`).
 */

export function FormularioAlergia({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarAlergia}
      ocultos={{ residenteId }}
      prefixoId="nova-alergia"
      rotuloBotao="Registrar alergia"
      campos={[
        { nome: 'agente', rotulo: 'Agente', obrigatorio: true },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          obrigatorio: true,
          opcoes: [
            { valor: 'MEDICAMENTO', rotulo: 'Medicamento' },
            { valor: 'ALIMENTO', rotulo: 'Alimento' },
            { valor: 'OUTRO', rotulo: 'Outro' },
          ],
        },
        {
          nome: 'gravidade',
          rotulo: 'Gravidade',
          obrigatorio: true,
          opcoes: [
            { valor: 'GRAVE', rotulo: 'Grave' },
            { valor: 'MODERADA', rotulo: 'Moderada' },
            { valor: 'LEVE', rotulo: 'Leve' },
          ],
        },
        { nome: 'reacao', rotulo: 'Reação' },
      ]}
    />
  )
}

export function FormularioCondicaoCronica({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarCondicaoCronica}
      ocultos={{ residenteId }}
      prefixoId="nova-condicao"
      rotuloBotao="Registrar condição"
      campos={[
        { nome: 'descricao', rotulo: 'Condição', obrigatorio: true },
        { nome: 'cid10', rotulo: 'CID-10' },
        { nome: 'dataDiagnostico', rotulo: 'Data do diagnóstico', tipo: 'date' },
      ]}
    />
  )
}

export function FormularioRestricaoAlimentar({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarRestricaoAlimentar}
      ocultos={{ residenteId }}
      prefixoId="nova-restricao"
      colunas={1}
      rotuloBotao="Registrar restrição"
      campos={[{ nome: 'descricao', rotulo: 'Restrição', obrigatorio: true }]}
    />
  )
}

const ACOES_DESATIVAR = {
  alergia: acaoDesativarAlergia,
  condicao: acaoDesativarCondicaoCronica,
  restricao: acaoDesativarRestricaoAlimentar,
} as const

/**
 * Retirar do cabeçalho é exclusão lógica: o registro fica no banco e na
 * trilha. Uma alergia que se confirmou não existir, ou uma condição que
 * deixou de ser tratada, é parte da história clínica da pessoa.
 */
export function FormularioDesativar({
  acao,
  registroId,
  residenteId,
  rotulo,
}: {
  acao: keyof typeof ACOES_DESATIVAR
  registroId: string
  residenteId: string
  rotulo: string
}) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-slate-600 underline">Retirar</summary>
      <div className="mt-2">
        <FormularioSimples
          acao={ACOES_DESATIVAR[acao]}
          ocultos={{ id: registroId, residenteId }}
          colunas={1}
          prefixoId={`desativar-${registroId}`}
          rotuloBotao={rotulo}
          aviso="O registro sai do cabeçalho, mas continua no banco e na trilha de auditoria."
          campos={[]}
        />
      </div>
    </details>
  )
}

/**
 * Os três botões grandes da §9 do design: se registrar der trabalho, ninguém
 * registra, e o sistema vira um caderno digital vazio. O quarto botão que a
 * spec prevê — medicação — chega com a Fase 2B.
 *
 * Data e hora vêm em branco e caem no agora quando não preenchidas, mas
 * continuam disponíveis: o registro retroativo da madrugada é o caso que a
 * §9 protege.
 */

const CATEGORIAS_SAUDE = [
  { valor: 'EVOLUCAO', rotulo: 'Evolução' },
  { valor: 'INTERCORRENCIA', rotulo: 'Intercorrência' },
  { valor: 'ALIMENTACAO', rotulo: 'Alimentação' },
  { valor: 'SONO', rotulo: 'Sono' },
  { valor: 'HIGIENE', rotulo: 'Higiene' },
  { valor: 'COMPORTAMENTO', rotulo: 'Comportamento' },
  { valor: 'QUEDA', rotulo: 'Queda' },
]

const TURNOS = [
  { valor: 'MANHA', rotulo: 'Manhã' },
  { valor: 'TARDE', rotulo: 'Tarde' },
  { valor: 'NOITE', rotulo: 'Noite' },
]

const GRAVIDADES = [
  { valor: 'LEVE', rotulo: 'Leve' },
  { valor: 'MODERADA', rotulo: 'Moderada' },
  { valor: 'GRAVE', rotulo: 'Grave' },
]

/**
 * Evolução e intercorrência são o mesmo formulário com a categoria fixa. São
 * dois botões, e não um seletor, porque a §9 pede um toque para o caso comum:
 * quem está com o celular na mão no corredor não deve escolher numa lista de
 * sete antes de escrever.
 */
export function FormularioAnotacaoSaude({
  residenteId,
  categoriaFixa,
  rotuloBotao,
  prefixoId,
}: {
  residenteId: string
  categoriaFixa?: 'EVOLUCAO' | 'INTERCORRENCIA'
  rotuloBotao: string
  prefixoId: string
}) {
  return (
    <FormularioSimples
      acao={acaoCriarAnotacaoSaude}
      ocultos={
        categoriaFixa ? { residenteId, categoria: categoriaFixa } : { residenteId }
      }
      prefixoId={prefixoId}
      colunas={categoriaFixa ? 1 : 2}
      rotuloBotao={rotuloBotao}
      campos={[
        ...(categoriaFixa
          ? []
          : [
              {
                nome: 'categoria',
                rotulo: 'Categoria',
                obrigatorio: true,
                opcoes: CATEGORIAS_SAUDE,
              },
            ]),
        { nome: 'texto', rotulo: 'Anotação', obrigatorio: true },
        { nome: 'turno', rotulo: 'Turno', opcoes: TURNOS },
        { nome: 'ocorridoEm', rotulo: 'Quando ocorreu', tipo: 'datetime-local' },
        { nome: 'gravidade', rotulo: 'Gravidade', opcoes: GRAVIDADES },
        { nome: 'conduta', rotulo: 'Conduta' },
      ]}
    />
  )
}

export function FormularioEditarAnotacaoSaude({
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
      acao={acaoEditarAnotacaoSaude}
      ocultos={{ id: anotacaoId, residenteId }}
      colunas={1}
      prefixoId={`editar-saude-${anotacaoId}`}
      rotuloBotao="Salvar correção"
      aviso={`A correção substitui o texto e só vale nos primeiros ${JANELA_EDICAO_MINUTOS} minutos, para quem escreveu. Passado o prazo, use "Retificar".`}
      campos={[
        { nome: 'texto', rotulo: 'Texto corrigido', obrigatorio: true, valorInicial: textoAtual },
      ]}
    />
  )
}

export function FormularioRetificarAnotacaoSaude({
  anotacaoId,
  residenteId,
}: {
  anotacaoId: string
  residenteId: string
}) {
  return (
    <FormularioSimples
      acao={acaoRetificarAnotacaoSaude}
      ocultos={{ id: anotacaoId, residenteId }}
      colunas={1}
      prefixoId={`retificar-saude-${anotacaoId}`}
      rotuloBotao="Registrar retificação"
      aviso="A anotação original continua no prontuário, sem alteração. A retificação entra como registro novo, ligado a ela."
      campos={[{ nome: 'texto', rotulo: 'Texto da retificação', obrigatorio: true }]}
    />
  )
}

export function FormularioSinalVital({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarSinalVital}
      ocultos={{ residenteId }}
      prefixoId="novo-sinal"
      rotuloBotao="Registrar sinais vitais"
      aviso="Preencha só o que foi aferido. Ao menos uma medida é necessária."
      campos={[
        { nome: 'pressaoSistolica', rotulo: 'Pressão sistólica', tipo: 'number' },
        { nome: 'pressaoDiastolica', rotulo: 'Pressão diastólica', tipo: 'number' },
        { nome: 'frequenciaCardiaca', rotulo: 'Frequência cardíaca', tipo: 'number' },
        { nome: 'frequenciaRespiratoria', rotulo: 'Frequência respiratória', tipo: 'number' },
        { nome: 'temperatura', rotulo: 'Temperatura (°C)', tipo: 'number' },
        { nome: 'saturacaoO2', rotulo: 'Saturação de O₂ (%)', tipo: 'number' },
        { nome: 'glicemia', rotulo: 'Glicemia', tipo: 'number' },
        { nome: 'peso', rotulo: 'Peso (kg)', tipo: 'number' },
        { nome: 'aferidoEm', rotulo: 'Quando foi aferido', tipo: 'datetime-local' },
        { nome: 'observacao', rotulo: 'Observação' },
      ]}
    />
  )
}

export function FormularioExame({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarExame}
      ocultos={{ residenteId }}
      prefixoId="novo-exame"
      rotuloBotao="Registrar exame"
      campos={[
        { nome: 'tipo', rotulo: 'Tipo do exame', obrigatorio: true },
        { nome: 'dataSolicitacao', rotulo: 'Data da solicitação', tipo: 'date' },
        { nome: 'solicitanteNome', rotulo: 'Solicitante' },
        { nome: 'laboratorio', rotulo: 'Laboratório' },
      ]}
    />
  )
}

export function FormularioAtualizarExame({
  exameId,
  residenteId,
  statusAtual,
}: {
  exameId: string
  residenteId: string
  statusAtual: string
}) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-slate-600 underline">Atualizar</summary>
      <div className="mt-2">
        <FormularioSimples
          acao={acaoAtualizarExame}
          ocultos={{ id: exameId, residenteId }}
          prefixoId={`exame-${exameId}`}
          rotuloBotao="Salvar exame"
          aviso="Para marcar o resultado como recebido, informe o resumo — é o que impede o exame de sair das pendências sem ninguém ter olhado."
          campos={[
            {
              nome: 'status',
              rotulo: 'Situação',
              obrigatorio: true,
              valorInicial: statusAtual,
              opcoes: [
                { valor: 'SOLICITADO', rotulo: 'Solicitado' },
                { valor: 'AGENDADO', rotulo: 'Agendado' },
                { valor: 'REALIZADO', rotulo: 'Realizado' },
                { valor: 'RESULTADO_RECEBIDO', rotulo: 'Resultado recebido' },
                { valor: 'CANCELADO', rotulo: 'Cancelado' },
              ],
            },
            { nome: 'dataRealizacao', rotulo: 'Data da realização', tipo: 'date' },
            { nome: 'dataResultado', rotulo: 'Data do resultado', tipo: 'date' },
            { nome: 'resumoResultado', rotulo: 'Resumo do resultado' },
          ]}
        />
      </div>
    </details>
  )
}

export function FormularioConsulta({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarConsulta}
      ocultos={{ residenteId }}
      prefixoId="nova-consulta"
      rotuloBotao="Registrar consulta"
      campos={[
        { nome: 'especialidade', rotulo: 'Especialidade', obrigatorio: true },
        { nome: 'dataHora', rotulo: 'Data e hora', tipo: 'datetime-local' },
        { nome: 'profissional', rotulo: 'Profissional' },
        { nome: 'local', rotulo: 'Local' },
        { nome: 'motivo', rotulo: 'Motivo' },
      ]}
    />
  )
}

export function FormularioAtualizarConsulta({
  consultaId,
  residenteId,
  statusAtual,
}: {
  consultaId: string
  residenteId: string
  statusAtual: string
}) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-slate-600 underline">Atualizar</summary>
      <div className="mt-2">
        <FormularioSimples
          acao={acaoAtualizarConsulta}
          ocultos={{ id: consultaId, residenteId }}
          prefixoId={`consulta-${consultaId}`}
          rotuloBotao="Salvar consulta"
          aviso="Para marcar como realizada, registre a conduta: sem ela, o idoso foi, voltou, e ninguém sabe o que o médico disse."
          campos={[
            {
              nome: 'status',
              rotulo: 'Situação',
              obrigatorio: true,
              valorInicial: statusAtual,
              opcoes: [
                { valor: 'AGENDADA', rotulo: 'Agendada' },
                { valor: 'REALIZADA', rotulo: 'Realizada' },
                { valor: 'CANCELADA', rotulo: 'Cancelada' },
              ],
            },
            { nome: 'conduta', rotulo: 'Conduta' },
            { nome: 'encaminhamento', rotulo: 'Encaminhamento' },
            { nome: 'dataRetorno', rotulo: 'Data de retorno', tipo: 'date' },
          ]}
        />
      </div>
    </details>
  )
}

export function FormularioVacina({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarVacina}
      ocultos={{ residenteId }}
      prefixoId="nova-vacina"
      rotuloBotao="Registrar vacina"
      campos={[
        { nome: 'imunizante', rotulo: 'Imunizante', obrigatorio: true },
        { nome: 'dose', rotulo: 'Dose', obrigatorio: true },
        { nome: 'dataAplicacao', rotulo: 'Data da aplicação', tipo: 'date', obrigatorio: true },
        { nome: 'lote', rotulo: 'Lote' },
        { nome: 'localAplicacao', rotulo: 'Local da aplicação' },
      ]}
    />
  )
}
