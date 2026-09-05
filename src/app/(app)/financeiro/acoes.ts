'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { texto, data, numero } from '@/lib/formulario'
import { ErroValidacao } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import {
  salvarConfiguracaoInstituicao,
  criarContaBancaria,
} from '@/modules/financeiro/instituicao.service'
import {
  criarOrigemReceita,
  criarCategoriaDespesa,
  mesclarCategoriasDespesa,
  mesclarOrigensReceita,
  criarFornecedor,
} from '@/modules/financeiro/cadastros.service'
import {
  lancarReceita,
  lancarDespesa,
  cancelarLancamento,
  conciliarLancamento,
} from '@/modules/financeiro/lancamentos.service'
import {
  abrirPrestacao,
  ajustarSaldoAnterior,
  registrarObservacoes,
  fecharPrestacao,
  reabrirPrestacao,
} from '@/modules/financeiro/prestacoes.service'
import { definirContribuicao } from '@/modules/financeiro/contribuicoes.service'
import {
  anexarComprovante,
  removerComprovante,
  type AlvoAnexo,
} from '@/modules/financeiro/anexos.service'

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

export async function acaoMesclarCategorias(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  let resumo = ''

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const { reclassificados, mantidos } = await mesclarCategoriasDespesa(ctx, {
      deId: exigirTexto(dados, 'deId'),
      paraId: exigirTexto(dados, 'paraId'),
    })

    const movidos =
      reclassificados === 1 ? '1 lançamento reclassificado' : `${reclassificados} lançamentos reclassificados`
    // O número de presos é a parte que não pode sumir: sem ele, quem operou
    // acha que a duplicada desapareceu do documento, e ela continua lá nas
    // competências já fechadas.
    const presos =
      mantidos === 0
        ? ''
        : mantidos === 1
          ? '. 1 ficou onde estava, em prestação fechada.'
          : `. ${mantidos} ficaram onde estavam, em prestações fechadas.`

    resumo = `${movidos}${presos || '.'}`
  })

  revalidatePath('/financeiro/cadastros')
  return resultado.sucesso ? { ...resultado, mensagem: resumo } : resultado
}

export async function acaoMesclarOrigens(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  let resumo = ''

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const { reclassificados, mantidos } = await mesclarOrigensReceita(ctx, {
      deId: exigirTexto(dados, 'deId'),
      paraId: exigirTexto(dados, 'paraId'),
    })

    const movidos =
      reclassificados === 1 ? '1 lançamento reclassificado' : `${reclassificados} lançamentos reclassificados`
    const presos =
      mantidos === 0
        ? '.'
        : mantidos === 1
          ? '. 1 ficou onde estava, em prestação fechada.'
          : `. ${mantidos} ficaram onde estavam, em prestações fechadas.`

    resumo = `${movidos}${presos}`
  })

  revalidatePath('/financeiro/cadastros')
  return resultado.sucesso ? { ...resultado, mensagem: resumo } : resultado
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

export async function acaoAbrirPrestacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await abrirPrestacao(
      ctx,
      exigirTexto(dados, 'contaBancariaId'),
      exigirNumero(dados, 'anoCompetencia'),
      exigirNumero(dados, 'mesCompetencia')
    )
  })

  revalidatePath('/financeiro/prestacoes')
  return resultado
}

export async function acaoAjustarSaldoAnterior(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await ajustarSaldoAnterior(
      ctx,
      exigirTexto(dados, 'id'),
      exigirNumero(dados, 'valor'),
      exigirTexto(dados, 'justificativa')
    )
  })

  revalidatePath('/financeiro/prestacoes')
  return resultado
}

export async function acaoRegistrarObservacoes(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    // `?? ''` e não `exigirTexto`: apagar o texto é uma operação legítima, e
    // `texto` devolve `null` para campo vazio.
    await registrarObservacoes(ctx, exigirTexto(dados, 'id'), texto(dados, 'observacoes') ?? '')
  })

  revalidatePath('/financeiro/prestacoes')
  return resultado
}

export async function acaoFecharPrestacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await fecharPrestacao(ctx, exigirTexto(dados, 'id'))
  })

  revalidatePath('/financeiro/prestacoes')
  revalidatePath('/financeiro')
  return resultado
}

export async function acaoReabrirPrestacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await reabrirPrestacao(ctx, exigirTexto(dados, 'id'), exigirTexto(dados, 'motivo'))
  })

  revalidatePath('/financeiro/prestacoes')
  revalidatePath('/financeiro')
  return resultado
}

export async function acaoDefinirContribuicao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await definirContribuicao(ctx, {
      residenteId: exigirTexto(dados, 'residenteId'),
      percentual: exigirNumero(dados, 'percentual'),
      valorBaseBeneficio: exigirNumero(dados, 'valorBaseBeneficio'),
      vigenciaInicio: exigirData(dados, 'vigenciaInicio'),
      observacao: texto(dados, 'observacao'),
    })
  })

  revalidatePath(`/residentes/${exigirTexto(dados, 'residenteId')}`)
  revalidatePath('/financeiro/contribuicoes')
  return resultado
}

/**
 * Cria o lançamento de uma contribuição a partir da proposta do mês.
 *
 * A proposta calcula e mostra; este botão é o "sim" de quem conferiu. Lançar
 * automático inventaria dinheiro que pode não ter chegado.
 */
export async function acaoLancarContribuicao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await lancarReceita(ctx, {
      contaBancariaId: exigirTexto(dados, 'contaBancariaId'),
      origemReceitaId: exigirTexto(dados, 'origemReceitaId'),
      residenteId: exigirTexto(dados, 'residenteId'),
      descricao: exigirTexto(dados, 'descricao'),
      valor: exigirNumero(dados, 'valor'),
      data: exigirData(dados, 'data'),
    })
  })

  revalidatePath('/financeiro/contribuicoes')
  revalidatePath('/financeiro')
  return resultado
}

/**
 * O `alvoTipo` chega do formulário e é entrada de quem usa. Não confie nele:
 * `montarAlvo` só constrói os três alvos que existem, e qualquer outro valor
 * vira `ErroValidacao` antes de o serviço ser chamado.
 */
function montarAlvo(dados: FormData): AlvoAnexo {
  const tipo = String(dados.get('alvoTipo'))
  const id = String(dados.get('alvoId'))

  if (tipo === 'DESPESA_FISCAL') return { tipo, lancamentoId: id }
  if (tipo === 'DESPESA_COMPROVANTE') return { tipo, lancamentoId: id }
  if (tipo === 'EXTRATO') return { tipo, prestacaoId: id }
  throw new ErroValidacao('Anexo desconhecido')
}

export async function acaoAnexarComprovante(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const arquivo = dados.get('arquivo') as File | null
    if (!arquivo || arquivo.size === 0) throw new ErroValidacao('Selecione um arquivo')

    await anexarComprovante(ctx, montarAlvo(dados), {
      nomeArquivoOriginal: arquivo.name,
      mimeType: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    })
  })

  revalidatePath('/financeiro')
  revalidatePath('/financeiro/prestacoes')
  return resultado
}

export async function acaoRemoverComprovante(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await removerComprovante(ctx, montarAlvo(dados))
  })

  revalidatePath('/financeiro')
  revalidatePath('/financeiro/prestacoes')
  return resultado
}
