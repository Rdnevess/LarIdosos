'use client'

import { useActionState } from 'react'
import type { TipoDocumento } from '@prisma/client'
import { ROTULO_TIPO_DOCUMENTO } from '@/lib/ptbr'
import { acaoAnexarDocumento } from '@/app/(app)/residentes/acoes'
import { Botao } from '@/components/ui/botao'

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

  // Sem `encType` no `<form>`: quando a `action` é uma função (Server Action),
  // o React já define `multipart/form-data` sozinho, e declará-lo à mão só
  // produz o aviso "Cannot specify a encType or method for a form that
  // specifies a function as the action" no log do servidor a cada render.
  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      <div className="space-y-1">
        <label htmlFor="tipo" className="text-suporte font-medium text-firme">
          Tipo do documento <span className="text-perigo">*</span>
        </label>
        <select id="tipo" name="tipo" required className="w-full rounded border border-borda px-3 py-2 text-corpo">
          {tipos.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ROTULO_TIPO_DOCUMENTO[tipo]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="descricao" className="text-suporte font-medium text-firme">Descrição</label>
        <input id="descricao" name="descricao" className="w-full rounded border border-borda px-3 py-2 text-corpo" />
      </div>

      <div className="space-y-1">
        <label htmlFor="arquivo" className="text-suporte font-medium text-firme">
          Arquivo (PDF, JPG, PNG ou WEBP, até 20 MB) <span className="text-perigo">*</span>
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="w-full rounded border border-borda px-3 py-2 text-corpo"
        />
      </div>

      {estado?.erro && <p role="alert" className="text-suporte text-perigo">{estado.erro}</p>}

      <Botao disabled={enviando}>
        {enviando ? 'Enviando…' : 'Anexar documento'}
      </Botao>
    </form>
  )
}
