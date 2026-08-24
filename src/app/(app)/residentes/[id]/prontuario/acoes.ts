'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { texto, data } from '@/lib/formulario'
import { obterCtx } from '@/modules/auth/sessao'
import {
  registrarAlergia,
  registrarCondicaoCronica,
  registrarRestricaoAlimentar,
  desativarAlergia,
  desativarCondicaoCronica,
  desativarRestricaoAlimentar,
} from '@/modules/health/cabecalho.service'

/**
 * Server Actions do prontuário. Ficam aqui, e não junto das da ficha
 * cadastral (`../../acoes.ts`), porque a fronteira de permissão é outra: tudo
 * neste arquivo exige COORDENACAO ou SAUDE, e o ADMINISTRATIVO é recusado no
 * serviço.
 */

function caminho(residenteId: string): string {
  return `/residentes/${residenteId}/prontuario`
}

export async function acaoRegistrarAlergia(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarAlergia(ctx, {
      residenteId,
      agente: texto(dados, 'agente')!,
      tipo: texto(dados, 'tipo') as 'MEDICAMENTO' | 'ALIMENTO' | 'OUTRO',
      gravidade: texto(dados, 'gravidade') as 'LEVE' | 'MODERADA' | 'GRAVE',
      reacao: texto(dados, 'reacao'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarCondicaoCronica(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarCondicaoCronica(ctx, {
      residenteId,
      descricao: texto(dados, 'descricao')!,
      cid10: texto(dados, 'cid10'),
      dataDiagnostico: data(dados, 'dataDiagnostico'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarRestricaoAlimentar(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarRestricaoAlimentar(ctx, {
      residenteId,
      descricao: texto(dados, 'descricao')!,
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

/**
 * As três desativações são o mesmo formulário com um `id` oculto. Retirar do
 * cabeçalho é ato frequente — alergia que se confirmou não existir, condição
 * que deixou de ser tratada — e a exclusão é lógica: o registro fica no banco
 * e na trilha.
 */
export async function acaoDesativarAlergia(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarAlergia(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoDesativarCondicaoCronica(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarCondicaoCronica(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoDesativarRestricaoAlimentar(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarRestricaoAlimentar(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}
