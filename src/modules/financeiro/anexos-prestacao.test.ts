import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { salvarArquivo } from '@/lib/arquivos'
import { juntarAnexos, type AnexoParaJuntar } from './anexos-prestacao'

/** Um PDF de verdade com o número de páginas pedido. */
async function pdfCom(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

async function paginasDe(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}

/** Grava um PDF no volume e devolve o descritor que o montador consome. */
async function anexo(paginas: number, documentoId: string): Promise<AnexoParaJuntar> {
  const salvo = await salvarArquivo(await pdfCom(paginas), 'application/pdf')
  return { documentoId, caminhoArmazenamento: salvo.caminhoRelativo }
}

const contexto = { prestacaoId: 'p1' }

describe('juntarAnexos', () => {
  it('sem anexo nenhum, devolve exatamente as folhas de entrada', async () => {
    // O teste que impede esta mudanca de vazar para quem nao anexa nada: a
    // prestacao de quem nao usa o recurso continua com as seis folhas de
    // sempre, e nem passa a valer outra contagem.
    const base = await pdfCom(6)

    expect(await paginasDe(await juntarAnexos(base, [], contexto))).toBe(6)
  })

  it('acrescenta as paginas dos anexos, na ordem recebida', async () => {
    const base = await pdfCom(6)
    const anexos = [await anexo(1, 'd1'), await anexo(1, 'd2')]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(8)
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
