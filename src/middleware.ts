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

  // Deliberadamente NÃO redirecionamos quem tem cookie para fora de /login.
  // O middleware só enxerga o JWT; ele não sabe se a conta foi desativada ou se
  // a senha mudou — quem sabe é `obterCtx`, que consulta o banco. Redirecionar
  // aqui prenderia o usuário de sessão revogada num ciclo: toda página real
  // recusaria o acesso, e /login o mandaria de volta para elas. Quem decide se
  // já está autenticado é a própria página de login, com `obterCtxOuNulo`.
})

export const config = {
  // `api/health` fora do matcher: quem o consulta é o Docker, que não faz
  // login. Dentro dele, o healthcheck receberia o 307 para /login e o
  // contêiner nunca ficaria saudável.
  matcher: ['/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)'],
}
