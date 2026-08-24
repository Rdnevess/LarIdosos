'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { texto } from '@/lib/formulario'
import { obterCtx } from '@/modules/auth/sessao'
import { registrarAdministracao } from '@/modules/health/administracao.service'

/**
 * O registro de dose, disparado tanto da tela do turno quanto da seção de
 * medicação do prontuário. Recusa e não-administração pedem motivo; registro
 * de turno passado pede observação — as duas regras moram no serviço, e esta
 * ação só repassa o que o formulário trouxe.
 */

type StatusAdministracao = 'ADMINISTRADA' | 'RECUSADA' | 'NAO_ADMINISTRADA'

type MotivoNaoAdministracao =
  | 'IDOSO_HOSPITALIZADO'
  | 'IDOSO_AUSENTE'
  | 'MEDICAMENTO_EM_FALTA'
  | 'SUSPENSA_MEDICO'
  | 'RECUSA_IDOSO'
  | 'OUTRO'

export async function acaoRegistrarDose(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const horario = texto(dados, 'horarioPrevisto')

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const motivo = texto(dados, 'motivo')

    await registrarAdministracao(ctx, {
      medicacaoId: String(dados.get('medicacaoId')),
      residenteId: String(dados.get('residenteId')),
      // Ausente significa `SE_NECESSARIO`: não há dose prevista a que se
      // referir, e o nulo é o que permite registrá-la quantas vezes for.
      horarioPrevisto: horario ? new Date(horario) : null,
      status: texto(dados, 'status') as StatusAdministracao,
      motivo: (motivo as MotivoNaoAdministracao) || null,
      observacao: texto(dados, 'observacao'),
    })
  })

  revalidatePath('/turno')
  revalidatePath(`/residentes/${String(dados.get('residenteId'))}/prontuario`)
  return resultado
}
