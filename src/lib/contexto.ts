import type { Papel } from '@prisma/client'
import { ErroPermissao } from './erros'

export type Ctx = {
  usuarioId: string
  email: string
  papel: Papel
  ip?: string
  userAgent?: string
}

export function exigirPapel(ctx: Ctx, ...papeis: Papel[]): void {
  if (!papeis.includes(ctx.papel)) {
    throw new ErroPermissao()
  }
}
