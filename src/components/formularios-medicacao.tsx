import type { Medicacao } from '@prisma/client'
import { FormularioSimples } from './formulario-simples'
import { acaoRegistrarDose } from '@/app/(app)/turno/acoes'
import {
  acaoPrescrever,
  acaoSuspenderMedicacao,
  acaoPrescreverSubstituta,
} from '@/app/(app)/residentes/[id]/prontuario/acoes'

/**
 * Os formulários de medicação.
 *
 * O registro de dose aparece em duas formas: o botão de um toque, sem campo
 * nenhum, para o caso comum do turno corrente; e o formulário com motivo e
 * observação, para recusa, não-administração e registro de turno passado.
 */

const VIAS = [
  { valor: 'ORAL', rotulo: 'Oral' },
  { valor: 'SUBLINGUAL', rotulo: 'Sublingual' },
  { valor: 'IM', rotulo: 'Intramuscular' },
  { valor: 'EV', rotulo: 'Endovenosa' },
  { valor: 'SC', rotulo: 'Subcutânea' },
  { valor: 'TOPICA', rotulo: 'Tópica' },
  { valor: 'INALATORIA', rotulo: 'Inalatória' },
  { valor: 'OFTALMICA', rotulo: 'Oftálmica' },
  { valor: 'OTOLOGICA', rotulo: 'Otológica' },
  { valor: 'RETAL', rotulo: 'Retal' },
]

const MOTIVOS = [
  { valor: 'RECUSA_IDOSO', rotulo: 'Recusa do idoso' },
  { valor: 'MEDICAMENTO_EM_FALTA', rotulo: 'Medicamento em falta' },
  { valor: 'IDOSO_HOSPITALIZADO', rotulo: 'Idoso hospitalizado' },
  { valor: 'IDOSO_AUSENTE', rotulo: 'Idoso ausente' },
  { valor: 'SUSPENSA_MEDICO', rotulo: 'Suspensa pelo médico' },
  { valor: 'OUTRO', rotulo: 'Outro' },
]

function camposDoEsquema(medicacao?: Medicacao) {
  return [
    { nome: 'farmaco', rotulo: 'Fármaco', obrigatorio: true, valorInicial: medicacao?.farmaco },
    { nome: 'concentracao', rotulo: 'Concentração', valorInicial: medicacao?.concentracao ?? undefined },
    { nome: 'dose', rotulo: 'Dose', obrigatorio: true, valorInicial: medicacao?.dose },
    { nome: 'via', rotulo: 'Via', obrigatorio: true, opcoes: VIAS, valorInicial: medicacao?.via },
    {
      nome: 'tipo',
      rotulo: 'Tipo',
      obrigatorio: true,
      valorInicial: medicacao?.tipo,
      opcoes: [
        { valor: 'HORARIO_FIXO', rotulo: 'Horário fixo' },
        { valor: 'SE_NECESSARIO', rotulo: 'Se necessário' },
      ],
    },
    {
      nome: 'horarios',
      rotulo: 'Horários',
      valorInicial: medicacao?.horarios.join(', '),
    },
    { nome: 'formaFarmaceutica', rotulo: 'Forma farmacêutica', valorInicial: medicacao?.formaFarmaceutica ?? undefined },
    { nome: 'instrucoes', rotulo: 'Instruções', valorInicial: medicacao?.instrucoes ?? undefined },
    { nome: 'prescritorNome', rotulo: 'Prescritor', valorInicial: medicacao?.prescritorNome ?? undefined },
    // Em branco, vale a partir de agora. A receita costuma ser anterior ao
    // momento em que alguém a digita, e é a vigência que decide quais doses
    // existem.
    { nome: 'dataInicio', rotulo: 'Vigente a partir de', tipo: 'datetime-local' as const },
  ]
}

export function FormularioPrescrever({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoPrescrever}
      ocultos={{ residenteId }}
      prefixoId="nova-medicacao"
      rotuloBotao="Prescrever"
      aviso="Horários separados por vírgula, no formato HH:mm — por exemplo 08:00, 20:00. Medicação de horário fixo precisa de ao menos um."
      campos={camposDoEsquema()}
    />
  )
}

/**
 * O primeiro dos dois passos da R5. A prescrição não é editada no lugar:
 * suspender encerra a vigência no instante em que acontece, e a dose seguinte
 * deixa de ser derivada.
 */
