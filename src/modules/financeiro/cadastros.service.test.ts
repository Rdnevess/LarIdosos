import { describe, it, expect } from 'vitest'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarOrigemReceita,
  listarOrigensReceita,
  desativarOrigemReceita,
  criarCategoriaDespesa,
  listarCategoriasDespesa,
  desativarCategoriaDespesa,
  criarFornecedor,
  listarFornecedores,
  desativarFornecedor,
} from './cadastros.service'

describe('criarOrigemReceita', () => {
  it('guarda o rótulo do documento separado do nome interno', async () => {
    // O ponto central do desenho de receitas: a contribuição dos residentes é
    // origem própria internamente, com o residente vinculado para o extrato,
    // mas sai como "Doação" no documento, somando com as demais. Nenhum nome
    // de idoso entra na prestação.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const origem = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })

    expect(origem.nome).toBe('Contribuição de residente')
    expect(origem.rotuloPrestacao).toBe('Doação')
    expect(origem.exigeResidente).toBe(true)
  })

  it('usa o nome como rótulo quando o rótulo não vem', async () => {
    // O caso comum é os dois coincidirem. Exigir a digitação dupla seria
    // convidar ao erro de digitação que o agrupamento por texto do Excel já
    // pune.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const origem = await criarOrigemReceita(ctx, { nome: 'Repasse Prefeitura' })
    expect(origem.rotuloPrestacao).toBe('Repasse Prefeitura')
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarOrigemReceita(ctx, { nome: 'Doação', rotuloPrestacao: 'Doação' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('criarFornecedor', () => {
  it('valida o CPF e normaliza para dígitos', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const fornecedor = await criarFornecedor(ctx, {
      nome: 'José da Silva',
      documento: '529.982.247-25',
      tipoDocumento: 'CPF',
    })

    expect(fornecedor.documento).toBe('52998224725')
  })

  it('valida o CNPJ pelo dígito verificador', async () => {
    // Substitui o XLOOKUP da planilha, que hoje aponta para #REF!. Se o
    // documento entrar errado aqui, ele sai errado na prestação.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      criarFornecedor(ctx, {
        nome: 'Empresa X',
        documento: '11.222.333/0001-00',
        tipoDocumento: 'CNPJ',
      })
    ).rejects.toThrow(ErroValidacao)

    const valido = await criarFornecedor(ctx, {
      nome: 'Empresa X',
      documento: '11.222.333/0001-81',
      tipoDocumento: 'CNPJ',
    })
    expect(valido.documento).toBe('11222333000181')
  })

  it('recusa CPF no campo de CNPJ', async () => {
    // Um CPF válido não é CNPJ válido: o tipo escolhido decide qual
    // verificação roda.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      criarFornecedor(ctx, {
        nome: 'José da Silva',
        documento: '529.982.247-25',
        tipoDocumento: 'CNPJ',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarFornecedor(ctx, {
        nome: 'Empresa X',
        documento: '11.222.333/0001-81',
        tipoDocumento: 'CNPJ',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarCategoriasDespesa', () => {
  it('traz só as ativas, em ordem alfabética brasileira', async () => {
    // Lista aberta, alimentada pelo uso: não há lista fechada acordada com o
    // órgão. A ordem alfabética respeita o acento, senão "Água" cairia no fim.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarCategoriaDespesa(ctx, { nome: 'Energia' })
    await criarCategoriaDespesa(ctx, { nome: 'Água e esgoto' })
    await criarCategoriaDespesa(ctx, { nome: 'Salário' })
    const antiga = await criarCategoriaDespesa(ctx, { nome: 'Categoria abandonada' })
    await desativarCategoriaDespesa(ctx, antiga.id)

    const lista = await listarCategoriasDespesa(ctx)
    expect(lista.map((c) => c.nome)).toEqual(['Água e esgoto', 'Energia', 'Salário'])
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarCategoriasDespesa(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('listar e desativar', () => {
  it('a origem desativada some da lista', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarOrigemReceita(ctx, { nome: 'Doação' })
    const antiga = await criarOrigemReceita(ctx, { nome: 'Origem abandonada' })
    await desativarOrigemReceita(ctx, antiga.id)

    expect((await listarOrigensReceita(ctx)).map((o) => o.nome)).toEqual(['Doação'])
  })

  it('o fornecedor desativado some da lista', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarFornecedor(ctx, {
      nome: 'Empresa Ativa',
      documento: '11.222.333/0001-81',
      tipoDocumento: 'CNPJ',
    })
    const antigo = await criarFornecedor(ctx, {
      nome: 'Empresa Antiga',
      documento: '529.982.247-25',
      tipoDocumento: 'CPF',
    })
    await desativarFornecedor(ctx, antigo.id)

    expect((await listarFornecedores(ctx)).map((f) => f.nome)).toEqual(['Empresa Ativa'])
  })
})
