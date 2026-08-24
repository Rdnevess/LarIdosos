'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { texto, data, numero } from '@/lib/formulario'
import { obterCtx } from '@/modules/auth/sessao'
import {
  salvarConfiguracaoInstituicao,
  criarContaBancaria,
} from '@/modules/financeiro/instituicao.service'
import {
  criarOrigemReceita,
  criarCategoriaDespesa,
  criarFornecedor,
} from '@/modules/financeiro/cadastros.service'
import {
  lancarReceita,
  lancarDespesa,
  cancelarLancamento,
  conciliarLancamento,
} from '@/modules/financeiro/lancamentos.service'

/**
 * As ações do financeiro.
 *
 * Nenhuma delas decide nada: leem o formulário, chamam o serviço e revalidam a
 * tela. Toda regra — teto de contribuição, obrigatoriedade de motivo, quem
 * pode fechar — mora no serviço, onde também é testada.
 */

function exigirTexto(dados: FormData, campo: string): string {
  return texto(dados, campo) ?? ''
}

function exigirNumero(dados: FormData, campo: string): number {
  // O `numero` devolve `null` para campo vazio; o serviço recusa com mensagem
  // em português, que é melhor do que um `NaN` silencioso vindo daqui.
  return numero(dados, campo) ?? Number.NaN
}

function exigirData(dados: FormData, campo: string): Date {
  // Campo vazio vira data inválida, e `z.date()` a recusa com mensagem em
  // português — melhor do que um `undefined` que o schema reportaria como
  // "obrigatório" num campo que a pessoa acha que preencheu.
  return data(dados, campo) ?? new Date(Number.NaN)
}

export async function acaoSalvarInstituicao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await salvarConfiguracaoInstituicao(ctx, {
      razaoSocial: exigirTexto(dados, 'razaoSocial'),
      cnpj: exigirTexto(dados, 'cnpj'),
      enderecoCompleto: exigirTexto(dados, 'enderecoCompleto'),
      cidade: exigirTexto(dados, 'cidade'),
      uf: exigirTexto(dados, 'uf'),
      orgaoDestinatario: exigirTexto(dados, 'orgaoDestinatario'),
      nomePresidente: exigirTexto(dados, 'nomePresidente'),
      nomeTesoureiro: exigirTexto(dados, 'nomeTesoureiro'),
    })
  })

  revalidatePath('/financeiro/cadastros')
  return resultado
}

export async function acaoCriarConta(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarContaBancaria(ctx, {
      banco: exigirTexto(dados, 'banco'),
      agencia: exigirTexto(dados, 'agencia'),
      numeroConta: exigirTexto(dados, 'numeroConta'),
      tipo: exigirTexto(dados, 'tipo') as 'CORRENTE' | 'POUPANCA' | 'APLICACAO',
      titular: exigirTexto(dados, 'titular'),
      saldoInicial: exigirNumero(dados, 'saldoInicial'),
      dataSaldoInicial: exigirData(dados, 'dataSaldoInicial'),
    })
  })

  revalidatePath('/financeiro/cadastros')
  revalidatePath('/financeiro')
  return resultado
}

export async function acaoCriarOrigem(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const rotulo = texto(dados, 'rotuloPrestacao')

    await criarOrigemReceita(ctx, {
      nome: exigirTexto(dados, 'nome'),
      // Em branco, o serviço usa o próprio nome: o caso comum é os dois
      // coincidirem, e a digitação dupla só convidaria ao erro.
      rotuloPrestacao: rotulo || undefined,
      exigeResidente: dados.get('exigeResidente') === 'on',
    })
  })

  revalidatePath('/financeiro/cadastros')
  return resultado
}

export async function acaoCriarCategoria(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarCategoriaDespesa(ctx, { nome: exigirTexto(dados, 'nome') })
  })

  revalidatePath('/financeiro/cadastros')
  return resultado
}

export async function acaoCriarFornecedor(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarFornecedor(ctx, {
      nome: exigirTexto(dados, 'nome'),
      documento: exigirTexto(dados, 'documento'),
      tipoDocumento: exigirTexto(dados, 'tipoDocumento') as 'CNPJ' | 'CPF',
      telefone: texto(dados, 'telefone'),
      email: texto(dados, 'email'),
    })
  })

  revalidatePath('/financeiro/cadastros')
  return resultado
}

export async function acaoLancarReceita(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const residenteId = texto(dados, 'residenteId')

    await lancarReceita(ctx, {
      contaBancariaId: exigirTexto(dados, 'contaBancariaId'),
      origemReceitaId: exigirTexto(dados, 'origemReceitaId'),
      residenteId: residenteId || null,
      descricao: exigirTexto(dados, 'descricao'),
      valor: exigirNumero(dados, 'valor'),
      data: exigirData(dados, 'data'),
      pagadorNome: texto(dados, 'pagadorNome'),
      pagadorDocumento: texto(dados, 'pagadorDocumento'),
      observacao: texto(dados, 'observacao'),
    })
  })

  revalidatePath('/financeiro')
  revalidatePath('/financeiro/contribuicoes')
  return resultado
}

export async function acaoLancarDespesa(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await lancarDespesa(ctx, {
      contaBancariaId: exigirTexto(dados, 'contaBancariaId'),
      fornecedorId: exigirTexto(dados, 'fornecedorId'),
      categoriaDespesaId: exigirTexto(dados, 'categoriaDespesaId'),
      formaPagamento: exigirTexto(dados, 'formaPagamento') as
        | 'PIX'
        | 'TED'
        | 'CHEQUE'
        | 'DEBITO'
        | 'OUTRO',
      descricao: exigirTexto(dados, 'descricao'),
      valor: exigirNumero(dados, 'valor'),
      data: exigirData(dados, 'data'),
      numeroDocumentoFiscal: texto(dados, 'numeroDocumentoFiscal'),
      observacao: texto(dados, 'observacao'),
    })
  })

  revalidatePath('/financeiro')
  return resultado
}

export async function acaoCancelarLancamento(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await cancelarLancamento(ctx, exigirTexto(dados, 'id'), exigirTexto(dados, 'motivo'))
  })

  revalidatePath('/financeiro')
  return resultado
}

export async function acaoConciliarLancamento(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await conciliarLancamento(ctx, exigirTexto(dados, 'id'))
  })

  revalidatePath('/financeiro')
  return resultado
}
