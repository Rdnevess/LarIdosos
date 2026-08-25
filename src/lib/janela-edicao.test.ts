import { describe, it, expect } from 'vitest'
import { prazoDeEdicao, exigirJanelaAberta, JANELA_EDICAO_MINUTOS } from './janela-edicao'
import { ErroPermissao, ErroValidacao } from './erros'
import type { Ctx } from './contexto'

/**
 * Estes casos usam um `Ctx` inventado, e desde que a checagem de autoria passou
 * a auditar a negacao eles deixam no banco de teste algumas linhas
 * `ACESSO_NEGADO` de um `usuarioId` que nao existe — `LogAuditoria.usuarioId`
 * nao tem chave estrangeira, de proposito. As linhas sao inofensivas e ninguem
 * as consulta: quem verifica o registro da negacao e
 * `src/modules/audit/acesso-negado.test.ts`, com usuario de verdade.
 */
const ctx: Ctx = {
  usuarioId: 'usr_1',
  email: 'teste@lar.local',
  papel: 'SAUDE',
}

describe('exigirJanelaAberta', () => {
  it('deixa o autor corrigir dentro do prazo', () => {
    expect(() => exigirJanelaAberta(prazoDeEdicao(), 'usr_1', ctx, 'Anotacao')).not.toThrow()
  })

  it('recusa depois do prazo, mandando retificar', () => {
    // A regra R3: passada a janela, a original nunca muda — a correção vira
    // registro novo, vinculado. É o que faz a trilha valer alguma coisa para
    // quem a lê depois.
    const expirado = new Date(Date.now() - 60_000)
    expect(() => exigirJanelaAberta(expirado, 'usr_1', ctx, 'Anotacao')).toThrow(ErroValidacao)
  })

  it('recusa quem não escreveu, mesmo dentro do prazo', () => {
    expect(() => exigirJanelaAberta(prazoDeEdicao(), 'usr_2', ctx, 'Anotacao')).toThrow(ErroPermissao)
  })

  it('recusa quando a anotação não tem autor registrado', () => {
    // Anotação sem autor veio do seed, ou é anterior ao campo: ninguém a
    // "escreveu", então ninguém a edita. Retificar continua aberto.
    expect(() => exigirJanelaAberta(prazoDeEdicao(), null, ctx, 'Anotacao')).toThrow(ErroPermissao)
  })

  it('confere a autoria antes do prazo', () => {
    // Se a ordem se invertesse, quem não escreveu receberia "a janela
    // expirou" — mensagem que sugere que chegar antes teria adiantado.
    const expirado = new Date(Date.now() - 60_000)
    expect(() => exigirJanelaAberta(expirado, 'usr_2', ctx, 'Anotacao')).toThrow(ErroPermissao)
  })

  it('o prazo é de JANELA_EDICAO_MINUTOS a partir de agora', () => {
    const margem = Math.abs(
      prazoDeEdicao().getTime() - (Date.now() + JANELA_EDICAO_MINUTOS * 60_000)
    )
    expect(margem).toBeLessThan(1_000)
  })
})
