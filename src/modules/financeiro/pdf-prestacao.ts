import PDFDocument from 'pdfkit'
import type { DocumentoPrestacao } from './documento-prestacao'

/**
 * O mesmo documento do `.xlsx`, desenhado para impressão e assinatura.
 *
 * **Não é pixel a pixel igual**, e não precisa ser: o que vai ao órgão é o
 * `.xlsx`. Este PDF serve ao arquivo interno, à conferência e à assinatura
 * física.
 *
 * `pdfkit`, e não conversão do `.xlsx`: converter com LibreOffice ou Chromium
 * daria fidelidade perfeita e custaria uns 400 MB na imagem Docker mais um
 * subprocesso, num VPS único.
 *
 * As fontes são as padrão do PDF (`Helvetica`, `Helvetica-Bold`). Elas usam
 * WinAnsi, que cobre os acentos do português — nenhum arquivo de fonte a
 * embarcar, e nenhuma caixa vazia no lugar do "ç". Há teste.
 */

type Doc = InstanceType<typeof PDFDocument>

const MARGEM = 40
const LARGURA_UTIL = 595.28 - MARGEM * 2

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dataCurta(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getFullYear()}`
}

function titulo(doc: Doc, texto: string): void {
  doc.font('Helvetica-Bold').fontSize(13).text(texto, { align: 'center' })
  doc.moveDown(1)
}

function cabecalhoDaFolha(doc: Doc, documento: DocumentoPrestacao, subtitulo: string): void {
  doc.font('Helvetica-Bold').fontSize(11).text(documento.oficio.orgaoDestinatario)
  doc.font('Helvetica').fontSize(10).text(`Unidade Executora: ${documento.capa.razaoSocial}`)
  doc.moveDown(0.5)
  titulo(doc, subtitulo)
}

/**
 * O bloco de assinaturas ao pé da folha, na ordem que o modelo usa naquela
 * folha — a conciliação e o encerramento assinam com o tesoureiro à esquerda.
 */
function assinaturas(doc: Doc, esquerda: [string, string], direita: [string, string]): void {
  const y = Math.max(doc.y + 30, 640)
  const largura = LARGURA_UTIL / 2 - 20

  doc.font('Helvetica').fontSize(10)
  doc.text('______________________________', MARGEM, y, { width: largura, align: 'center' })
  doc.text(esquerda[0], MARGEM, y + 16, { width: largura, align: 'center' })
  doc.text(esquerda[1], MARGEM, y + 30, { width: largura, align: 'center' })

  const x = MARGEM + LARGURA_UTIL / 2 + 20
  doc.text('______________________________', x, y, { width: largura, align: 'center' })
  doc.text(direita[0], x, y + 16, { width: largura, align: 'center' })
  doc.text(direita[1], x, y + 30, { width: largura, align: 'center' })
}

type Coluna = { titulo: string; largura: number; alinhamento?: 'left' | 'right' }

/**
 * Uma tabela que pagina sozinha, repetindo o cabeçalho. É o que sustenta o mês
 * de quarenta lançamentos sem ninguém precisar mexer em nada.
 */
function tabela(
  doc: Doc,
  colunas: Coluna[],
  linhas: string[][],
  total: { rotulo: string; valor: string }
): void {
  const alturaDaLinha = 16
  const ultimaLinhaUtil = 700

  const escreverCabecalho = () => {
    let x = MARGEM
    doc.font('Helvetica-Bold').fontSize(9)
    for (const coluna of colunas) {
      doc.text(coluna.titulo, x, doc.y, {
        width: coluna.largura,
        align: coluna.alinhamento ?? 'left',
        continued: false,
      })
      doc.y -= alturaDaLinha
      x += coluna.largura
    }
    doc.y += alturaDaLinha
    doc.moveTo(MARGEM, doc.y).lineTo(MARGEM + LARGURA_UTIL, doc.y).stroke()
    doc.y += 4
  }

  escreverCabecalho()
  doc.font('Helvetica').fontSize(9)

  for (const linha of linhas) {
    if (doc.y > ultimaLinhaUtil) {
      doc.addPage()
      escreverCabecalho()
      doc.font('Helvetica').fontSize(9)
    }

    let x = MARGEM
    const y = doc.y
    colunas.forEach((coluna, indice) => {
      doc.text(linha[indice] ?? '', x, y, {
        width: coluna.largura,
        align: coluna.alinhamento ?? 'left',
        lineBreak: false,
      })
      x += coluna.largura
    })
    doc.y = y + alturaDaLinha
  }

  doc.moveTo(MARGEM, doc.y).lineTo(MARGEM + LARGURA_UTIL, doc.y).stroke()
  doc.y += 4

  const y = doc.y
  doc.font('Helvetica-Bold').fontSize(10)
  doc.text(total.rotulo, MARGEM, y, { width: LARGURA_UTIL - 90, align: 'right' })
  doc.text(total.valor, MARGEM + LARGURA_UTIL - 90, y, { width: 90, align: 'right' })
  doc.y = y + alturaDaLinha
}

function paginaCapa(doc: Doc, documento: DocumentoPrestacao): void {
  doc.font('Helvetica-Bold').fontSize(16).text(documento.capa.razaoSocial, { align: 'center' })
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(`CNPJ: ${documento.capa.cnpj} - ${documento.capa.endereco}`, { align: 'center' })

  doc.moveDown(6)
  doc.font('Helvetica-Bold').fontSize(22).text('PRESTAÇÃO DE CONTAS', { align: 'center' })
  doc.moveDown(3)
  doc.fontSize(18).text(documento.capa.mesPorExtenso.toUpperCase(), { align: 'center' })
  doc.fontSize(18).text(String(documento.capa.ano), { align: 'center' })
  doc.moveDown(4)
  doc
    .font('Helvetica')
    .fontSize(12)
    .text(`Conta Corrente nº ${documento.capa.conta}`, { align: 'center' })
}

function paginaContraCapa(doc: Doc, documento: DocumentoPrestacao): void {
  doc.font('Helvetica-Bold').fontSize(12).text(documento.capa.razaoSocial, { align: 'center' })
  doc.moveDown(2)

  doc
    .font('Helvetica')
    .fontSize(10)
    .text(`${documento.oficio.cidade}, ${documento.oficio.dataPorExtenso}.`, { align: 'right' })
  doc.moveDown(2)
  doc.text(documento.oficio.orgaoDestinatario)
  doc.moveDown(1)
  doc.font('Helvetica-Bold').text('Assunto: Prestação de Contas')
  doc.moveDown(2)

  doc.font('Helvetica').fontSize(10).text(documento.oficio.texto, { align: 'justify' })

  assinaturas(
    doc,
    [documento.oficio.presidente, 'Presidente'],
    [documento.oficio.tesoureiro, 'Tesoureiro']
  )
}

function paginaDespesas(doc: Doc, documento: DocumentoPrestacao): void {
  cabecalhoDaFolha(doc, documento, 'DESPESAS')

  tabela(
    doc,
    [
      { titulo: 'Item', largura: 35 },
      { titulo: 'Credor', largura: 180 },
      { titulo: 'CNPJ/CPF', largura: 110 },
      { titulo: 'CH/OB', largura: 70 },
      { titulo: 'Data', largura: 60 },
      { titulo: 'Valor (R$)', largura: 60, alinhamento: 'right' },
    ],
    documento.despesas.map((despesa) => [
      String(despesa.item),
      despesa.credor,
      despesa.documento,
      despesa.formaPagamento,
      dataCurta(despesa.data),
      moeda(despesa.valor),
    ]),
    { rotulo: 'Total', valor: moeda(documento.conciliacao.totalDespesas) }
  )

  assinaturas(
    doc,
    [documento.oficio.presidente, 'Presidente'],
    [documento.oficio.tesoureiro, 'Tesoureiro']
  )
}

function paginaReceitas(doc: Doc, documento: DocumentoPrestacao): void {
  cabecalhoDaFolha(doc, documento, 'RECEBIMENTOS')

  tabela(
    doc,
    [
      { titulo: 'Item', largura: 35 },
      { titulo: 'Origem', largura: 250 },
      { titulo: 'CNPJ/CPF', largura: 120 },
      { titulo: 'Data', largura: 60 },
      { titulo: 'Valor (R$)', largura: 50, alinhamento: 'right' },
    ],
    documento.receitas.map((receita) => [
      String(receita.item),
      receita.origem,
      receita.documento,
      dataCurta(receita.data),
      moeda(receita.valor),
    ]),
    { rotulo: 'Total', valor: moeda(documento.conciliacao.totalReceitas) }
  )

  assinaturas(
    doc,
    [documento.oficio.presidente, 'Presidente'],
    [documento.oficio.tesoureiro, 'Tesoureiro']
  )
}

function paginaConciliacao(doc: Doc, documento: DocumentoPrestacao): void {
  const dados = documento.conciliacao
  cabecalhoDaFolha(doc, documento, 'CONCILIAÇÃO BANCÁRIA')

  doc
    .font('Helvetica')
    .fontSize(10)
    .text(
      `Período de ${dataCurta(dados.periodo.de)} a ${dataCurta(dados.periodo.ate)}`,
      { align: 'center' }
    )
  doc.moveDown(1)
  doc.font('Helvetica-Bold').text('Dados Bancários')
  doc
    .font('Helvetica')
    .text(`Banco: ${dados.banco}    Agência: ${dados.agencia}    Conta Corrente nº ${dados.conta}`)
  doc.moveDown(1)

  const linha = (rotulo: string, valor: number, negrito = false, recuo = 0) => {
    const y = doc.y
    doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
    doc.text(rotulo, MARGEM + recuo, y, { width: LARGURA_UTIL - 100 - recuo })
    doc.text(moeda(valor), MARGEM + LARGURA_UTIL - 100, y, { width: 100, align: 'right' })
    doc.y = y + 16
  }

  doc.font('Helvetica-Bold').fontSize(11).text('Movimentação Bancária')
  doc.moveDown(0.5)

  linha('Saldo Anterior', dados.saldoAnterior, true)
  linha('(+) Recebimentos', dados.totalReceitas, true)
  for (const recebimento of dados.recebimentosPorOrigem) {
    linha(recebimento.rotulo, recebimento.valor, false, 20)
  }
  linha(
    'Total de Saldo + Receitas',
    Math.round((dados.saldoAnterior + dados.totalReceitas) * 100) / 100,
    true
  )

  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(11).text('( - ) Despesas')
  doc.moveDown(0.5)
  for (const despesa of dados.despesasDetalhadas) {
    linha(`${despesa.credor} — ${despesa.categoria}`, despesa.valor, false, 20)
  }
  linha('Total de Despesas', dados.totalDespesas, true)

  doc.moveDown(1)
  linha('Saldo Disponível', dados.saldoDisponivel, true)

  // A conciliação assina na ordem inversa das folhas de lançamento: é como o
  // modelo faz, e o documento entregue precisa parecer com o que o órgão espera.
  assinaturas(
    doc,
    [documento.oficio.tesoureiro, 'Tesoureiro'],
    [documento.oficio.presidente, 'Presidente']
  )
}

function paginaEncerramento(doc: Doc, documento: DocumentoPrestacao): void {
  doc.font('Helvetica-Bold').fontSize(12).text(documento.capa.razaoSocial, { align: 'center' })
  doc.moveDown(2)
  titulo(doc, 'DECLARAÇÃO DE GUARDA E CONSERVAÇÃO DOS DOCUMENTOS CONTÁBEIS')

  doc.font('Helvetica').fontSize(10).text(`Unidade Executora: ${documento.capa.razaoSocial}`)
  doc.moveDown(2)
  // As observações do mês e a declaração, na ordem em que vão à folha.
  doc.fontSize(11).text(documento.encerramento.texto, { align: 'justify' })

  doc.moveDown(3)
  doc
    .fontSize(10)
    .text(`${documento.oficio.cidade}, ${documento.encerramento.dataPorExtenso}.`, {
      align: 'right',
    })

  assinaturas(
    doc,
    [documento.encerramento.tesoureiro, 'Tesoureiro'],
    [documento.encerramento.presidente, 'Presidente']
  )
}

export function gerarPdfPrestacao(documento: DocumentoPrestacao): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Sem compressão em teste: é o que deixa o teste ler os segmentos de texto
    // do buffer sem embarcar um leitor de PDF só para isso.
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGEM,
      compress: process.env.NODE_ENV !== 'test',
      info: {
        Title: `Prestação de Contas — ${documento.capa.mesPorExtenso} de ${documento.capa.ano}`,
        Author: documento.capa.razaoSocial,
      },
    })

    const pedacos: Buffer[] = []
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco))
    doc.on('end', () => resolve(Buffer.concat(pedacos)))
    doc.on('error', reject)

    const paginas = [
      paginaCapa,
      paginaContraCapa,
      paginaDespesas,
      paginaReceitas,
      paginaConciliacao,
      paginaEncerramento,
    ]

    paginas.forEach((montar, indice) => {
      if (indice > 0) doc.addPage()
      montar(doc, documento)
    })

    doc.end()
  })
}
