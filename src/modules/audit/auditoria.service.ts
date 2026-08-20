import { Prisma } from '@prisma/client'
import type { AcaoAuditoria, PrismaClient } from '@prisma/client'

export type ClientePrisma = PrismaClient | Prisma.TransactionClient

export type Diff = Record<string, { de: unknown; para: unknown }>

/**
 * O ator de um evento de auditoria. `Ctx` (usuário autenticado e autorizado)
 * satisfaz esta forma estruturalmente, mas o login em si precisa registrar
 * eventos antes de existir um `Ctx` completo — por exemplo, uma tentativa
 * falha para um e-mail que não existe no sistema não tem `usuarioId` real.
 */
export type AtorAuditoria = {
  usuarioId: string | null
  email: string
  ip?: string
  userAgent?: string
}

export type DadosAuditoria = {
  acao: AcaoAuditoria
  entidade: string
  entidadeId?: string
  residenteId?: string
  diff?: Diff | null
}

/**
 * Põe os dois lados da comparação na mesma forma antes do `JSON.stringify`.
 * Sem isto, valores iguais divergem por causa de como cada lado chegou aqui:
 * o "antes" vem do Prisma, o "depois" vem do formulário.
 *
 * - **`Date` pelo dia civil em UTC.** O Postgres devolve um campo `@db.Date`
 *   como meia-noite UTC; a tela monta `new Date('aaaa-mm-ddT12:00:00')`, que
 *   é meio-dia no fuso do processo. Mesmo dia, carimbos diferentes — e o
 *   `toISOString()` completo os fazia divergir sempre. Todo campo de data que
 *   entra num diff hoje é `@db.Date` no `prisma/schema.prisma`
 *   (`dataNascimento`, `dataAdmissao`, `dataSaida`, `conselhoValidade`), e a
 *   tela já os exibe em UTC (`formatarData`, em `src/lib/ptbr.ts`, fixa
 *   `timeZone: 'UTC'`). Se um dia um campo `DateTime` com hora significativa
 *   entrar num diff, esta comparação passará a ignorar mudança de hora — é a
 *   contrapartida assumida.
 * - **`Decimal` para número.** `JSON.stringify` de um `Prisma.Decimal` devolve
 *   `"1200"` (string, via `toJSON`) e de um número devolve `1200`. Sem a
 *   conversão, `beneficioValor` aparecia como alterado a cada gravação.
 */
function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (valor instanceof Prisma.Decimal) return valor.toNumber()
  if (valor === undefined) return null
  return valor
}

export function calcularDiff(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): Diff | null {
  const diff: Diff = {}

  for (const chave of Object.keys(depois)) {
    // Chave presente com `undefined` é tratada como chave ausente, porque é
    // isso que a gravação faz: o Prisma ignora `undefined` em `data` e não
    // toca no campo. Registrar "de: X → para: —" descreveria uma alteração
    // que não aconteceu. Os conversores de `FormData` já omitem essas chaves
    // (ver `semIndefinidos`, em `src/lib/formulario.ts`); esta guarda cobre
    // qualquer outro chamador.
    if (depois[chave] === undefined) continue

    const de = normalizar(antes[chave])
    const para = normalizar(depois[chave])
    if (JSON.stringify(de) !== JSON.stringify(para)) {
      diff[chave] = { de: antes[chave] ?? null, para: depois[chave] ?? null }
    }
  }

  return Object.keys(diff).length > 0 ? diff : null
}

export async function registrarAuditoria(
  cliente: ClientePrisma,
  ator: AtorAuditoria,
  dados: DadosAuditoria
): Promise<void> {
  await cliente.logAuditoria.create({
    data: {
      usuarioId: ator.usuarioId,
      usuarioEmail: ator.email,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      residenteId: dados.residenteId,
      diff: (dados.diff ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: ator.ip,
      userAgent: ator.userAgent,
    },
  })
}
