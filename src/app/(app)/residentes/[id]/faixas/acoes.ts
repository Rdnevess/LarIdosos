'use server'

import { revalidatePath } from 'next/cache'
import { obterCtx } from '@/modules/auth/sessao'
import { definirFaixa } from '@/modules/health/faixas.service'
import { MEDIDAS_VITAIS } from '@/modules/health/faixas'

export type EstadoFaixas = { erro?: string; salvo?: boolean }

/**
 * Grava todas as faixas de um residente numa submissão.
 *
 * `salvo` é campo explícito, e não a ausência de erro: o estado inicial do
 * `useActionState` também não tem erro, e um "Registro salvo." mostrado antes
 * de alguém salvar mentiria sobre o que aconteceu.
 */
export async function acaoDefinirFaixas(
  _estado: EstadoFaixas,
  dados: FormData
): Promise<EstadoFaixas> {
  const ctx = await obterCtx()
  const residenteId = String(dados.get('residenteId') ?? '')
  if (!residenteId) return { erro: 'Residente inválido' }

  /**
   * Campo vazio quer dizer "sem limite deste lado", e não "zero" —
   * `Number('')` é 0, e um mínimo de zero silenciaria a medida sem ninguém
   * pedir. Aceita vírgula porque é assim que se digita decimal em português.
   */
  const numeroOuNulo = (campo: string): number | null => {
    const bruto = String(dados.get(campo) ?? '').trim()
    if (bruto === '') return null
    const numero = Number(bruto.replace(',', '.'))
    return Number.isFinite(numero) ? numero : null
  }

  try {
    for (const medida of MEDIDAS_VITAIS) {
      await definirFaixa(ctx, residenteId, medida, {
        minimo: numeroOuNulo(`${medida}_minimo`),
        maximo: numeroOuNulo(`${medida}_maximo`),
      })
    }
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : 'Não foi possível salvar' }
  }

  revalidatePath('/pendencias')
  revalidatePath(`/residentes/${residenteId}/faixas`)
  return { salvo: true }
}
