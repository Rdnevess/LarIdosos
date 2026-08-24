/**
 * Os textos institucionais da prestação de contas.
 *
 * Moram aqui, e não no layout extraído do modelo, porque **não são layout**:
 * carregam o período, o número da conta e a razão social, que vêm da prestação
 * e da configuração da instituição. Um texto com "dezembro de 2025" congelado
 * dentro seria um documento que mente sobre a própria competência.
 *
 * A redação é a que o órgão conveniador já aceita, preservada palavra por
 * palavra — com uma exceção, marcada abaixo.
 */

/**
 * O ofício de encaminhamento da contra-capa.
 *
 * O modelo trazia a razão social escrita à mão no meio do texto; aqui ela vem
 * de `ConfiguracaoInstituicao`, para o documento não divergir da capa no dia em
 * que a instituição mudar de nome.
 */
export function montarOficio(dados: {
  razaoSocial: string
  periodoPorExtenso: string
}): string {
  return `Prezado Senhor,

             Em anexo apresentamos a Prestação de Contas referente aos repasses referente o período de ${dados.periodoPorExtenso}, correspondente aos gastos efetuados, pagos, utilizando os recursos recebidos para tal fim, conforme demonstrado abaixo e fotocópias anexas:

              Informamos ainda, que, a ${dados.razaoSocial}, entidade filantrópica, sem fins lucrativos, políticos ou de proselitismo religioso, cujo objetivo é dar apoio aos idosos da cidade e região.

              Como é uma associação sem fins lucrativos e sobrevive de realização de promoções, contribuições e doações, carece e muito de todos nós, pois a nossa contribuição e esforço, reverte-se em benefício de pessoas ali residentes.

              Agradecidos e esperando ter atendido a necessidade da prestação de contas, desejamos um bom trabalho coroado de êxitos, aproveitamos para reiterar votos de estima e consideração.

Respeitosamente,`
}

/**
 * A declaração de guarda e conservação, da folha de encerramento.
 *
 * **A primeira linha do modelo saiu.** Ela dizia "Instrução para Claude, aqui
 * deve caber também anotações importante que devem ser citadas na Prestação de
 * Contas" — era uma nota de trabalho escrita dentro do arquivo, não parte do
 * documento, e sairia impressa em toda prestação. O que ela pedia está
 * atendido: as observações do mês entram acima da declaração, por
 * `montarEncerramento`.
 *
 * **"Conte Corrente" virou "Conta Corrente".** Erro de digitação do modelo,
 * sem mudança de sentido.
 *
 * **"à disposição dos condôminos" ficou como está**, e é estranho: condômino é
 * dono de apartamento, não órgão conveniador — o texto provavelmente veio de
 * outro modelo. Não foi corrigido porque é a redação que o órgão já recebeu, e
 * mudá-la é decisão da instituição, não do sistema. Está registrado nas
 * pendências da fase.
 */
export function montarDeclaracao(dados: {
  numeroConta: string
  mesPorExtenso: string
  ano: number
}): string {
  return `           Declaramos para os devidos fins de direito que os Documentos Contábeis referentes à Prestação de Contas da Conta Corrente ${dados.numeroConta}, referente ao mês de ${dados.mesPorExtenso} de ${dados.ano}, encontram-se guardados, arquivados em boa ordem e conservação, identificados e à disposição dos condôminos.`
}

/**
 * A folha de encerramento inteira: as observações do mês, quando houver, e
 * depois a declaração.
 *
 * As observações são o campo livre que a instituição pediu — justificativas de
 * movimentações incomuns do mês, valores atípicos, esclarecimentos ao órgão. A
 * elas se somam, automaticamente, a justificativa de ajuste do saldo anterior e
 * o motivo de uma reabertura, se tiverem acontecido: os dois são exatamente o
 * tipo de coisa que o órgão precisa ler, e depender de alguém lembrar de
 * copiá-los seria depender de alguém lembrar.
 */
export function montarEncerramento(dados: {
  observacoes: string
  numeroConta: string
  mesPorExtenso: string
  ano: number
}): string {
  const declaracao = montarDeclaracao(dados)
  const observacoes = dados.observacoes.trim()

  return observacoes === '' ? declaracao : `${observacoes}\n\n${declaracao}`
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** O mês por extenso, em minúsculas, como o modelo o escreve no corpo dos textos. */
export function mesPorExtenso(mes: number): string {
  const nome = MESES[mes - 1]
  if (!nome) throw new Error(`Mês fora do intervalo de 1 a 12: ${mes}`)
  return nome
}

/** "dezembro de 2025" — como o ofício e a declaração o escrevem. */
export function periodoPorExtenso(mes: number, ano: number): string {
  return `${mesPorExtenso(mes)} de ${ano}`
}
