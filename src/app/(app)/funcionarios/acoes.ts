'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import {
  criarFuncionario,
  atualizarFuncionario,
  desligarFuncionario,
} from '@/modules/staff/funcionarios.service'

function texto(dados: FormData, campo: string): string | undefined {
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? undefined : s
}

/**
 * O `T12:00:00` evita o clássico deslocamento de um dia: `new Date('2026-03-12')`
 * é interpretado como meia-noite UTC, o que em fuso brasileiro vira 11 de março.
 */
function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo)
  return valor ? new Date(`${valor}T12:00:00`) : undefined
}

function dadosDoFuncionario(dados: FormData) {
  return {
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    cpf: texto(dados, 'cpf')!,
    rg: texto(dados, 'rg'),
    cargo: texto(dados, 'cargo')!,
    vinculo: texto(dados, 'vinculo') as 'CLT' | 'VOLUNTARIO' | 'PRESTADOR' | 'ESTAGIO',
    dataAdmissao: data(dados, 'dataAdmissao')!,
    telefone: texto(dados, 'telefone'),
    email: texto(dados, 'email'),
    conselhoSigla: texto(dados, 'conselhoSigla'),
    conselhoNumero: texto(dados, 'conselhoNumero'),
    conselhoUf: texto(dados, 'conselhoUf'),
    conselhoValidade: data(dados, 'conselhoValidade'),
  }
}

export async function acaoCriarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarFuncionario(ctx, dadosDoFuncionario(dados))
  })

  if (resultado.erro) return resultado

  revalidatePath('/funcionarios')
  // Fora do `executarAcao`: `redirect` sinaliza lançando, e dentro do try o
  // adaptador o trataria como falha inesperada.
  redirect('/funcionarios')
}

export async function acaoAtualizarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = String(dados.get('id'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarFuncionario(ctx, id, dadosDoFuncionario(dados))
  })

  revalidatePath('/funcionarios')
  return resultado
}

export async function acaoDesligarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desligarFuncionario(ctx, String(dados.get('id')), {
      dataDesligamento: data(dados, 'dataDesligamento')!,
      motivoDesligamento: texto(dados, 'motivoDesligamento')!,
    })
  })

  revalidatePath('/funcionarios')
  return resultado
}
