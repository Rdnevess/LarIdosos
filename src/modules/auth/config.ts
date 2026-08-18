import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { verificarSenha } from '@/lib/senha'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { authConfig } from './auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      async authorize(credenciais, requisicao) {
        const email = String(credenciais?.email ?? '').trim().toLowerCase()
        const senha = String(credenciais?.senha ?? '')
        if (!email || !senha) return null

        const cabecalhos = requisicao?.headers
        const ip = cabecalhos?.get('x-forwarded-for')?.split(',')[0]?.trim()
        const userAgent = cabecalhos?.get('user-agent') ?? undefined

        const usuario = await prisma.usuario.findUnique({ where: { email } })

        // O ator carrega o id real quando o usuário existe — inclusive quando a
        // conta está desativada, que é o evento forense mais relevante aqui.
        // Só um e-mail inexistente grava `null`.
        const ator = { usuarioId: usuario?.id ?? null, email, ip, userAgent }

        if (!usuario || !usuario.ativo) {
          await registrarAuditoria(prisma, ator, {
            acao: 'LOGIN_FALHA',
            entidade: 'Usuario',
            entidadeId: usuario?.id,
          })
          return null
        }

        if (!(await verificarSenha(usuario.senhaHash, senha))) {
          await registrarAuditoria(prisma, ator, {
            acao: 'LOGIN_FALHA',
            entidade: 'Usuario',
            entidadeId: usuario.id,
          })
          return null
        }

        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcessoEm: new Date() },
        })

        await registrarAuditoria(prisma, ator, {
          acao: 'LOGIN',
          entidade: 'Usuario',
          entidadeId: usuario.id,
        })

        return { id: usuario.id, email: usuario.email, name: usuario.nome }
      },
    }),
  ],
})
