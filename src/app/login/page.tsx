'use client'

import { useActionState } from 'react'
import { entrar } from './acoes'

export default function PaginaLogin() {
  const [erro, acao, enviando] = useActionState(entrar, null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form action={acao} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Lar de Idosos</h1>
        <p className="text-sm text-slate-500">Entre com suas credenciais</p>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="senha" className="text-sm font-medium text-slate-700">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-slate-800 py-2 text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
