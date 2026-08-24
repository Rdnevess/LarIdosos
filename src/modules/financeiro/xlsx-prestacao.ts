import ExcelJS from 'exceljs'
import { LAYOUT, type NomeFolha } from './layout-prestacao'
import type { DocumentoPrestacao } from './documento-prestacao'

/**
 * O `.xlsx` no formato que o órgão já recebe.
 *
 * **Valores, nunca fórmulas.** O sistema é a fonte da verdade dos totais; as
 * fórmulas do modelo são justamente a parte frágil — soma de faixa fixa,
 * agrupamento por texto literal, e um `XLOOKUP` que já aponta para `#REF!`.
 * Uma planilha entregue com fórmula é uma planilha que pode recalcular errado
 * na máquina de quem a abrir.
 *
 * **A folha cresce com o mês.** O modelo tem 22 linhas de dado; o teto já foi
 * atingido, e hoje a equipe insere linhas e reajusta fórmulas à mão. Aqui o
 * rodapé desliza pelo volume real.
 *
 * **Os merges vão por último**, sempre: mesclar antes de escrever perde o
 * conteúdo das células secundárias.
 */

const MOEDA = '#,##0.00'
const DATA = 'dd/mm/yyyy'

/** O texto que o modelo traz numa célula — usado como rótulo, nunca como dado. */
function rotulo(folha: NomeFolha, celula: string): string {
  return LAYOUT[folha].rotulos[celula] ?? ''
}