export function FormularioSuspender({
  medicacaoId,
  residenteId,
}: {
  medicacaoId: string
  residenteId: string
}) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-suporte text-medio underline">Suspender</summary>
      <div className="mt-2">
        <FormularioSimples
          acao={acaoSuspenderMedicacao}
          ocultos={{ id: medicacaoId, residenteId }}
          colunas={1}
          prefixoId={`suspender-${medicacaoId}`}
          rotuloBotao="Suspender medicação"
          aviso="A prescrição é encerrada agora, e a próxima dose deixa de aparecer no turno. O histórico do que já foi administrado continua inteiro."
          campos={[{ nome: 'motivo', rotulo: 'Motivo da suspensão', obrigatorio: true }]}
        />
      </div>
    </details>
  )
}

/**
 * O segundo passo, oferecido em destaque logo abaixo da suspensão e com os
 * campos da anterior pré-preenchidos: é o caminho que grava
 * `substituiMedicacaoId`, e é o que fecha a lacuna de a medicação ficar sem
 * cobertura entre os dois atos.
 */
export function FormularioSubstituir({
  anterior,
  residenteId,
}: {
  anterior: Medicacao
  residenteId: string
}) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-suporte font-medium text-forte underline">
        Prescrever substituta
      </summary>
      <div className="mt-2">
        <FormularioSimples
          acao={acaoPrescreverSubstituta}
          ocultos={{ idAnterior: anterior.id, residenteId }}
          prefixoId={`substituir-${anterior.id}`}
          rotuloBotao="Prescrever substituta"
          aviso="Os campos vêm da prescrição suspensa. A nova fica ligada a ela no histórico, e passa a valer a partir de agora."
          campos={camposDoEsquema(anterior)}
        />
      </div>
    </details>
  )
}

/**
 * O "um toque": no turno corrente, marcar administrada não abre formulário
 * nenhum. Se registrar der trabalho, ninguém registra.
 */
export function BotaoAdministrada({
  medicacaoId,
  residenteId,
  horarioPrevisto,
}: {
  medicacaoId: string
  residenteId: string
  horarioPrevisto: Date
}) {
  return (
    <FormularioSimples
      acao={acaoRegistrarDose}
      ocultos={{
        medicacaoId,
        residenteId,
        horarioPrevisto: horarioPrevisto.toISOString(),
        status: 'ADMINISTRADA',
      }}
      colunas={1}
      prefixoId={`administrar-${medicacaoId}-${horarioPrevisto.getTime()}`}
      rotuloBotao="Administrada"
      campos={[]}
    />
  )
}

/**
 * O caminho com campos: recusa, não-administração, e qualquer registro de
 * turno passado. A observação não é marcada como obrigatória no HTML porque
 * ela só é exigida fora do turno da dose — quem barra é o serviço, e a
 * mensagem dele diz o que fazer.
 */
export function FormularioRegistrarDose({
  medicacaoId,
  residenteId,
  horarioPrevisto,
  tardio,
}: {
  medicacaoId: string
  residenteId: string
  horarioPrevisto: Date | null
  tardio: boolean
}) {
  const sufixo = horarioPrevisto ? horarioPrevisto.getTime() : 'sn'

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-suporte text-medio underline">Registrar</summary>
      <div className="mt-2">
        <FormularioSimples
          acao={acaoRegistrarDose}
          ocultos={{
            medicacaoId,
            residenteId,
            ...(horarioPrevisto ? { horarioPrevisto: horarioPrevisto.toISOString() } : {}),
          }}
          prefixoId={`registrar-${medicacaoId}-${sufixo}`}
          rotuloBotao="Registrar dose"
          aviso={
            tardio
              ? 'Esta dose ficou sem registro até o turno dela voltar: escreva o que aconteceu antes de registrar.'
              : undefined
          }
          campos={[
            {
              nome: 'status',
              rotulo: 'O que aconteceu',
              obrigatorio: true,
              opcoes: [
                { valor: 'ADMINISTRADA', rotulo: 'Administrada' },
                { valor: 'RECUSADA', rotulo: 'Recusada' },
                { valor: 'NAO_ADMINISTRADA', rotulo: 'Não administrada' },
              ],
            },
            { nome: 'motivo', rotulo: 'Motivo', opcoes: MOTIVOS },
            { nome: 'observacao', rotulo: 'Observação' },
          ]}
        />
      </div>
    </details>
  )
}
