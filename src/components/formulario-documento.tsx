'use client'

import { useActionState } from 'react'
import { acaoAnexarDocumento } from '@/app/(app)/residentes/acoes'

/**
 * Fica em arquivo próprio, e não junto dos demais formulários da ficha, porque
 * `'use client'` vale para o arquivo inteiro: o anexo precisa de
 * `multipart/form-data` e de um `<input type="file">`, que o `Campo` não cobre,
 * enquanto os outros três formulários são componentes de servidor.
 */
export function FormularioDocumento({ residenteId }: { residenteId: string }) {
  const [estado, enviar, enviando] = useActionState(acaoAnexarDocumento, null)

  return (
    <form action={enviar} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      <div className="space-y-1">
        <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
          Tipo do documento <span className="text-red-600">*</span>
        </label>
        <select id="tipo" name="tipo" required className="w-full rounded border border-slate-300 px-3 py-2 text-base">
          <option value="RG">RG</option>
          <option value="CPF">CPF</option>
          <option value="CNS">Cartão SUS</option>
          <option value="CERTIDAO">Certidão</option>
          <option value="PROCURACAO">Procuração</option>
          <option value="TERMO_RESPONSABILIDADE">Termo de responsabilidade</option>
          <option value="TERMO_LGPD">Termo de ciência (LGPD)</option>
          <option value="FOTO">Foto</option>
          <option value="OUTRO">Outro</option>
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
