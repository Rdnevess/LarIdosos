'use client'

import { useActionState } from 'react'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'

export function FormularioSimples({
  acao,
  campos,
  rotuloBotao,
  ocultos = {},
  colunas = 2,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  campos: PropsCampo[]
  rotuloBotao: string
  ocultos?: Record<string, string>
  colunas?: 1 | 2
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)

  return (
    <form action={enviar} className="space-y-4">
      {Object.entries(ocultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}

      <div className={colunas === 2 ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>
        {campos.map((campo) => (
          <Campo key={campo.nome} {...campo} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      {estado?.sucesso && (
        <p role="status" className="text-sm text-green-700">
          Registro salvo.
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60 sm:w-auto"
      >
        {enviando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}
