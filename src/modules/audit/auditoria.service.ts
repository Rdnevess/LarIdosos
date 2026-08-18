import type { AcaoAuditoria, Prisma, PrismaClient } from '@prisma/client'

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

function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString()
  if (valor === undefined) return null
  return valor
}

export function calcularDiff(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): Diff | null {
  const diff: Diff = {}

  for (const chave of Object.keys(depois)) {
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
