import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarResidente,
  obterResidente,
  listarResidentes,
  atualizarResidente,
  desligarResidente,
} from './residentes.service'

const dadosValidos = {
  nomeCompleto: 'Maria das Dores Silva',
  dataNascimento: new Date('1940-03-12'),
  sexo: 'FEMININO' as const,
  cpf: '529.982.247-25',
  dataAdmissao: new Date('2026-01-15'),
  quarto: '3',
  leito: 'A',
}

describe('criarResidente', () => {
  it('cria o residente com status ATIVO e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const residente = await criarResidente(ctx, dadosValidos)

    expect(residente.nomeCompleto).toBe('Maria das Dores Silva')
    expect(residente.status).toBe('ATIVO')
    expect(residente.cpf).toBe('52998224725')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa CPF com dígito verificador inválido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      criarResidente(ctx, { ...dadosValidos, cpf: '529.982.247-26' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita residente sem CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, { ...dadosValidos, cpf: undefined })
    expect(residente.cpf).toBeNull()
  })

  it('recusa CPF já cadastrado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, dadosValidos)
    await expect(criarResidente(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('recusa data de nascimento no futuro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const amanha = new Date(Date.now() + 86_400_000)
    await expect(
      criarResidente(ctx, { ...dadosValidos, dataNascimento: amanha })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega criação para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(criarResidente(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
  })
})

describe('obterResidente', () => {
  it('permite leitura pelos três papéis e audita a visualização', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const residente = await criarResidente(admin, dadosValidos)

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const lido = await obterResidente(ctx, residente.id)
      expect(lido.id).toBe(residente.id)
    }

    const visualizacoes = await prisma.logAuditoria.count({
      where: { entidade: 'Residente', acao: 'VISUALIZAR', entidadeId: residente.id },
    })
    expect(visualizacoes).toBe(3)
  })
})

describe('listarResidentes', () => {
  it('filtra por status e busca por nome sem diferenciar maiúsculas', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const maria = await criarResidente(ctx, dadosValidos)
    await criarResidente(ctx, {
      ...dadosValidos,
      nomeCompleto: 'João Pereira',
      cpf: undefined,
    })
    await desligarResidente(ctx, maria.id, {
      status: 'DESLIGADO',
      dataSaida: new Date('2026-06-01'),
      motivoSaida: 'Retorno à família',
    })

    const ativos = await listarResidentes(ctx, { status: 'ATIVO' })
    expect(ativos.map((r) => r.nomeCompleto)).toEqual(['João Pereira'])

    const busca = await listarResidentes(ctx, { busca: 'maria das' })
    expect(busca).toHaveLength(1)
  })

  it('não devolve dado sensível na listagem', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, dadosValidos)

    const [residente] = await listarResidentes(ctx, {})

    expect(residente).not.toHaveProperty('cpf')
    expect(residente).not.toHaveProperty('rg')
    expect(residente).not.toHaveProperty('cns')
    expect(residente).not.toHaveProperty('beneficioValor')
    expect(residente).not.toHaveProperty('planoSaude')
    expect(residente.nomeCompleto).toBe('Maria das Dores Silva')
  })
})

describe('atualizarResidente', () => {
  it('audita apenas os campos alterados', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    await atualizarResidente(ctx, residente.id, { quarto: '5', leito: 'A' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({ quarto: { de: '3', para: '5' } })
  })

  it('nega atualização para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      atualizarResidente(ctx, residente.id, { quarto: '5' })
    ).rejects.toThrow(ErroPermissao)
  })

  it('registra no diff a alteração de beneficioValor (Decimal) corretamente', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, {
      ...dadosValidos,
      cpf: undefined,
      beneficioTipo: 'BPC',
      beneficioValor: 1518,
    })

    await atualizarResidente(ctx, residente.id, { beneficioValor: 2000.5 })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'ATUALIZAR', entidadeId: residente.id },
      orderBy: { criadoEm: 'desc' },
    })

    const diff = log.diff as { beneficioValor?: { de: unknown; para: unknown } } | null
    expect(diff?.beneficioValor).toBeDefined()
    expect(Number(diff?.beneficioValor?.de)).toBe(1518)
    expect(Number(diff?.beneficioValor?.para)).toBe(2000.5)
  })
})

describe('desligarResidente', () => {
  it('registra saída sem apagar o registro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    const desligado = await desligarResidente(ctx, residente.id, {
      status: 'FALECIDO',
      dataSaida: new Date('2026-07-20'),
      motivoSaida: 'Óbito por causas naturais',
    })

    expect(desligado.status).toBe('FALECIDO')
    expect(await prisma.residente.count()).toBe(1)
  })

  it('recusa desligar quem já está desligado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)
    const saida = {
      status: 'DESLIGADO' as const,
      dataSaida: new Date('2026-07-20'),
      motivoSaida: 'Transferência',
    }

    await desligarResidente(ctx, residente.id, saida)
    await expect(desligarResidente(ctx, residente.id, saida)).rejects.toThrow(ErroValidacao)
  })

  it('recusa data de saída anterior à admissão', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    await expect(
      desligarResidente(ctx, residente.id, {
        status: 'DESLIGADO',
        dataSaida: new Date('2025-01-01'),
        motivoSaida: 'Transferência',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega desligamento para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      desligarResidente(ctx, residente.id, {
        status: 'DESLIGADO',
        dataSaida: new Date('2026-07-20'),
        motivoSaida: 'Transferência',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})
