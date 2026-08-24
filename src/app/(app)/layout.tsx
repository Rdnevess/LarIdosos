import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const ITENS: { href: string; rotulo: string; papeis: Papel[] }[] = [
  // Primeiro da lista: e a tela mais usada do sistema pela equipe de cuidado.
  { href: '/turno', rotulo: 'Turno', papeis: ['COORDENACAO', 'SAUDE'] },
  { href: '/residentes', rotulo: 'Residentes', papeis: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
  // Antes de "Funcionários" de propósito: é tela de rotina diária, e as de
  // rotina ficam no topo.
  { href: '/pendencias', rotulo: 'Pendências', papeis: ['COORDENACAO', 'SAUDE'] },
  { href: '/funcionarios', rotulo: 'Funcionários', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
  { href: '/financeiro', rotulo: 'Financeiro', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
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
              // `LOGOUT` existe no enum `AcaoAuditoria` (`prisma/schema.prisma`)
              // e tem rótulo na tela de auditoria
              // (`src/app/(app)/auditoria/page.tsx`, linha 20), e nunca foi
              // gravado: o botão chamava `signOut` direto. A trilha mostrava
              // quando cada pessoa entrou e nunca quando saiu.
              //
              // `obterCtxOuNulo` e não `obterCtx`: uma sessão já revogada
              // (conta desativada, senha trocada noutro dispositivo) ainda
              // mostra este botão, e um erro aqui impediria a pessoa de sair.
              // Sem contexto não há ator para registrar, e sair continua sendo
              // o comportamento certo.
              //
              // Fora de qualquer `try`: `signOut` sinaliza lançando, como o
              // `redirect`. Auditar antes garante que o registro exista mesmo
              // com o redirecionamento em curso.
              const ator = await obterCtxOuNulo()
              if (ator) {
                await registrarAuditoria(prisma, ator, {
                  acao: 'LOGOUT',
                  entidade: 'Usuario',
                  entidadeId: ator.usuarioId,
                })
              }
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
