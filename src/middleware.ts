import NextAuth from 'next-auth'
import { authConfig } from '@/modules/auth/auth.config'

// O middleware roda em runtime Edge e usa a configuração sem o provider de
// credenciais (ver `auth.config.ts`): importar `@/modules/auth/config`
// diretamente traria `verificarSenha`, cujos bindings nativos do Argon2 o
// bundler Edge não resolve. Isso só decodifica o JWT já emitido — não
// autentica ninguém — então o comportamento de barreira de navegação é o
// mesmo.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const autenticado = Boolean(req.auth?.user)
  const ehLogin = req.nextUrl.pathname === '/login'

  if (!autenticado && !ehLogin) {
    const url = new URL('/login', req.nextUrl)
    url.searchParams.set('proximo', req.nextUrl.pathname)
    return Response.redirect(url)
  }

  if (autenticado && ehLogin) {
    return Response.redirect(new URL('/residentes', req.nextUrl))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
