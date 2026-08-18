import type { NextAuthConfig } from 'next-auth'

const DOZE_HORAS = 60 * 60 * 12

/**
 * Configuração compatível com o runtime Edge, usada pelo middleware.
 *
 * Não inclui o provider de credenciais: `authorize` depende de
 * `verificarSenha` (bindings nativos do Argon2), que o bundler não
 * consegue resolver para o runtime Edge do middleware. O middleware só
 * precisa decodificar o JWT da sessão — não autentica ninguém — então a
 * ausência de providers aqui não muda o comportamento observável.
 */
export const authConfig = {
  session: { strategy: 'jwt', maxAge: DOZE_HORAS },
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.usuarioId = user.id
        token.emitidoEm = Math.floor(Date.now() / 1000)
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.usuarioId
      session.emitidoEm = token.emitidoEm
      return session
    },
  },
} satisfies NextAuthConfig