function dataCurta(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getFullYear()}`
}

function aplicarLarguras(folha: ExcelJS.Worksheet, nome: NomeFolha): void {
  for (const { coluna, largura } of LAYOUT[nome].larguras) {
    folha.getColumn(coluna).width = largura
  }
}

/**
 * Desloca uma faixa mesclada em `delta` linhas. `B11:E11` com delta 3 vira
 * `B14:E14` — é assim que o padrão de uma linha do modelo se repete pelo
 * volume real, e que o rodapé desce quando a faixa de dados cresce.
 */
function deslocar(faixa: string, delta: number): string {
  return faixa.replace(/([A-Z]+)(\d+)/g, (_, coluna: string, linha: string) => {
    return `${coluna}${Number(linha) + delta}`
  })
}

/**
 * A linha onde a faixa começa. Concatenar os dígitos de `A1:L2` daria 12 — o
 * número precisa sair da primeira âncora, não do texto inteiro.
 */
function primeiraLinhaDa(faixa: string): number {
  return Number(/\d+/.exec(faixa)![0])
}

function mesclar(folha: ExcelJS.Worksheet, faixas: string[]): void {
  for (const faixa of faixas) {
    // Uma faixa de uma célula só não é merge, e o ExcelJS reclama dela.
    const [de, ate] = faixa.split(':')
    if (de !== ate) folha.mergeCells(faixa)
  }
}

function escreverRotulosFixos(
  folha: ExcelJS.Worksheet,
  nome: NomeFolha,
  substituicoes: Record<string, string>,
  ateLinha = Number.POSITIVE_INFINITY
): void {
  const { rotulos } = LAYOUT[nome]

  for (const [celula, texto] of Object.entries(rotulos)) {
    const linha = Number(celula.replace(/[A-Z]/g, ''))
    if (linha > ateLinha) continue
    // Substituição vazia é intencional: a célula do modelo era um exemplo
    // ("Nome Banco", "XX.XXX-X") e o dado real vai ser escrito depois.
    if (celula in substituicoes) continue
    folha.getCell(celula).value = texto
  }

  for (const [celula, texto] of Object.entries(substituicoes)) {
    folha.getCell(celula).value = texto
  }
}

function montarCapa(wb: ExcelJS.Workbook, documento: DocumentoPrestacao): void {
  const folha = wb.addWorksheet('1-Capa')
  aplicarLarguras(folha, '1-Capa')

  escreverRotulosFixos(folha, '1-Capa', {
    A1: documento.capa.razaoSocial,
    A3: `CNPJ: ${documento.capa.cnpj} - ${documento.capa.endereco}`,
    A23: documento.capa.mesPorExtenso.toUpperCase(),
    A29: String(documento.capa.ano),
    A51: `Conta Corrente nº ${documento.capa.conta}`,
  })

  mesclar(folha, LAYOUT['1-Capa'].merges)
}

function montarContraCapa(wb: ExcelJS.Workbook, documento: DocumentoPrestacao): void {
  const folha = wb.addWorksheet('2-Contra-Capa')
  aplicarLarguras(folha, '2-Contra-Capa')

  escreverRotulosFixos(folha, '2-Contra-Capa', {
    A1: documento.capa.razaoSocial,
    A5: `${documento.oficio.cidade}, ${documento.oficio.dataPorExtenso}.`,
    A8: documento.oficio.orgaoDestinatario,
    // A16 é o corpo do ofício: no modelo era conteúdo, não rótulo, e por isso
    // não foi extraído. O texto vem de `textos-prestacao`, com o período e a
    // razão social desta prestação.
    A16: documento.oficio.texto,
    A39: documento.oficio.presidente,
    G39: documento.oficio.tesoureiro,
  })

  folha.getCell('A16').alignment = { vertical: 'top', wrapText: true }
  mesclar(folha, LAYOUT['2-Contra-Capa'].merges)
}

/**
 * As duas folhas de lançamento — despesas e recebimentos — têm a mesma
 * estrutura: cabeçalho até a linha 10, faixa de dados a partir da 11, e um
 * rodapé (total e assinaturas) que desliza pelo volume.
 */
function montarFolhaDeLancamentos(
  wb: ExcelJS.Workbook,
  nome: '3-Despesas' | '4-Receitas',
  documento: DocumentoPrestacao,
  linhas: { descricao: string; documento: string; complemento: string; data: Date; valor: number }[]
): void {
  const folha = wb.addWorksheet(nome)
  aplicarLarguras(folha, nome)

  const layout = LAYOUT[nome]
  const { primeiraLinha, ultimaLinha } = layout.faixaDados!
  const linhasDoModelo = ultimaLinha - primeiraLinha + 1
  // Nunca encolhe abaixo do modelo: uma folha com três linhas e o resto em
  // branco é o que o órgão está acostumado a receber.
  const usadas = Math.max(linhas.length, linhasDoModelo)
  const delta = usadas - linhasDoModelo

  escreverRotulosFixos(
    folha,
    nome,
    {
      A1: documento.oficio.orgaoDestinatario,
      A6: documento.capa.razaoSocial,
    },
    primeiraLinha - 1
  )

  linhas.forEach((linha, indice) => {
    const numero = primeiraLinha + indice
    folha.getCell(numero, 1).value = indice + 1
    folha.getCell(numero, 2).value = linha.descricao
    folha.getCell(numero, 6).value = linha.documento
    if (linha.complemento) folha.getCell(numero, 8).value = linha.complemento
    folha.getCell(numero, 9).value = linha.data
    folha.getCell(numero, 9).numFmt = DATA
    folha.getCell(numero, 11).value = linha.valor
    folha.getCell(numero, 11).numFmt = MOEDA
  })

  // Rodapé: os rótulos do modelo, nas linhas que sobraram depois dos dados.
  const total = linhas.reduce((soma, linha) => soma + linha.valor, 0)
  const linhaTotal = ultimaLinha + 1 + delta

  // O total ancora em J, e não em K como as linhas de dado: no modelo a faixa
  // do total é `J33:L33`, e a da linha é `K11:L11`. Escrever em K poria o
  // número numa célula secundária do merge, que o Excel descarta.
  folha.getCell(linhaTotal, 8).value = rotulo(nome, 'H33')
  folha.getCell(linhaTotal, 10).value = Math.round(total * 100) / 100
  folha.getCell(linhaTotal, 10).numFmt = MOEDA

  folha.getCell(34 + delta, 1).value = rotulo(nome, 'A34')
  folha.getCell(34 + delta, 2).value = documento.capa.razaoSocial
  folha.getCell(36 + delta, 1).value = rotulo(nome, 'A36')
  folha.getCell(36 + delta, 7).value = rotulo(nome, 'G36')
  folha.getCell(37 + delta, 1).value = documento.oficio.presidente
  folha.getCell(37 + delta, 7).value = documento.oficio.tesoureiro
  folha.getCell(38 + delta, 1).value = rotulo(nome, 'A38')
  folha.getCell(38 + delta, 7).value = rotulo(nome, 'G38')

  // O padrão de merge de uma linha de dado, repetido pelo volume real; e o
  // rodapé deslocado pelo mesmo delta.
  const padraoDaLinha = layout.merges.filter(
    (faixa) => primeiraLinhaDa(faixa) === primeiraLinha
  )
  const faixas: string[] = []

  for (const faixa of layout.merges) {
    const linha = primeiraLinhaDa(faixa)
    if (linha >= primeiraLinha && linha <= ultimaLinha) continue
    faixas.push(linha > ultimaLinha ? deslocar(faixa, delta) : faixa)
  }
  for (let indice = 0; indice < usadas; indice++) {
    for (const faixa of padraoDaLinha) faixas.push(deslocar(faixa, indice))
  }

  mesclar(folha, faixas)
}

/**
 * A conciliação é composta, não copiada.
 *
 * O layout extraído traz, da linha 13 em diante, as linhas do exemplo
 * preenchido — as categorias "Salário", "Diária", "Taxa bancária" de outra
 * prestação. São genéricas, e por isso passaram pela barreira de CPF/CNPJ do
 * extrator, mas continuam sendo conteúdo alheio. Aqui só os rótulos de
 * verdade são reaproveitados, e a posição deles é calculada pelo volume.
 */
function montarConciliacao(wb: ExcelJS.Workbook, documento: DocumentoPrestacao): void {
  const folha = wb.addWorksheet('5-Conciliação')
  aplicarLarguras(folha, '5-Conciliação')

  const dados = documento.conciliacao
  const faixas: string[] = []

  escreverRotulosFixos(
    folha,
    '5-Conciliação',
    {
      A1: documento.capa.razaoSocial,
      A7: `Período de ${dataCurta(dados.periodo.de)} a ${dataCurta(dados.periodo.ate)}`,
      A10: dados.banco,
      E10: dados.agencia,
      I10: dados.conta,
    },
    12
  )
  for (const faixa of LAYOUT['5-Conciliação'].merges) {
    if (primeiraLinhaDa(faixa) <= 12) faixas.push(faixa)
  }

  let linha = 13
  const escreverValor = (numero: number, valor: number) => {
    folha.getCell(numero, 10).value = valor
    folha.getCell(numero, 10).numFmt = MOEDA
    faixas.push(`J${numero}:L${numero}`)
  }

  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A13')
  escreverValor(linha, dados.saldoAnterior)
  faixas.push(`A${linha}:I${linha}`)
  linha++

  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A14')
  escreverValor(linha, dados.totalReceitas)
  faixas.push(`A${linha}:I${linha}`)
  linha++

  for (const recebimento of dados.recebimentosPorOrigem) {
    folha.getCell(linha, 2).value = recebimento.rotulo
    escreverValor(linha, recebimento.valor)
    faixas.push(`B${linha}:F${linha}`)
    linha++
  }

  linha++
  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A20')
  escreverValor(linha, Math.round((dados.saldoAnterior + dados.totalReceitas) * 100) / 100)
  faixas.push(`A${linha}:I${linha}`)
  linha += 2

  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A22')
  faixas.push(`A${linha}:I${linha}`)
  linha++

  // B23 vem em branco no modelo; a coluna é a do credor.
  folha.getCell(linha, 2).value = 'Credor'
  folha.getCell(linha, 6).value = rotulo('5-Conciliação', 'F23')
  faixas.push(`B${linha}:E${linha}`, `F${linha}:I${linha}`)
  linha++

  for (const despesa of dados.despesasDetalhadas) {
    folha.getCell(linha, 2).value = despesa.credor
    folha.getCell(linha, 6).value = despesa.categoria
    escreverValor(linha, despesa.valor)
    faixas.push(`B${linha}:E${linha}`, `F${linha}:I${linha}`)
    linha++
  }

  linha++
  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A47')
  escreverValor(linha, dados.totalDespesas)
  faixas.push(`A${linha}:I${linha}`)
  linha += 2

  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A49')
  escreverValor(linha, dados.saldoDisponivel)
  faixas.push(`A${linha}:I${linha}`)
  linha += 2

  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A51')
  folha.getCell(linha, 2).value = documento.capa.razaoSocial
  linha += 3

  // A conciliação assina na ordem inversa das folhas de lançamento: tesoureiro
  // à esquerda, presidente à direita. É como o modelo faz.
  folha.getCell(linha, 1).value = rotulo('5-Conciliação', 'A54')
  folha.getCell(linha, 7).value = rotulo('5-Conciliação', 'G54')
  folha.getCell(linha + 1, 1).value = documento.oficio.tesoureiro
  folha.getCell(linha + 1, 7).value = documento.oficio.presidente
  folha.getCell(linha + 2, 1).value = rotulo('5-Conciliação', 'A56')
  folha.getCell(linha + 2, 7).value = rotulo('5-Conciliação', 'G56')
  for (let deslocamento = 0; deslocamento < 3; deslocamento++) {
    faixas.push(`A${linha + deslocamento}:F${linha + deslocamento}`)
    faixas.push(`G${linha + deslocamento}:L${linha + deslocamento}`)
  }

  mesclar(folha, faixas)
}

function montarEncerramentoFolha(wb: ExcelJS.Workbook, documento: DocumentoPrestacao): void {
  const folha = wb.addWorksheet('6-Encerramento')
  aplicarLarguras(folha, '6-Encerramento')

  escreverRotulosFixos(folha, '6-Encerramento', {
    A1: documento.capa.razaoSocial,
    A8: documento.capa.razaoSocial,
    // A11 é o corpo da folha: as observações do mês e a declaração de guarda.
    A11: documento.encerramento.texto,
    A23: `${documento.oficio.cidade}, ${documento.encerramento.dataPorExtenso}.`,
    A29: documento.encerramento.tesoureiro,
    G29: documento.encerramento.presidente,
  })

  folha.getCell('A11').alignment = { vertical: 'top', wrapText: true }
  mesclar(folha, LAYOUT['6-Encerramento'].merges)
}

export async function gerarXlsxPrestacao(documento: DocumentoPrestacao): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = documento.capa.razaoSocial

  montarCapa(wb, documento)
  montarContraCapa(wb, documento)
  montarFolhaDeLancamentos(
    wb,
    '3-Despesas',
    documento,
    documento.despesas.map((despesa) => ({
      descricao: despesa.credor,
      documento: despesa.documento,
      complemento: despesa.formaPagamento,
      data: despesa.data,
      valor: despesa.valor,
    }))
  )
  montarFolhaDeLancamentos(
    wb,
    '4-Receitas',
    documento,
    documento.receitas.map((receita) => ({
      descricao: receita.origem,
      documento: receita.documento,
      complemento: '',
      data: receita.data,
      valor: receita.valor,
    }))
  )
  montarConciliacao(wb, documento)
  montarEncerramentoFolha(wb, documento)

  return Buffer.from(await wb.xlsx.writeBuffer())
}
