import type { AcaoAuditoria, Prisma, PrismaClient } from '@prisma/client'
import type { Ctx } from '@/lib/contexto'

export type ClientePrisma = PrismaClient | Prisma.TransactionClient

export type Diff = Record<string, { de: unknown; para: unknown }>

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
  ctx: Ctx,
  dados: DadosAuditoria
): Promise<void> {
  await cliente.logAuditoria.create({
    data: {
      usuarioId: ctx.usuarioId,
      usuarioEmail: ctx.email,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      residenteId: dados.residenteId,
      diff: (dados.diff ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  })
}
