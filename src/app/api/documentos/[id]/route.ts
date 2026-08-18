import { NextResponse } from 'next/server'
import { obterCtx } from '@/modules/auth/sessao'
import { obterDocumentoParaDownload } from '@/modules/residents/documentos.service'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'

/**
 * Monta o `Content-Disposition` conforme a RFC 6266: um `filename` em ASCII
 * puro para clientes antigos e um `filename*` em UTF-8 para os demais.
 * `encodeURIComponent` sozinho no `filename` entregaria "laudo médico.pdf"
 * como "laudo%20m%C3%A9dico.pdf" — e num sistema em português isso seria
 * quase todo download.
 */
function cabecalhoNomeArquivo(nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const ctx = await obterCtx()
    const { documento, conteudo } = await obterDocumentoParaDownload(ctx, id)

    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        'Content-Type': documento.mimeType,
        'Content-Disposition': cabecalhoNomeArquivo(documento.nomeArquivoOriginal),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (erro) {
    // 404 também para permissão negada. `listarDocumentos` filtra em vez de
    // recusar justamente para não revelar que existe um exame ali; devolver 403
    // aqui entregaria essa mesma existência de volta, num código de status. Quem
    // não pode ver não distingue "não existe" de "não é para você" — e a
    // tentativa fica registrada na auditoria de qualquer forma.
    if (erro instanceof ErroPermissao || erro instanceof ErroNaoEncontrado) {
      return NextResponse.json({ erro: 'Documento não encontrado' }, { status: 404 })
    }
    if (erro instanceof ErroValidacao) {
      return NextResponse.json({ erro: erro.message }, { status: 400 })
    }
    console.error('Falha ao servir documento', { id, erro })
    return NextResponse.json({ erro: 'Não foi possível abrir o documento' }, { status: 500 })
  }
}
