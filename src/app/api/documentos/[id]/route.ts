import { NextResponse } from 'next/server'
import { obterCtx } from '@/modules/auth/sessao'
import { obterDocumentoParaDownload } from '@/modules/residents/documentos.service'
import { ErroNaoEncontrado, ErroPermissao } from '@/lib/erros'

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
        'Content-Disposition': `inline; filename="${encodeURIComponent(documento.nomeArquivoOriginal)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (erro) {
    if (erro instanceof ErroPermissao) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
    }
    if (erro instanceof ErroNaoEncontrado) {
      return NextResponse.json({ erro: 'Documento não encontrado' }, { status: 404 })
    }
    throw erro
  }
}
