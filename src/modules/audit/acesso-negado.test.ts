import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { exigirPapel } from '@/lib/contexto'
import { ErroPermissao } from '@/lib/erros'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { registrarAcessoNegado, registrosDeNegacaoPendentes } from './acesso-negado'

async function negacoesDe(usuarioId: string) {
  return prisma.logAuditoria.findMany({
    where: { acao: 'ACESSO_NEGADO', usuarioId },
    orderBy: { criadoEm: 'asc' },
  })
}

describe('registrarAcessoNegado', () => {
  it('grava quem tentou, o que tentou e o papel que tinha na hora', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await registrarAcessoNegado(ctx, 'Usuario')

    const [log] = await negacoesDe(ctx.usuarioId)
    expect(log.usuarioEmail).toBe(ctx.email)
    expect(log.entidade).toBe('Usuario')
    expect(log.ip).toBe('127.0.0.1')
    // O papel vai no diff porque o papel de uma conta pode ser corrigido
    // depois: sem isto, a trilha diria o papel de hoje, não o de quando a
    // tentativa aconteceu.
    expect(log.diff).toEqual({
      papel: { de: null, para: 'SAUDE' },
      tentativas: { de: null, para: 1 },
    })
  })

  it('dobra o intervalo entre registros em vez de gravar uma linha por tentativa', async () => {
    // O que trava auditar negação é o volume: um script hostil geraria
    // milhares de linhas e afogaria a trilha que a fiscalização lê. Registrar
    // na 1ª, 2ª, 4ª, 8ª tentativa mantém o que interessa — a magnitude — e faz
    // 10 mil tentativas caberem em 14 linhas.
    const ctx = await ctxComPapel('SAUDE')

    for (let i = 0; i < 5; i += 1) await registrarAcessoNegado(ctx, 'Residente')

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs.map((log) => (log.diff as { tentativas: { para: number } }).tentativas.para))
      .toEqual([1, 2, 4])
  })

  it('conta cada entidade por si', async () => {
    // Tentar a ficha de um residente e a tela de usuários são sinais
    // diferentes, e um não pode abafar o outro.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await registrarAcessoNegado(ctx, 'Residente')
    await registrarAcessoNegado(ctx, 'Usuario')

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs.map((log) => log.entidade).sort()).toEqual(['Residente', 'Usuario'])
  })
})

describe('exigirPapel', () => {
  it('registra a negação sem que o serviço precise lembrar de registrá-la', async () => {
    // O ganho de auditar dentro de `exigirPapel`: nenhum dos trinta e poucos
    // serviços tem uma linha a mais, e nenhum pode esquecer.
    const ctx = await ctxComPapel('SAUDE')

    expect(() => exigirPapel(ctx, 'Usuario', 'COORDENACAO')).toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs).toHaveLength(1)
    expect(logs[0].entidade).toBe('Usuario')
  })

  it('não registra nada quando o papel é aceito', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    exigirPapel(ctx, 'Usuario', 'COORDENACAO')
    await registrosDeNegacaoPendentes()

    expect(await negacoesDe(ctx.usuarioId)).toHaveLength(0)
  })

  it('registra a tentativa de abrir a lista de usuários com o papel SAUDE', async () => {
    // O caminho inteiro, pelo serviço de verdade: é este o cenário do art. 11
    // da LGPD — alguém tentando alcançar dado que o papel dele não alcança.
    const ctx = await ctxComPapel('SAUDE')

    await expect(listarUsuarios(ctx)).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoesDe(ctx.usuarioId)
    expect(log.entidade).toBe('Usuario')
    expect(log.acao).toBe('ACESSO_NEGADO')
  })
})
