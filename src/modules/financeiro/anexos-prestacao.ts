import { PDFDocument } from 'pdf-lib'
import { lerArquivo } from '@/lib/arquivos'

/**
 * O apêndice comprobatório da prestação, colado ao documento gerado.
 *
 * **Existe porque o `pdfkit` não sabe importar página de outro PDF.** Ele
 * desenha do zero, e a API de importação não existe — não é questão de
 * configuração. O `pdf-lib` entra só para isto: o `pdf-prestacao.ts` continua
 * produzindo as seis folhas exatamente como antes, e este módulo concatena.
 *
 * **Nada é carimbado, nada é redimensionado.** O documento que a instituição
 * anexou chega ao órgão como foi enviado, sem marca do sistema em cima. Foi
 * decisão explícita, e o preço está registrado na §2 da spec: a página não diz
 * de quem ela é. Quem cobre esse vão é a contagem de cobertura na tela, antes
 * de fechar.
 */

export type AnexoParaJuntar = {
  documentoId: string
  caminhoArmazenamento: string
}

/**
 * Junta os anexos ao documento, **na ordem recebida**, pulando o que não puder
 * ser lido.
 *
 * Pular é a regra, e não o tratamento de um caso raro: gerar a prestação nunca
 * pode falhar por causa de anexo. Vale para o arquivo que sumiu do volume e
 * para o que está lá mas não abre — um PDF corrompido derrubaria a exportação
 * tanto quanto um ausente. O pulo é silencioso na tela e barulhento no log.
 */
export async function juntarAnexos(
  base: Buffer,
  anexos: AnexoParaJuntar[],
  contexto: { prestacaoId: string }
): Promise<Buffer> {
  if (anexos.length === 0) return base

  const final = await PDFDocument.load(base)

  for (const anexo of anexos) {
    // O catch cobre o laço inteiro, não só a leitura e o load. Cogitou-se
    // estreitá-lo às duas primeiras operações e deixar copyPages/addPage de
    // fora, para que um bug de programação ali estourasse em vez de virar
    // console.warn. Ficou largo por decisão: um PDF que carrega mas falha ao
    // copiar página ainda é um defeito do arquivo, não do código que o lê, e
    // um arquivo malformado o bastante para passar no cabeçalho mas empacar
    // na cópia de páginas é exatamente o tipo de anexo ruim que este módulo
    // existe para pular. Estreitar o catch reabriria o modo de falha que a
    // regra da spec proíbe: a prestação caindo por causa de um anexo. O
    // preço fica registrado aqui, para não ser esquecido: um defeito de
    // programação dentro do laço — um erro de digitação, um uso errado da
    // API do pdf-lib — também sai silencioso, como console.warn.
    try {
      const bytes = await lerArquivo(anexo.caminhoArmazenamento)
      const origem = await PDFDocument.load(bytes)
      const paginas = await final.copyPages(origem, origem.getPageIndices())
      for (const pagina of paginas) final.addPage(pagina)
    } catch (erro) {
      console.warn('Anexo pulado na prestacao de contas', {
        prestacaoId: contexto.prestacaoId,
        documentoId: anexo.documentoId,
        erro,
      })
    }
  }

  return Buffer.from(await final.save())
}
