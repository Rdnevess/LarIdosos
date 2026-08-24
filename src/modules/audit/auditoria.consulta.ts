import type { LogAuditoria, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'

const POR_PAGINA = 50

export type FiltroAuditoria = {
  usuarioId?: string
  entidade?: string
  residenteId?: string
  de?: Date
  ate?: Date
  pagina?: number
}

export type ResultadoAuditoria = {
  registros: LogAuditoria[]
  total: number
  paginas: number
}

/**
 * Consulta a trilha de auditoria — restrita à coordenação (LGPD: prontuário é
 * dado sensível; a trilha também atende prestação de contas do convênio).
 *
 * Esta consulta não gera, ela própria, um novo registro de auditoria: fazer
 * isso produziria crescimento sem informação nova, já que o acesso a esta
 * tela já é restrito a um único papel (COORDENACAO). Não é um esquecimento.
 */
export async function consultarAuditoria(
  ctx: Ctx,
  filtro: FiltroAuditoria
): Promise<ResultadoAuditoria> {
  exigirPapel(ctx, 'LogAuditoria', 'COORDENACAO')

  const where: Prisma.LogAuditoriaWhereInput = {}
  if (filtro.usuarioId) where.usuarioId = filtro.usuarioId
  if (filtro.entidade) where.entidade = filtro.entidade
  if (filtro.residenteId) where.residenteId = filtro.residenteId
  if (filtro.de || filtro.ate) {
    where.criadoEm = { gte: filtro.de, lte: filtro.ate }
  }

  const pagina = Math.max(1, filtro.pagina ?? 1)

  const [registros, total] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      // Desempata por `id` de propósito: `criadoEm` sozinho não distingue
      // dois registros gravados no mesmo milissegundo, e uma ordenação
      // instável sob `skip`/`take` pode devolvê-los em ordem diferente a
      // cada consulta — um mesmo registro apareceria em duas páginas
      // enquanto outro nunca apareceria em nenhuma. Numa trilha de
      // auditoria, sumir da paginação é indistinguível de nunca ter existido.
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.logAuditoria.count({ where }),
  ])

  return { registros, total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) }
}
