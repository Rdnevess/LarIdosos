import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarFuncionario,
  obterFuncionario,
  listarFuncionarios,
  atualizarFuncionario,
  desligarFuncionario,
  listarConselhosVencendo,
} from './funcionarios.service'

const dadosValidos = {
  nomeCompleto: 'Ana Paula Souza',
  cpf: '529.982.247-25',
  cargo: 'Técnica de enfermagem',
  vinculo: 'CLT' as const,
  dataAdmissao: new Date('2025-02-01'),
  conselhoSigla: 'COREN',
  conselhoNumero: '123456',
  conselhoUf: 'RS',
  conselhoValidade: new Date('2027-03-31'),
}

describe('criarFuncionario', () => {
  it('cria e normaliza o CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    expect(funcionario.cpf).toBe('52998224725')
    expect(funcionario.ativo).toBe(true)
  })

  it('exige CPF válido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      criarFuncionario(ctx, { ...dadosValidos, cpf: '123.456.789-00' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa CPF duplicado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarFuncionario(ctx, dadosValidos)
    await expect(criarFuncionario(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('nega para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(criarFuncionario(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
  })
})

describe('obterFuncionario', () => {
  it('devolve o cadastro completo e audita a visualização', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(admin, dadosValidos)

    for (const papel of ['COORDENACAO', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const lido = await obterFuncionario(ctx, funcionario.id)
      expect(lido.id).toBe(funcionario.id)
      expect(lido.cpf).toBe('52998224725')
    }

    const visualizacoes = await prisma.logAuditoria.count({
      where: { entidade: 'Funcionario', acao: 'VISUALIZAR', entidadeId: funcionario.id },
    })
    expect(visualizacoes).toBe(2)
  })

  it('nega leitura ao papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(obterFuncionario(ctx, funcionario.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarFuncionarios', () => {
  it('filtra ativos e busca por nome ou cargo', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const ana = await criarFuncionario(ctx, dadosValidos)
    await criarFuncionario(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Carlos Lima',
      cpf: '11144477735',
      cargo: 'Cozinheiro',
      conselhoSigla: undefined,
      conselhoNumero: undefined,
      conselhoUf: undefined,
      conselhoValidade: undefined,
    })
    await desligarFuncionario(ctx, ana.id, {
      dataDesligamento: new Date('2026-05-30'),
      motivoDesligamento: 'Pedido de demissão',
    })

    const ativos = await listarFuncionarios(ctx, { apenasAtivos: true })
    expect(ativos.map((f) => f.nomeCompleto)).toEqual(['Carlos Lima'])

    const porCargo = await listarFuncionarios(ctx, { busca: 'cozinh' })
    expect(porCargo).toHaveLength(1)
  })

  it('nega leitura ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarFuncionarios(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarFuncionario', () => {
  it('audita apenas os campos alterados', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await atualizarFuncionario(ctx, funcionario.id, { cargo: 'Enfermeira' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Funcionario', acao: 'ATUALIZAR', entidadeId: funcionario.id },
    })
    expect(log.diff).toEqual({ cargo: { de: 'Técnica de enfermagem', para: 'Enfermeira' } })
  })

  it('recusa CPF já cadastrado em outro funcionário', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarFuncionario(ctx, dadosValidos)
    const carlos = await criarFuncionario(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Carlos Lima',
      cpf: '11144477735',
    })

    await expect(
      atualizarFuncionario(ctx, carlos.id, { cpf: dadosValidos.cpf })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega atualização ao papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      atualizarFuncionario(ctx, funcionario.id, { cargo: 'Enfermeira' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('desligarFuncionario', () => {
  it('marca inativo sem apagar e audita com o estado real anterior', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await desligarFuncionario(ctx, funcionario.id, {
      dataDesligamento: new Date('2026-05-30'),
      motivoDesligamento: 'Pedido de demissão',
    })

    const registro = await prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionario.id },
    })
    expect(registro.ativo).toBe(false)
    expect(registro.dataDesligamento).not.toBeNull()

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Funcionario', acao: 'ATUALIZAR' },
    })
    expect(log.entidadeId).toBe(funcionario.id)
    // O diff precisa refletir o estado real anterior (`atual.ativo`), não uma
    // constante — este defeito exato já apareceu antes neste projeto.
    expect(log.diff).toEqual({ ativo: { de: true, para: false } })
  })

  it('recusa desligamento anterior à admissão', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await expect(
      desligarFuncionario(ctx, funcionario.id, {
        dataDesligamento: new Date('2024-01-01'),
        motivoDesligamento: 'Erro de digitação',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa desligar quem já saiu', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await desligarFuncionario(ctx, funcionario.id, {
      dataDesligamento: new Date('2026-05-30'),
      motivoDesligamento: 'Pedido de demissão',
    })

    await expect(
      desligarFuncionario(ctx, funcionario.id, {
        dataDesligamento: new Date('2026-06-01'),
        motivoDesligamento: 'Segunda tentativa',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega desligamento ao papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      desligarFuncionario(ctx, funcionario.id, {
        dataDesligamento: new Date('2026-05-30'),
        motivoDesligamento: 'Pedido de demissão',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarConselhosVencendo', () => {
  it('lista apenas ativos com conselho vencendo no prazo', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const emVinteDias = new Date(Date.now() + 20 * 86_400_000)

    await criarFuncionario(ctx, { ...dadosValidos, conselhoValidade: emVinteDias })
    await criarFuncionario(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Beatriz Nunes',
      cpf: '11144477735',
      conselhoValidade: new Date(Date.now() + 200 * 86_400_000),
    })

    const vencendo = await listarConselhosVencendo(ctx, 30)

    expect(vencendo.map((f) => f.nomeCompleto)).toEqual(['Ana Paula Souza'])
  })

  it('nega para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarConselhosVencendo(ctx, 30)).rejects.toThrow(ErroPermissao)
  })
})
