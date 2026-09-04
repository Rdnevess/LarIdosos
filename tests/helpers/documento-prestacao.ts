import type {
  DocumentoPrestacao,
  LinhaDespesa,
  LinhaReceita,
} from '@/modules/financeiro/documento-prestacao'

/**
 * Um `DocumentoPrestacao` completo, montado à mão.
 *
 * O PDF não toca o banco: recebe o documento pronto. Montá-lo aqui é o que
 * faz o teste dele falhar por causa do desenho da folha, e nunca por causa de
 * uma consulta.
 */
export function documentoDeTeste(
  sobrescritas: Partial<DocumentoPrestacao> = {}
): DocumentoPrestacao {
  return {
    capa: {
      razaoSocial: 'Associação Lar dos Idosos',
      cnpj: '11.222.333/0001-81',
      endereco: 'Rua das Flores, 100 — Centro',
      mesPorExtenso: 'agosto',
      ano: 2026,
      conta: '98765-4',
    },
    oficio: {
      cidade: 'Cuiabá/MT',
      dataPorExtenso: '24 de agosto de 2026',
      orgaoDestinatario: 'Prefeitura Municipal de Cuiabá/MT',
      periodo: 'agosto de 2026',
      texto: 'Prezado Senhor,\n\nEm anexo apresentamos a Prestação de Contas.',
      presidente: 'Ana Ribeiro',
      tesoureiro: 'Carlos Menezes',
    },
    despesas: [],
    receitas: [],
    conciliacao: {
      banco: 'Banco do Brasil',
      agencia: '1234-5',
      conta: '98765-4',
      periodo: { de: new Date(2026, 7, 1), ate: new Date(2026, 7, 31) },
      saldoAnterior: 15000,
      recebimentosPorOrigem: [],
      despesasDetalhadas: [],
      totalReceitas: 0,
      totalDespesas: 0,
      saldoDisponivel: 15000,
    },
    encerramento: {
      declaracao: 'Declaramos para os devidos fins de direito...',
      observacoes: '',
      texto: 'Declaramos para os devidos fins de direito...',
      dataPorExtenso: '24 de agosto de 2026',
      presidente: 'Ana Ribeiro',
      tesoureiro: 'Carlos Menezes',
    },
    ...sobrescritas,
  }
}

export function despesaDeTeste(sobrescritas: Partial<LinhaDespesa> = {}): LinhaDespesa {
  return {
    item: 1,
    credor: 'Energisa',
    documento: '11.222.333/0001-81',
    formaPagamento: 'PIX',
    data: new Date(2026, 7, 15),
    valor: 800,
    lancamentoId: 'lancamento-de-teste',
    ...sobrescritas,
  }
}

export function receitaDeTeste(sobrescritas: Partial<LinhaReceita> = {}): LinhaReceita {
  return {
    item: 1,
    origem: 'Doação',
    documento: '',
    data: new Date(2026, 7, 5),
    valor: 2000,
    ...sobrescritas,
  }
}
