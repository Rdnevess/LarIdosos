import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  adicionarResponsavel,
  listarResponsaveis,
  atualizarResponsavel,
  removerResponsavel,
} from './responsaveis.service'

async function dadosBase() {
  const residente = await criarResidenteDeTeste()
  return {
    residenteId: residente.id,
    nome: 'João da Silva',
    parentesco: 'Filho',
    telefonePrincipal: '(51) 99999-0000',
    cpf: '529.982.247-25',
    ehResponsavelLegal: true,
    ehContatoEmergencia: true,
  }
}

describe('adicionarResponsavel', () => {
  it('cria o responsável e normaliza o CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()

    const responsavel = await adicionarResponsavel(ctx, dados)

    expect(responsavel.nome).toBe('João da Silva')
    expect(responsavel.cpf).toBe('52998224725')
    expect(responsavel.ativo).toBe(true)
  })

  it('recusa CPF inválido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()

    await expect(
      adicionarResponsavel(ctx, { ...dados, cpf: '111.111.111-11' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita a mesma pessoa como responsável por dois residentes', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const primeiro = await dadosBase()
    const outroResidente = await criarResidenteDeTeste()

    await adicionarResponsavel(ctx, primeiro)
    const segundo = await adicionarResponsavel(ctx, {
      ...primeiro,
      residenteId: outroResidente.id,
    })

    expect(segundo.cpf).toBe('52998224725')
  })

  it('nega para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const dados = await dadosBase()

    await expect(adicionarResponsavel(ctx, dados)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarResponsaveis', () => {
  it('lista apenas os ativos e é legível pelo papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(admin, dados)
    await adicionarResponsavel(admin, { ...dados, nome: 'Ana Silva', cpf: undefined })
    await removerResponsavel(admin, responsavel.id)

    const saude = await ctxComPapel('SAUDE')
    const lista = await listarResponsaveis(saude, dados.residenteId)

    expect(lista.map((r) => r.nome)).toEqual(['Ana Silva'])
  })
})

describe('removerResponsavel', () => {
  it('desativa sem apagar o registro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(ctx, dados)

    await removerResponsavel(ctx, responsavel.id)

    const registro = await prisma.responsavel.findUniqueOrThrow({
      where: { id: responsavel.id },
    })
    expect(registro.ativo).toBe(false)
  })

  it('nega para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(admin, dados)

    const saude = await ctxComPapel('SAUDE')
    await expect(removerResponsavel(saude, responsavel.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarResponsavel', () => {
  it('audita o campo alterado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(ctx, dados)

    await atualizarResponsavel(ctx, responsavel.id, {
      telefonePrincipal: '(51) 98888-1111',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Responsavel', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({
      telefonePrincipal: { de: '(51) 99999-0000', para: '(51) 98888-1111' },
    })
  })

  it('nega para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(admin, dados)

    const saude = await ctxComPapel('SAUDE')
    await expect(
      atualizarResponsavel(saude, responsavel.id, { telefonePrincipal: '(51) 98888-1111' })
    ).rejects.toThrow(ErroPermissao)
  })
})
