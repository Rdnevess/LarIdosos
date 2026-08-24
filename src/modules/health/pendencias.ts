import type { Consulta, Exame } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { EXAMES_EM_ABERTO } from './exames.service'

/**
 * O que está em aberto, de **todos** os residentes.
 *
 * A spec chama a tela de exames pendentes de razão de ser do módulo: exame
 * solicitado e esquecido é o problema real em ILPI. E esquecer acontece
 * **entre** residentes — ninguém percebe abrindo trinta fichas uma a uma —,
 * então esta leitura é institucional, não por residente.
 *
 * Consulta esquecida é o mesmo problema e ganharia uma segunda tela quase
 * idêntica; duas telas quase idênticas são duas telas que ninguém abre.
 */

type ResidenteResumido = {
  id: string
  nomeCompleto: string
  nomeSocial: string | null
}

export type Pendencias = {
  exames: (Exame & { residente: ResidenteResumido })[]
  consultas: (Consulta & { residente: ResidenteResumido })[]
}

// Traz o nome junto, numa consulta só. Sem isto seria N+1 numa tela que a
// equipe abre todo dia.
const RESIDENTE = {
  select: { id: true, nomeCompleto: true, nomeSocial: true },
} as const

export async function listarPendencias(ctx: Ctx): Promise<Pendencias> {
  exigirPapel(ctx, 'Exame', 'COORDENACAO', 'SAUDE')

  const [exames, consultas] = await Promise.all([
    prisma.exame.findMany({
      where: { status: { in: EXAMES_EM_ABERTO } },
      include: { residente: RESIDENTE },
      // A mais antiga primeiro, porque a mais antiga é a mais esquecida.
      // `nulls: 'last'`: exame sem data de solicitação não tem idade a
      // comparar, e pô-lo no topo empurraria para baixo o que de fato espera
      // há meses.
      orderBy: [{ dataSolicitacao: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    }),
    prisma.consulta.findMany({
      where: { status: 'AGENDADA' },
      include: { residente: RESIDENTE },
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
    }),
  ])

  return { exames, consultas }
}
