'use client'

import { useActionState } from 'react'
import type { TipoDocumento } from '@prisma/client'
import { ROTULO_TIPO_DOCUMENTO } from '@/lib/ptbr'
import { acaoAnexarDocumento } from '@/app/(app)/residentes/acoes'

/**
 * Fica em arquivo próprio, e não junto dos demais formulários da ficha, porque
 * `'use client'` vale para o arquivo inteiro: o anexo precisa de
 * `multipart/form-data` e de um `<input type="file">`, que o `Campo` não cobre,
 * enquanto os outros três formulários são componentes de servidor.
 *
 * `tipos` chega pronto de quem renderiza — a ficha o obtém de
 * `tiposQuePodeAnexar` (`src/modules/residents/documentos.service.ts`), que o
 * deriva de `papeisQuePodemVer`. Antes, este arquivo trazia a lista escrita à
 * mão e omitia LAUDO, EXAME e COMPROVANTE_FISCAL de todo mundo, inclusive de
 * quem tinha permissão de anexá-los. Não é este componente que autoriza nada:
 * `anexarDocumento` chama `exigirPapel` com os papéis do tipo escolhido, e
 * recusa mesmo que um valor fora da lista seja forjado no formulário.
 */
export function FormularioDocumento({
  residenteId,
  tipos,
}: {
  residenteId: string
  tipos: TipoDocumento[]
}) {
  const [estado, enviar, enviando] = useActionState(acaoAnexarDocumento, null)

  return (
    <form action={enviar} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      <div className="space-y-1">
        <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
          Tipo do documento <span className="text-red-600">*</span>
        </label>
        <select id="tipo" name="tipo" required className="w-full rounded border border-slate-300 px-3 py-2 text-base">
          {tipos.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ROTULO_TIPO_DOCUMENTO[tipo]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="descricao" className="text-sm font-medium text-slate-700">Descrição</label>
        <input id="descricao" name="descricao" className="w-full rounded border border-slate-300 px-3 py-2 text-base" />
      </div>

      <div className="space-y-1">
        <label htmlFor="arquivo" className="text-sm font-medium text-slate-700">
          Arquivo (PDF, JPG, PNG ou WEBP, até 20 MB) <span className="text-red-600">*</span>
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </div>

      {estado?.erro && <p role="alert" className="text-sm text-red-600">{estado.erro}</p>}

      <button type="submit" disabled={enviando} className="rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Anexar documento'}
      </button>
    </form>
  )
}
