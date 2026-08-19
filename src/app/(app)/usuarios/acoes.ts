'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import {
  criarUsuario,
  definirSenha,
  desativarUsuario,
} from '@/modules/auth/usuarios.service'

function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

export async function acaoCriarUsuario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarUsuario(ctx, {
      email: texto(dados, 'email'),
      nome: texto(dados, 'nome'),
      papel: texto(dados, 'papel') as 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO',
      senha: texto(dados, 'senha'),
    })
  })

  revalidatePath('/usuarios')
  return resultado
}

export async function acaoDefinirSenha(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await definirSenha(ctx, texto(dados, 'id'), texto(dados, 'senha'))
  })

  revalidatePath('/usuarios')
  return resultado
}

export async function acaoDesativarUsuario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarUsuario(ctx, texto(dados, 'id'))
  })

  revalidatePath('/usuarios')
  return resultado
}
