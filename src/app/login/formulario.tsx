'use client'

import { useActionState } from 'react'
import { BotaoTema } from '@/components/botao-tema'
import { entrar } from './acoes'

export function FormularioLogin() {
  const [erro, acao, enviando] = useActionState(entrar, null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <form action={acao} className="w-full max-w-sm space-y-4 rounded-lg bg-superficie p-6 shadow">
        {/* A única rota fora do grupo `(app)`, e por isso a única que precisa
            do botão por conta própria. É também a tela onde o tema escuro pela
            metade doía mais: o texto digitado sumia no campo. */}
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-forte">Lar de Idosos</h1>
          <BotaoTema />
        </div>
        <p className="text-sm text-apoio">Entre com suas credenciais</p>

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

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-acao py-2 text-sobre-acao disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
