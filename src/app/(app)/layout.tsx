import { MenuPrincipal } from '@/components/menu-principal'
import { redirect } from 'next/navigation'
import type { Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { BotaoTema } from '@/components/botao-tema'
import { Botao } from '@/components/ui/botao'
import { type NomeIcone } from '@/components/icones'

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
      {/* O filete dourado. É o primeiro e, por ora, o único uso de
          `--cor-detalhe`: a §3 do design deixa o dourado entrar como filete e
          como anel da marca, e mais nada — nunca texto, botão, etiqueta ou
          fundo de aviso. O anel espera os vetores da marca; o filete não
          esperava nada.

          Um pixel, e não dois: o dourado sobre o neutro quente já é mudança de
          matiz, não só de valor, e a essa espessura ele assina sem gritar numa
          tela que a equipe olha o dia inteiro. */}
      <header className="border-b border-detalhe bg-superficie">
        {/* Grade de três colunas, e não `justify-between`: com este último o
            nome ficaria no meio do espaço que sobra, e sairia do centro toda
            vez que os controles da direita mudassem de largura — o botão de
            tema alterna entre "Escuro" e "Claro". A coluna da esquerda existe
            vazia, só para equilibrar a da direita.

            No celular a grade some e vira uma coluna: nome numa linha, ainda
            centrado, controles na de baixo. Não é preferência — o nome mais os
            controles mais o vão que os equilibraria não cabem em 390px, e
            insistir na linha única empurraria o nome para fora do centro. */}
        <div className="mx-auto grid max-w-5xl gap-2 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
          <span className="text-center font-semibold text-forte sm:col-start-2">Lar Dona Francisca</span>
          {/* Uma colocação só cobre todas as telas autenticadas, e ainda o
              `error.tsx` e o `not-found.tsx`, que renderizam dentro deste
              layout. */}
          <div className="flex items-center justify-end gap-2 sm:col-start-3">
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
        <MenuPrincipal itens={itens} />
      </header>
      <main className="mx-auto max-w-5xl p-3">{children}</main>
    </div>
  )
}
