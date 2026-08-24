'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'
import {
  criarUsuario,
  atualizarUsuario,
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

/**
 * Não manda `funcionarioId`, e a omissão é o que preserva o vínculo: chave
 * ausente do `FormData` chega ao serviço como `undefined`, o Prisma a ignora e
 * a coluna não é tocada (`src/lib/formulario.ts`). Ligar usuário a funcionário
 * não tem tela em nenhum lugar — nem na criação —, e inventar aqui um campo de
 * id cru seria pior que não ter.
 */
export async function acaoAtualizarUsuario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const papel = texto(dados, 'papel')

    await atualizarUsuario(ctx, texto(dados, 'id'), {
      nome: texto(dados, 'nome'),
      // A própria linha não traz o seletor de papel — trocar o próprio papel
      // trancaria a coordenação fora desta tela, e o serviço recusa. Sem
      // campo, sem chave: o papel fica como está.
      ...(papel ? { papel: papel as 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO' } : {}),
    })
  })

  revalidatePath('/usuarios')
  return resultado
}

export async function acaoDefinirSenha(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = texto(dados, 'id')
  let ehPropriaConta = false

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    ehPropriaConta = ctx.usuarioId === id
    await definirSenha(ctx, id, texto(dados, 'senha'), texto(dados, 'senhaAtual'))
  })

  if (resultado.erro) return resultado

  revalidatePath('/usuarios')

  // Trocar a própria senha mata a sessão em curso: `definirSenha` grava
  // `senhaAlteradaEm = agora` e `obterCtx` recusa token emitido antes disso
  // (`src/modules/auth/sessao.ts`, linhas 25-27). Sem este encerramento
  // explícito, a re-renderização da própria página de usuários já cairia no
  // `ErroPermissao` — tela de erro, no lugar de um caminho previsível.
  // Fora do `executarAcao`: `signOut` sinaliza lançando, como o `redirect`.
  if (ehPropriaConta) {
    await signOut({ redirectTo: '/login' })
  }

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
