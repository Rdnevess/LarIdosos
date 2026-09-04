import type { FormaPagamento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import {
  montarDeclaracao,
  montarEncerramento,
  montarOficio,
  mesPorExtenso,
  periodoPorExtenso,
} from './textos-prestacao'

/**
 * A prestação como estrutura, sem saber nada do PDF que a renderiza.
 *
 * **É aqui que os totais são somados, e em nenhum outro lugar.** O PDF
 * recebe números prontos. Até 01/09/2026 havia dois renderizadores — `.xlsx`
 * e PDF —, e somar num lugar só era o que os impedia de divergir no dia em
 * que alguém corrigisse um cálculo em só um deles. O `.xlsx` saiu, mas o
 * motivo continua: se a regra de agregação mudar (uma categoria que deixa de
 * entrar, um estorno que passa a abater), ela muda aqui e o documento inteiro
 * acompanha.
 *
 * Até 04/09/2026 isso não era verdade: `desenharRodape` refazia a soma da
 * folha com um `reduce` próprio sobre as mesmas linhas. Os números concordavam
 * — medido em 400 mil sorteios, `formatarMoeda` arredonda igual a `duasCasas`
 * —, mas a segunda soma era uma regra de agregação paralela, livre para
 * discordar desta na primeira vez que alguém mexesse só num lado. Hoje o total
 * viaja como parâmetro.
 *
 * O que o renderizador ainda faz de aritmética é combinar totais já fechados
 * ("Total de Saldo + Receitas" é `saldoAnterior + totalReceitas`). Isso não é
 * uma segunda agregação: não percorre lançamento nenhum, e não tem como
 * discordar da regra daqui.
 *
 * O agrupamento de receitas usa `OrigemReceita.rotuloPrestacao`, e não o texto
 * digitado: no Excel o `SUMIF` casa a descrição literal, e "Doação " com espaço
 * sobrando sai do subtotal sem avisar. Aqui é chave estrangeira.
 */

export type LinhaDespesa = {
  item: number
  credor: string
  documento: string
  formaPagamento: string
  data: Date
  valor: number
  /**
   * O id do lançamento que gerou esta linha. **Não vai para o papel** — o PDF
   * não o imprime. Ele existe para o apêndice comprobatório herdar a ordem
   * desta lista em vez de recalculá-la com uma segunda consulta.
   *
   * Duas consultas ordenando a mesma coisa é o defeito que a divisão de turnos
   * já cobrou uma vez: o produto mudou a ordem e a cópia não, e a diferença só
   * aparecia numa hora do dia.
   */
  lancamentoId: string
}

export type LinhaReceita = {
  item: number
  origem: string
  documento: string
  data: Date
  valor: number
}

export type DocumentoPrestacao = {
  capa: {
    razaoSocial: string
    cnpj: string
    endereco: string
    mesPorExtenso: string
    ano: number
    conta: string
  }
  oficio: {
    cidade: string
    dataPorExtenso: string
    orgaoDestinatario: string
    periodo: string
    texto: string
    presidente: string
    tesoureiro: string
  }
  despesas: LinhaDespesa[]
  receitas: LinhaReceita[]
  conciliacao: {
    banco: string
    agencia: string
    conta: string
    periodo: { de: Date; ate: Date }
    saldoAnterior: number
    recebimentosPorOrigem: { rotulo: string; valor: number }[]
    despesasDetalhadas: { credor: string; categoria: string; valor: number }[]
    totalReceitas: number
    totalDespesas: number
    saldoDisponivel: number
  }
  encerramento: {
    declaracao: string
    observacoes: string
    /**
     * As observações e a declaração juntas, como vão para a folha — um
     * `\n\n` separa as duas em parágrafos dentro do mesmo bloco que o PDF
     * imprime (`pdf-prestacao.ts` só lê este campo). `declaracao` e
     * `observacoes` continuam expostos à parte porque é o que os testes
     * conferem: mais simples verificar cada texto isolado do que recortá-lo
     * de dentro do parágrafo combinado.
     */
    texto: string
    dataPorExtenso: string
    presidente: string
    tesoureiro: string
  }
}

const FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  PIX: 'PIX',
  TED: 'TED',
  CHEQUE: 'Cheque',
  DEBITO: 'Débito em conta',
  OUTRO: 'Outro',
}

function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100
}

/** "24 de agosto de 2026" — como o modelo escreve a data das assinaturas. */
function dataPorExtenso(data: Date): string {
  return `${data.getDate()} de ${mesPorExtenso(data.getMonth() + 1)} de ${data.getFullYear()}`
}

/**
 * As observações que vão ao órgão: o texto digitado no mês, mais a
 * justificativa do ajuste de saldo e o motivo da reabertura, quando houver.
 *
 * Os dois últimos entram sozinhos de propósito. São exatamente o que a
 * fiscalização precisa ler, e depender de alguém lembrar de copiá-los para o
 * campo livre seria depender de alguém lembrar.
 */
function reunirObservacoes(prestacao: {
  observacoes: string
  justificativaAjuste: string | null
  motivoReabertura: string | null
}): string {
  const partes = [prestacao.observacoes.trim()]

  if (prestacao.justificativaAjuste) {
    partes.push(`Ajuste do saldo anterior: ${prestacao.justificativaAjuste}`)
  }
  if (prestacao.motivoReabertura) {
    partes.push(`Prestação reaberta: ${prestacao.motivoReabertura}`)
  }

  return partes.filter((parte) => parte !== '').join('\n\n')
}

