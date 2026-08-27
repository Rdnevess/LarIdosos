'use client'

import { useActionState } from 'react'
import {
  acaoDefinirFaixas,
  type EstadoFaixas,
} from '@/app/(app)/residentes/[id]/faixas/acoes'
import { Botao } from '@/components/ui/botao'

export type LinhaDeFaixa = {
  medida: string
  rotulo: string
  sistema: { minimo: number | null; maximo: number | null }
  minimo: number | null
  maximo: number | null
}

/**
 * O formulário das faixas de um residente.
 *
 * Campo vazio quer dizer "use a do sistema", e o `placeholder` mostra qual é —
 * quem ajusta precisa saber de onde está partindo, ou o número que digitar é
 * chute.
 */
export function FormularioFaixas({
  residenteId,
  linhas,
}: {
  residenteId: string
  linhas: LinhaDeFaixa[]
}) {
  const [estado, acao] = useActionState<EstadoFaixas, FormData>(acaoDefinirFaixas, {})

  return (
    <form action={acao} className="cartao space-y-3 p-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-legenda text-apoio">
        <span>Medida</span>
        <span className="w-24 text-center">Mínimo</span>
        <span className="w-24 text-center">Máximo</span>
      </div>

      {linhas.map((linha) => (
        <div
          key={linha.medida}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-2"
        >
          <span className="text-suporte text-firme">{linha.rotulo}</span>
          <input
            name={`${linha.medida}_minimo`}
            defaultValue={linha.minimo ?? ''}
            placeholder={String(linha.sistema.minimo ?? '—')}
            aria-label={`${linha.rotulo} — mínimo`}
            className="w-24 rounded border border-borda px-3 py-2 text-corpo"
          />
          <input
            name={`${linha.medida}_maximo`}
            defaultValue={linha.maximo ?? ''}
            placeholder={String(linha.sistema.maximo ?? '—')}
            aria-label={`${linha.rotulo} — máximo`}
            className="w-24 rounded border border-borda px-3 py-2 text-corpo"
          />
        </div>
      ))}

      {estado.erro && (
        <p role="alert" className="text-suporte text-perigo">
          {estado.erro}
        </p>
      )}
      {estado.salvo && (
        <p role="status" className="text-suporte text-sucesso">
          Registro salvo.
        </p>
      )}

      <Botao>Salvar faixas</Botao>
    </form>
  )
}
