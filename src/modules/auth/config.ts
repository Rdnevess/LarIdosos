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
      async authorize(credenciais) {
        const email = String(credenciais?.email ?? '').trim().toLowerCase()
        const senha = String(credenciais?.senha ?? '')
        if (!email || !senha) return null

        const usuario = await prisma.usuario.findUnique({ where: { email } })
        const ctxFalha = { usuarioId: 'anonimo', email, papel: 'SAUDE' as const }

        if (!usuario || !usuario.ativo) {
          await registrarAuditoria(prisma, ctxFalha, {
            acao: 'LOGIN_FALHA',
            entidade: 'Usuario',
          })
          return null
        }

        if (!(await verificarSenha(usuario.senhaHash, senha))) {
          await registrarAuditoria(prisma, { ...ctxFalha, usuarioId: usuario.id }, {
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

        await registrarAuditoria(
          prisma,
          { usuarioId: usuario.id, email: usuario.email, papel: usuario.papel },
          { acao: 'LOGIN', entidade: 'Usuario', entidadeId: usuario.id }
        )

        return { id: usuario.id, email: usuario.email, name: usuario.nome }
      },
    }),
  ],
})
