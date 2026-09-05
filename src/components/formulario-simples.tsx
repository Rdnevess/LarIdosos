'use client'

import { useActionState } from 'react'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'
import { Botao } from '@/components/ui/botao'
import { useHidratado } from '@/lib/hidratacao'

export function FormularioSimples({
  acao,
  campos,
  rotuloBotao,
  ocultos = {},
  colunas = 2,
  prefixoId,
  aviso,
  variante,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  campos: PropsCampo[]
  rotuloBotao: string
  ocultos?: Record<string, string>
  colunas?: 1 | 2
  /** Repassado a cada `Campo`; obrigatório quando a página renderiza o mesmo
   *  formulário em laço, para os `id` não colidirem. Ver `campo.tsx`. */
  prefixoId?: string
  /** Aviso exibido antes dos campos, para consequência que o usuário não tem
   *  como adivinhar olhando o formulário. */
  aviso?: string
  /** Repassado ao `Botao`. Sem valor, ele decide sozinho (`primario`) — é o
   *  que preserva o comportamento de todo formulário que não é destrutivo. */
  variante?: 'primario' | 'secundario' | 'perigo'
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)
  const hidratado = useHidratado()

  return (
    <form action={enviar} className="space-y-4" data-hidratado={hidratado}>
      {Object.entries(ocultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}

      {aviso && (
        <p className="rounded border border-alerta-borda bg-alerta-fundo p-2 text-suporte text-alerta">
          {aviso}
        </p>
      )}

      <div className={colunas === 2 ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>
        {campos.map((campo) => (
          <Campo key={campo.nome} {...campo} prefixoId={prefixoId} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-suporte text-perigo">
          {estado.erro}
        </p>
      )}

      {estado?.sucesso && (
        <p role="status" className="text-suporte text-sucesso">
          {estado.mensagem ?? 'Registro salvo.'}
        </p>
      )}

      <Botao variante={variante} disabled={enviando} className="w-full sm:w-auto">
        {enviando ? 'Salvando…' : rotuloBotao}
      </Botao>
    </form>
  )
}
