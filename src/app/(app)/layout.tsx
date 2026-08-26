import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { BotaoTema } from '@/components/botao-tema'
import { Botao } from '@/components/ui/botao'
import { Icone, type NomeIcone } from '@/components/icones'

const ITENS: { href: string; rotulo: string; icone: NomeIcone; papeis: Papel[] }[] = [
  // Primeiro da lista: e a tela mais usada do sistema pela equipe de cuidado.
  { href: '/turno', rotulo: 'Turno', icone: 'turno', papeis: ['COORDENACAO', 'SAUDE'] },
  { href: '/residentes', rotulo: 'Residentes', icone: 'residente', papeis: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
  // Antes de "Funcionários" de propósito: é tela de rotina diária, e as de
  // rotina ficam no topo.
  { href: '/pendencias', rotulo: 'Pendências', icone: 'alerta', papeis: ['COORDENACAO', 'SAUDE'] },
  { href: '/funcionarios', rotulo: 'Funcionários', icone: 'funcionario', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
  { href: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
  { href: '/usuarios', rotulo: 'Usuários', icone: 'residente', papeis: ['COORDENACAO'] },
  { href: '/auditoria', rotulo: 'Auditoria', icone: 'auditoria', papeis: ['COORDENACAO'] },
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
    <div className="min-h-screen bg-fundo">
      <header className="border-b bg-superficie">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-3">
          <span className="font-semibold text-forte">Lar Dona Francisca</span>
          {/* Uma colocação só cobre todas as telas autenticadas, e ainda o
              `error.tsx` e o `not-found.tsx`, que renderizam dentro deste
              layout. */}
          <div className="flex items-center gap-2">
            <BotaoTema />
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
              <Botao variante="secundario">Sair</Botao>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-11 inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-firme hover:bg-realce"
            >
              {/* O ícone acompanha o rótulo, nunca o substitui: sozinho ele
                  vira adivinhação para quem está de plantão. Sem `rotulo`,
                  ele sai da árvore de acessibilidade — o texto ao lado já
                  diz o que ele significa. */}
              <Icone nome={item.icone} className="size-4" />
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-3">{children}</main>
    </div>
  )
}
