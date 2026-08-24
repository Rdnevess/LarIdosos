import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { criarContaBancaria } from './instituicao.service'
import { criarOrigemReceita } from './cadastros.service'
import { lancarReceita } from './lancamentos.service'
import {
  definirContribuicao,
  obterContribuicaoVigente,
  montarPropostaMensal,
} from './contribuicoes.service'

async function cenario() {
  const ctx = await ctxComPapel('ADMINISTRATIVO')
  const conta = await criarContaBancaria(ctx, {
    banco: 'Banco do Brasil',
    agencia: '1234-5',
    numeroConta: '98765-4',
    tipo: 'CORRENTE',
    titular: 'Associação Lar dos Idosos',
    saldoInicial: 15000,
    dataSaldoInicial: new Date('2026-01-01'),
  })
  const origemContribuicao = await criarOrigemReceita(ctx, {
    nome: 'Contribuição de residente',
    rotuloPrestacao: 'Doação',
    exigeResidente: true,
  })
  return { ctx, conta, origemContribuicao }
}

describe('definirContribuicao', () => {
  it('encerra a vigente ao definir outra, em vez de editar no lugar', async () => {
    // A contribuição é percentual sobre o benefício, e o benefício é
    // reajustado todo ano. Editar no lugar apagaria quanto o residente pagou
    // no exercício anterior.
    const { ctx } = await cenario()
    const residente = await criarResidenteDeTeste()

    const primeira = await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1518,
      vigenciaInicio: new Date('2027-01-01'),
    })

    const encerrada = await prisma.contribuicaoResidente.findUniqueOrThrow({
      where: { id: primeira.id },
    })
    expect(encerrada.vigenciaFim).not.toBeNull()

    const vigente = await obterContribuicaoVigente(ctx, residente.id, new Date('2027-06-01'))
    expect(Number(vigente?.valorBaseBeneficio)).toBe(1518)

    // E a antiga continua consultável na competência dela.
    const antiga = await obterContribuicaoVigente(ctx, residente.id, new Date('2026-06-01'))
    expect(Number(antiga?.valorBaseBeneficio)).toBe(1412)
  })

  it('recusa percentual acima de 70', async () => {
    // O art. 35, §2º da Lei 10.741/2003 limita a participação do idoso a 70%
    // do benefício. Aceitar mais seria o sistema ajudar a descumprir a lei.
    const { ctx } = await cenario()
    const residente = await criarResidenteDeTeste()

    await expect(
      definirContribuicao(ctx, {
        residenteId: residente.id,
        percentual: 80,
        valorBaseBeneficio: 1412,
        vigenciaInicio: new Date('2026-01-01'),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    await cenario()
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirContribuicao(ctx, {
        residenteId: residente.id,
        percentual: 70,
        valorBaseBeneficio: 1412,
        vigenciaInicio: new Date('2026-01-01'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('montarPropostaMensal', () => {
  it('calcula o valor e mostra quem já foi lançado', async () => {
    // O sistema propõe, não lança: inventar dinheiro que pode não ter chegado
    // é pior que exigir a conferência.
    const { ctx, conta, origemContribuicao } = await cenario()
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })

    const antes = await montarPropostaMensal(ctx, 2026, 8)
    expect(antes).toHaveLength(1)
    expect(antes[0].residenteNome).toBe('Maria das Dores')
    expect(antes[0].valorCalculado).toBe(988.4)
    expect(antes[0].jaLancado).toBe(false)

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origemContribuicao.id,
      residenteId: residente.id,
      descricao: 'Contribuição de agosto',
      valor: 988.4,
      data: new Date('2026-08-05'),
    })

    const depois = await montarPropostaMensal(ctx, 2026, 8)
    expect(depois[0].jaLancado).toBe(true)
    expect(depois[0].lancamentoId).not.toBeNull()
  })

  it('não propõe para residente sem contribuição vigente no mês', async () => {
    const { ctx } = await cenario()
    const residente = await criarResidenteDeTeste()
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-09-01'),
    })

    expect(await montarPropostaMensal(ctx, 2026, 8)).toHaveLength(0)
    expect(await montarPropostaMensal(ctx, 2026, 9)).toHaveLength(1)
  })

  it('ignora lançamento cancelado ao decidir se já foi lançado', async () => {
    // Contribuição lançada por engano e cancelada precisa voltar à proposta,
    // senão o mês fecha sem ela e ninguém percebe.
    const { ctx, conta, origemContribuicao } = await cenario()
    const residente = await criarResidenteDeTeste()
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })

    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origemContribuicao.id,
      residenteId: residente.id,
      descricao: 'Contribuição de agosto',
      valor: 988.4,
      data: new Date('2026-08-05'),
    })
    await prisma.lancamento.update({
      where: { id: lancamento.id },
      data: { status: 'CANCELADO', motivoCancelamento: 'Lançado em duplicidade' },
    })

    const proposta = await montarPropostaMensal(ctx, 2026, 8)
    expect(proposta[0].jaLancado).toBe(false)
  })

  it('arredonda o valor a dois decimais', async () => {
    // 33% de 1412 dá 466,0 com dízima: sem arredondar, o valor proposto teria
    // dez casas e o lançamento sairia com centavo inventado.
    const { ctx } = await cenario()
    const residente = await criarResidenteDeTeste()
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 33.33,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })

    const proposta = await montarPropostaMensal(ctx, 2026, 8)
    expect(proposta[0].valorCalculado).toBe(470.62)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(montarPropostaMensal(ctx, 2026, 8)).rejects.toThrow(ErroPermissao)
  })
})
