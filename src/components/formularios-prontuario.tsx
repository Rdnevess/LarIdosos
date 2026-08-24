import { FormularioSimples } from './formulario-simples'
import {
  acaoRegistrarAlergia,
  acaoRegistrarCondicaoCronica,
  acaoRegistrarRestricaoAlimentar,
  acaoDesativarAlergia,
  acaoDesativarCondicaoCronica,
  acaoDesativarRestricaoAlimentar,
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
