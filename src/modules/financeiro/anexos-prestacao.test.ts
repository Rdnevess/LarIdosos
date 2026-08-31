import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { salvarArquivo } from '@/lib/arquivos'
import { juntarAnexos, type AnexoParaJuntar } from './anexos-prestacao'

/** Um PDF de verdade com o número de páginas pedido. */
async function pdfCom(paginas: number, largura = 200): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) doc.addPage([largura, 200])
  return Buffer.from(await doc.save())
}

async function paginasDe(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}

/** As larguras das páginas, na ordem em que aparecem no documento. */
async function largurasDe(buffer: Buffer): Promise<number[]> {
  const doc = await PDFDocument.load(buffer)
  return doc.getPages().map((pagina) => pagina.getWidth())
}

/** Grava um PDF no volume e devolve o descritor que o montador consome. */
async function anexo(paginas: number, documentoId: string, largura = 200): Promise<AnexoParaJuntar> {
  const salvo = await salvarArquivo(await pdfCom(paginas, largura), 'application/pdf')
  return { documentoId, caminhoArmazenamento: salvo.caminhoRelativo }
}

const contexto = { prestacaoId: 'p1' }

describe('juntarAnexos', () => {
  it('sem anexo nenhum, devolve exatamente as folhas de entrada', async () => {
    // O teste que impede esta mudanca de vazar para quem nao anexa nada: a
    // prestacao de quem nao usa o recurso continua com as seis folhas de
    // sempre, e nem passa a valer outra contagem.
    const base = await pdfCom(6)
    const resultado = await juntarAnexos(base, [], contexto)

    expect(await paginasDe(resultado)).toBe(6)
    expect(Buffer.compare(resultado, base)).toBe(0)
  })

  it('acrescenta as paginas dos anexos, na ordem recebida', async () => {
    // Contagens diferentes por anexo (1 e 3 páginas) e larguras diferentes por
    // página (300 e 400) tornam cada bloco reconhecível: contar o total não
    // bastaria, porque inverter a ordem dos anexos preserva a contagem e
    // passaria despercebido. Conferir a largura de cada posição prende a
    // ordem de verdade.
    const base = await pdfCom(6)
    const anexos = [await anexo(1, 'd1', 300), await anexo(3, 'd2', 400)]

    const resultado = await juntarAnexos(base, anexos, contexto)

    expect(await largurasDe(resultado)).toEqual([
      200, 200, 200, 200, 200, 200, // as seis folhas de base
      300, // a página única do primeiro anexo
      400, 400, 400, // as três páginas do segundo anexo
    ])
  })

  it('anexo de varias paginas entra inteiro', async () => {
    // Uma nota fiscal de tres paginas nao vira uma pagina so, nem e cortada.
    const base = await pdfCom(6)

    expect(await paginasDe(await juntarAnexos(base, [await anexo(3, 'd1')], contexto))).toBe(9)
  })

  it('arquivo ausente do volume e pulado, e o que vem depois nao sai do lugar', async () => {
    // O registro existe no banco e o arquivo sumiu do disco. A geracao nao pode
    // falhar por isso — e o anexo seguinte tem de entrar do mesmo jeito.
    const base = await pdfCom(6)
    const anexos = [
      { documentoId: 'sumido', caminhoArmazenamento: '2026/08/nao-existe.pdf' },
      await anexo(2, 'd2'),
    ]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(8)
  })

  it('PDF ilegivel e pulado', async () => {
    // Um arquivo com extensao .pdf que nao e PDF derrubaria o `PDFDocument.load`
    // e, com ele, a exportacao inteira.
    const base = await pdfCom(6)
    const quebrado = await salvarArquivo(Buffer.from('isto nao e um PDF'), 'application/pdf')
    const anexos = [
      { documentoId: 'quebrado', caminhoArmazenamento: quebrado.caminhoRelativo },
      await anexo(1, 'd2'),
    ]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(7)
  })
})