export async function montarDocumentoPrestacao(
  ctx: Ctx,
  prestacaoId: string
): Promise<DocumentoPrestacao> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    include: { contaBancaria: true },
  })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')

  // A capa, o ofício e as assinaturas saem daqui. Sem ela o documento sairia
  // com lacunas onde deveria haver razão social e CNPJ — melhor recusar.
  const instituicao = await prisma.configuracaoInstituicao.findFirst()
  if (!instituicao) {
    throw new ErroValidacao(
      'Configure os dados da instituição antes de gerar a prestação de contas'
    )
  }

  const { anoCompetencia: ano, mesCompetencia: mes } = prestacao
  const de = new Date(ano, mes - 1, 1)
  const ate = new Date(ano, mes, 0)

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      contaBancariaId: prestacao.contaBancariaId,
      status: 'REALIZADO',
      data: { gte: de, lt: new Date(ano, mes, 1) },
    },
    include: {
      origemReceita: { select: { rotuloPrestacao: true } },
      fornecedor: { select: { nome: true } },
      categoriaDespesa: { select: { nome: true } },
    },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  })

  const receitas: LinhaReceita[] = []
  const despesas: LinhaDespesa[] = []
  const porRotulo = new Map<string, number>()
  const despesasDetalhadas: { credor: string; categoria: string; valor: number }[] = []
  let totalReceitas = 0
  let totalDespesas = 0

  for (const lancamento of lancamentos) {
    const valor = Number(lancamento.valor)

    if (lancamento.natureza === 'RECEITA') {
      // O rótulo, nunca a descrição digitada: é o que faz a contribuição de um
      // residente somar com as demais doações sem levar o nome dele junto.
      const rotulo = lancamento.origemReceita?.rotuloPrestacao ?? 'Outras receitas'

      receitas.push({
        item: receitas.length + 1,
        origem: rotulo,
        documento: lancamento.numeroDocumentoFiscal ?? '',
        data: lancamento.data,
        valor,
      })
      porRotulo.set(rotulo, duasCasas((porRotulo.get(rotulo) ?? 0) + valor))
      totalReceitas += valor
    } else {
      const credor = lancamento.fornecedor?.nome ?? lancamento.descricao

      despesas.push({
        item: despesas.length + 1,
        credor,
        documento: lancamento.numeroDocumentoFiscal ?? '',
        formaPagamento: lancamento.formaPagamento
          ? FORMA_PAGAMENTO[lancamento.formaPagamento]
          : '',
        data: lancamento.data,
        valor,
        lancamentoId: lancamento.id,
      })
      despesasDetalhadas.push({
        credor,
        categoria: lancamento.categoriaDespesa?.nome ?? 'Sem categoria',
        valor,
      })
      totalDespesas += valor
    }
  }

  totalReceitas = duasCasas(totalReceitas)
  totalDespesas = duasCasas(totalDespesas)

  // O ajustado quando existe: o derivado continua guardado ao lado, e a
  // divergência entre os dois está na trilha com autor e justificativa.
  const saldoAnterior = Number(prestacao.saldoAnteriorAjustado ?? prestacao.saldoAnterior)

  const conta = prestacao.contaBancaria
  const observacoes = reunirObservacoes(prestacao)
  const mesEscrito = mesPorExtenso(mes)
  const hoje = dataPorExtenso(new Date())

  return {
    capa: {
      razaoSocial: instituicao.razaoSocial,
      cnpj: instituicao.cnpj,
      endereco: instituicao.enderecoCompleto,
      mesPorExtenso: mesEscrito,
      ano,
      conta: conta.numeroConta,
    },
    oficio: {
      cidade: instituicao.cidade,
      dataPorExtenso: hoje,
      orgaoDestinatario: instituicao.orgaoDestinatario,
      periodo: periodoPorExtenso(mes, ano),
      texto: montarOficio({
        razaoSocial: instituicao.razaoSocial,
        periodoPorExtenso: periodoPorExtenso(mes, ano),
      }),
      presidente: instituicao.nomePresidente,
      tesoureiro: instituicao.nomeTesoureiro,
    },
    despesas,
    receitas,
    conciliacao: {
      banco: conta.banco,
      agencia: conta.agencia,
      conta: conta.numeroConta,
      periodo: { de, ate },
      saldoAnterior,
      recebimentosPorOrigem: [...porRotulo.entries()]
        .map(([rotulo, valor]) => ({ rotulo, valor }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
      despesasDetalhadas,
      totalReceitas,
      totalDespesas,
      saldoDisponivel: duasCasas(saldoAnterior + totalReceitas - totalDespesas),
    },
    encerramento: {
      declaracao: montarDeclaracao({
        numeroConta: conta.numeroConta,
        mesPorExtenso: mesEscrito,
        ano,
      }),
      observacoes,
      texto: montarEncerramento({
        observacoes,
        numeroConta: conta.numeroConta,
        mesPorExtenso: mesEscrito,
        ano,
      }),
      dataPorExtenso: hoje,
      presidente: instituicao.nomePresidente,
      tesoureiro: instituicao.nomeTesoureiro,
    },
  }
}
