import type { Papel } from '@prisma/client'
import { ErroPermissao } from './erros'
import { dispararRegistroDeAcessoNegado } from '@/modules/audit/acesso-negado'
import type { EntidadeAuditada } from '@/modules/audit/auditoria.service'

export type Ctx = {
  usuarioId: string
  email: string
  papel: Papel
  ip?: string
  userAgent?: string
}

/**
 * `entidade` não é decoração: é o que a trilha registra quando a checagem
 * falha. Sem ela, toda negação ficaria indistinguível na tela de auditoria, e
 * "tentou abrir a ficha clínica de um residente" pesa diferente de "tentou
 * abrir a lista de usuários".
 *
 * Vem antes dos papéis, e tipada como `EntidadeAuditada` em vez de `string`,
 * porque um `Papel` não é atribuível a ela: quem esquecer o argumento novo
 * quebra o build, em vez de trocar em silêncio quais papéis a operação aceita.
 *
 * O registro é disparado sem `await` — esta função continua síncrona de
 * propósito. Ver `dispararRegistroDeAcessoNegado`.
 */
export function exigirPapel(
  ctx: Ctx,
  entidade: EntidadeAuditada,
  ...papeis: Papel[]
): void {
  if (!papeis.includes(ctx.papel)) {
    dispararRegistroDeAcessoNegado(ctx, entidade)
    throw new ErroPermissao()
  }
}
