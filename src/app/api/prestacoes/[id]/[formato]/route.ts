import { NextResponse } from 'next/server'
import { obterCtx } from '@/modules/auth/sessao'
import { exportarPrestacao, type FormatoExportacao } from '@/modules/financeiro/exportar'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'

const FORMATOS: FormatoExportacao[] = ['pdf', 'csv']

/**
 * O download da prestação pronta.
 *
 * `attachment`, e não `inline` como a rota de documentos: a prestação é para
 * salvar e protocolar, não para espiar no navegador. O nome do arquivo já vem
 * saneado do serviço, mas o cabeçalho segue a RFC 6266 do mesmo jeito.
 */
export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string; formato: string }> }
) {
  const { id, formato } = await params

  if (!FORMATOS.includes(formato as FormatoExportacao)) {
    return NextResponse.json({ erro: 'Formato não suportado' }, { status: 404 })
  }

  try {
    const ctx = await obterCtx()
    const { buffer, nomeArquivo, mimeType } = await exportarPrestacao(
      ctx,
      id,
      formato as FormatoExportacao
    )

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (erro) {
    // 404 também para permissão negada, pelo mesmo motivo da rota de
    // documentos: distinguir "não existe" de "não é para você" entregaria, num
    // código de status, que aquela prestação existe. A tentativa negada fica
    // registrada como `ACESSO_NEGADO` pelo `exigirPapel`.
    if (erro instanceof ErroPermissao || erro instanceof ErroNaoEncontrado) {
      return NextResponse.json({ erro: 'Prestação de contas não encontrada' }, { status: 404 })
    }
    // Falta a configuração da instituição, tipicamente. É erro de quem pede, e
    // a mensagem diz o que fazer.
    if (erro instanceof ErroValidacao) {
      return NextResponse.json({ erro: erro.message }, { status: 400 })
    }
    console.error('Falha ao exportar prestação de contas', { id, formato, erro })
    return NextResponse.json({ erro: 'Não foi possível gerar o documento' }, { status: 500 })
  }
}
