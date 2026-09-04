import { describe, it, expect } from 'vitest'
import { ErroPermissao, ErroValidacao, ErroNaoEncontrado } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { prisma } from '@/lib/prisma'
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
  mesclarCategoriasDespesa,
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

describe('a guarda contra categoria duplicada', () => {
  // A pendencia 3 diz para NAO fechar a lista: a equipe precisa cadastrar
  // categoria nova sem depender de deploy. O que se fecha aqui e so a porta da
  // duplicata textual — "Energia", "energia" e "ENERGIA " sao a mesma coisa
  // escrita de tres jeitos, e so servem para partir o subtotal da prestacao em
  // tres linhas que ninguem consegue somar de cabeca. Nome genuinamente novo
  // continua entrando sem pedir licenca a ninguem.

  it('recusa um nome que so difere por caixa, acento ou espaco', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarCategoriaDespesa(ctx, { nome: 'Água e Esgoto' })

    for (const repetido of ['agua e esgoto', 'ÁGUA E ESGOTO', 'Agua  e   Esgoto']) {
      await expect(criarCategoriaDespesa(ctx, { nome: repetido })).rejects.toThrow(ErroValidacao)
    }
  })

  it('deixa passar nome de verdade novo, que e o ponto de nao fechar a lista', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarCategoriaDespesa(ctx, { nome: 'Energia' })

    const nova = await criarCategoriaDespesa(ctx, { nome: 'Energia solar - manutencao' })
    expect(nova.nome).toBe('Energia solar - manutencao')
  })

  it('enxerga tambem a categoria desativada', async () => {
    // Sem isto, desativar "Energia" e cadastra-la de novo criaria a segunda
    // "Energia" — e a lista voltaria a ter duas, uma morta e uma viva, com os
    // lancamentos repartidos entre elas.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const categoria = await criarCategoriaDespesa(ctx, { nome: 'Energia' })
    await desativarCategoriaDespesa(ctx, categoria.id)

    await expect(criarCategoriaDespesa(ctx, { nome: 'Energia' })).rejects.toThrow(ErroValidacao)
  })
})

describe('mesclarCategoriasDespesa', () => {
  /** Uma despesa solta, com a categoria dada, sem passar pelo servico de lancamentos. */
  async function despesaEm(contaId: string, categoriaId: string, prestacaoId?: string) {
    return prisma.lancamento.create({
      data: {
        natureza: 'DESPESA',
        descricao: 'Conta do mes',
        valor: 100,
        data: new Date('2026-08-10'),
        contaBancariaId: contaId,
        categoriaDespesaId: categoriaId,
        prestacaoContasId: prestacaoId,
      },
    })
  }

  async function cenario() {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const conta = await prisma.contaBancaria.create({
      data: {
        banco: 'Banco do Brasil',
        agencia: '1234-5',
        numeroConta: '98765-4',
        tipo: 'CORRENTE',
        titular: 'Associação Lar dos Idosos',
        saldoInicial: 15000,
        dataSaldoInicial: new Date('2026-01-01'),
      },
    })
    const luz = await criarCategoriaDespesa(ctx, { nome: 'Luz' })
    const energia = await criarCategoriaDespesa(ctx, { nome: 'Energia' })
    return { ctx, conta, luz, energia }
  }

  it('reclassifica os lancamentos e desativa a categoria de origem', async () => {
    // O conserto que a pendencia 3 prescreve, inteiro: desativar sozinho nao
    // resolve nada, porque os lancamentos continuam apontando para a
    // duplicada e o nome dela continua saindo na conciliacao.
    const { ctx, conta, luz, energia } = await cenario()
    const a = await despesaEm(conta.id, luz.id)
    const b = await despesaEm(conta.id, luz.id)

    const resultado = await mesclarCategoriasDespesa(ctx, { deId: luz.id, paraId: energia.id })

    expect(resultado.reclassificados).toBe(2)
    expect(resultado.mantidos).toBe(0)
    for (const lancamento of [a, b]) {
      const depois = await prisma.lancamento.findUnique({ where: { id: lancamento.id } })
      expect(depois!.categoriaDespesaId).toBe(energia.id)
    }
    expect((await listarCategoriasDespesa(ctx)).map((c) => c.nome)).toEqual(['Energia'])
  })

  it('nao mexe no lancamento de prestacao fechada, e diz quantos ficaram', async () => {
    // O congelamento vale aqui como vale em toda parte: um documento ja
    // entregue ao orgao mostrou "Luz", e continua mostrando "Luz". Reescrever
    // isso seria falsificar o que foi protocolado. A mesclagem vale dali para
    // frente, e a contagem devolvida e o que conta a verdade a quem operou.
    const { ctx, conta, luz, energia } = await cenario()
    const prestacao = await prisma.prestacaoContas.create({
      data: {
        contaBancariaId: conta.id,
        mesCompetencia: 8,
        anoCompetencia: 2026,
        saldoAnterior: 15000,
        status: 'FECHADA',
        fechadaEm: new Date(),
      },
    })
    const congelado = await despesaEm(conta.id, luz.id, prestacao.id)
    const livre = await despesaEm(conta.id, luz.id)

    const resultado = await mesclarCategoriasDespesa(ctx, { deId: luz.id, paraId: energia.id })

    expect(resultado.reclassificados).toBe(1)
    expect(resultado.mantidos).toBe(1)
    expect(
      (await prisma.lancamento.findUnique({ where: { id: congelado.id } }))!.categoriaDespesaId
    ).toBe(luz.id)
    expect(
      (await prisma.lancamento.findUnique({ where: { id: livre.id } }))!.categoriaDespesaId
    ).toBe(energia.id)
  })

  it('recusa mesclar uma categoria nela mesma', async () => {
    const { ctx, luz } = await cenario()

    await expect(
      mesclarCategoriasDespesa(ctx, { deId: luz.id, paraId: luz.id })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa destino desativado: seria trocar uma duplicada morta por outra', async () => {
    const { ctx, luz, energia } = await cenario()
    await desativarCategoriaDespesa(ctx, energia.id)

    await expect(
      mesclarCategoriasDespesa(ctx, { deId: luz.id, paraId: energia.id })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa id que nao existe', async () => {
    const { ctx, luz } = await cenario()

    await expect(
      mesclarCategoriasDespesa(ctx, { deId: luz.id, paraId: 'nao-existe' })
    ).rejects.toThrow(ErroNaoEncontrado)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      mesclarCategoriasDespesa(ctx, { deId: 'a', paraId: 'b' })
    ).rejects.toThrow(ErroPermissao)
  })
})
