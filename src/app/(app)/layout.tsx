import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Papel } from '@prisma/client'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'

const ITENS: { href: string; rotulo: string; papeis: Papel[] }[] = [
  { href: '/residentes', rotulo: 'Residentes', papeis: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
  { href: '/funcionarios', rotulo: 'Funcionários', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
  { href: '/usuarios', rotulo: 'Usuários', papeis: ['COORDENACAO'] },
  { href: '/auditoria', rotulo: 'Auditoria', papeis: ['COORDENACAO'] },
]

export default async function LayoutAutenticado({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await obterCtxOuNulo()
  if (!ctx) redirect('/login')

  // A navegação é montada a partir do papel, mas isso é conveniência: quem
  // barra o acesso é o serviço. Digitar /usuarios na barra de endereço com
  // papel de saúde falha no serviço, não só no menu.
  const itens = ITENS.filter((item) => item.papeis.includes(ctx.papel))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-3">
          <span className="font-semibold text-slate-800">Lar de Idosos</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="text-sm text-slate-600 underline">
              Sair
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-3">{children}</main>
    </div>
  )
}
