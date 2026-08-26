'use client'

import { useActionState } from 'react'
import { BotaoTema } from '@/components/botao-tema'
import { Botao } from '@/components/ui/botao'
import { entrar } from './acoes'

export function FormularioLogin({ destino }: { destino: string }) {
  const [erro, acao, enviando] = useActionState(entrar, null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <form action={acao} className="w-full max-w-sm space-y-4 rounded-lg bg-superficie p-6 shadow">
        {/* A única rota fora do grupo `(app)`, e por isso a única que precisa
            do botão por conta própria. É também a tela onde o tema escuro pela
            metade doía mais: o texto digitado sumia no campo. */}
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-forte">Lar Dona Francisca</h1>
          <BotaoTema />
        </div>
        <p className="text-sm text-apoio">Entre com suas credenciais</p>

        {/* Viaja no formulário, e não na URL do POST: a Server Action recebe
            `FormData`, e é lá que `entrar` o lê — depois de `destinoSeguro`
            já ter aprovado o valor no servidor. */}
        <input type="hidden" name="destino" value={destino} />

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-firme">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="w-full rounded border border-borda px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="senha" className="text-sm font-medium text-firme">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border border-borda px-3 py-2"
          />
        </div>

        {erro && <p role="alert" className="text-sm text-perigo">{erro}</p>}

        <Botao disabled={enviando} className="w-full">
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>
    </main>
  )
}
