'use client'

import { useActionState } from 'react'
import { Botao } from '@/components/ui/botao'
import {
  acaoAnexarComprovante,
  acaoRemoverComprovante,
} from '@/app/(app)/financeiro/acoes'

/**
 * O anexo comprobatório do financeiro, nos três lugares em que ele aparece.
 *
 * Arquivo próprio e `'use client'` pelo mesmo motivo do
 * `formulario-documento.tsx`: `<input type="file">` e `multipart/form-data` não
 * cabem no `Campo`, e a diretiva vale para o arquivo inteiro.
 *
 * `accept="application/pdf"` filtra o seletor do sistema operacional, e é
 * conveniência e não autorização: quem forjar o `multipart` é recusado por
 * `anexarComprovante`, que confere o `mimeType` antes de gravar byte nenhum.
 */
export function FormularioAnexoFinanceiro({
  alvo,
  rotulo,
  anexado,
}: {
  alvo: { tipo: string; id: string }
  rotulo: string
  anexado: { id: string; nome: string } | null
}) {
  const [estadoAnexo, anexar, anexando] = useActionState(acaoAnexarComprovante, null)
  const [estadoRemocao, remover, removendo] = useActionState(acaoRemoverComprovante, null)
  const idCampo = `anexo-${alvo.tipo}-${alvo.id}`

  if (anexado) {
    return (
      <form action={remover} className="flex flex-wrap items-baseline gap-2 text-suporte">
        <input type="hidden" name="alvoTipo" value={alvo.tipo} />
        <input type="hidden" name="alvoId" value={alvo.id} />
        <span className="text-apoio">{rotulo}:</span>
        <a href={`/api/documentos/${anexado.id}`} className="underline text-medio">
          {anexado.nome}
        </a>
        <Botao variante="secundario" disabled={removendo}>
          {removendo ? 'Removendo…' : 'Remover'}
        </Botao>
        {estadoRemocao?.erro && (
          <p role="alert" className="text-perigo">{estadoRemocao.erro}</p>
        )}
      </form>
    )
  }

  return (
    <form action={anexar} className="flex flex-wrap items-baseline gap-2 text-suporte">
      <input type="hidden" name="alvoTipo" value={alvo.tipo} />
      <input type="hidden" name="alvoId" value={alvo.id} />
      <label htmlFor={idCampo} className="text-apoio">{rotulo} (PDF):</label>
      <input
        id={idCampo}
        name="arquivo"
        type="file"
        required
        accept="application/pdf"
        className="rounded border border-borda px-3 py-2 text-corpo"
      />
      <Botao variante="secundario" disabled={anexando}>
        {anexando ? 'Enviando…' : 'Anexar'}
      </Botao>
      {estadoAnexo?.erro && <p role="alert" className="text-perigo">{estadoAnexo.erro}</p>}
    </form>
  )
}
