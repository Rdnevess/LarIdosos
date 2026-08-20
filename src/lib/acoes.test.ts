import { describe, it, expect, vi, afterEach } from 'vitest'
import { executarAcao } from './acoes'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from './erros'

const MENSAGEM_GENERICA = 'Não foi possível concluir a operação. Tente novamente.'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('executarAcao', () => {
  it('devolve sucesso quando a operação conclui', async () => {
    expect(await executarAcao(async () => 'qualquer coisa')).toEqual({ sucesso: true })
  })

  it('devolve a mensagem de um erro de validação', async () => {
    const resultado = await executarAcao(async () => {
      throw new ErroValidacao('CPF inválido')
    })

    expect(resultado).toEqual({ erro: 'CPF inválido' })
  })

  it('devolve a mensagem de um erro de permissão', async () => {
    const resultado = await executarAcao(async () => {
      throw new ErroPermissao()
    })

    expect(resultado).toEqual({ erro: 'Acesso negado' })
  })

  it('devolve a mensagem de um erro de registro não encontrado', async () => {
    const resultado = await executarAcao(async () => {
      throw new ErroNaoEncontrado('Residente não encontrado')
    })

    expect(resultado).toEqual({ erro: 'Residente não encontrado' })
  })

  it('troca erro inesperado por mensagem genérica e manda o original para o log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = new Error('connect ECONNREFUSED 127.0.0.1:5432')

    const resultado = await executarAcao(async () => {
      throw original
    })

    // A tela não pode ver endereço de banco, caminho de arquivo ou pilha.
    expect(resultado).toEqual({ erro: MENSAGEM_GENERICA })
    expect(resultado.erro).not.toContain('ECONNREFUSED')
    // Mas o servidor precisa ver: engolir o erro em silêncio deixaria a falha
    // invisível para quem for investigar.
    expect(log).toHaveBeenCalledWith(original)
  })

  it('não trata como erro de domínio um Error qualquer com a mesma mensagem', async () => {
    // A distinção é por classe, não por texto: um `Error` cru dizendo
    // "Acesso negado" não vira mensagem de usuário.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultado = await executarAcao(async () => {
      throw new Error('Acesso negado')
    })

    expect(resultado).toEqual({ erro: MENSAGEM_GENERICA })
    expect(log).toHaveBeenCalled()
  })

  it('não engole valor lançado que não é Error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultado = await executarAcao(async () => {
      throw 'string solta'
    })

    expect(resultado).toEqual({ erro: MENSAGEM_GENERICA })
    expect(log).toHaveBeenCalledWith('string solta')
  })
})
