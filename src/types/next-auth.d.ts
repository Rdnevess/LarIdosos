import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: { id: string } & DefaultSession['user']
    emitidoEm: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    usuarioId: string
    emitidoEm: number
  }
}

// Nesta versão beta, os tipos de callback internos de `next-auth`
// (`AuthConfig["callbacks"]`) importam `JWT` de `@auth/core/jwt`
// diretamente — não do barrel `next-auth/jwt` reexportado acima. Sem esta
// segunda augmentação, `token.usuarioId`/`token.emitidoEm` dentro dos
// callbacks `jwt`/`session` tipam como `unknown` (o índice de
// `Record<string, unknown>` de que `JWT` herda) e `tsc --noEmit` falha,
// mesmo com o comportamento em runtime correto.
declare module '@auth/core/jwt' {
  interface JWT {
    usuarioId: string
    emitidoEm: number
  }
}
