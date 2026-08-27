import type { Consulta, Exame } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { TAMANHO_PADRAO, totalDePaginas, type Tamanho } from '@/lib/paginacao'
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
  /** Somados, os dois. É o que a paginação fatia. */
  total: number
  paginas: number
  /**
   * Os totais por lista, que o cabeçalho de cada seção mostra. Sem eles a tela
   * diria "Exames em aberto (20)" na página 1 de 47 exames — a contagem da
   * fatia passando por contagem do que existe, que é a leitura errada numa
   * tela cujo propósito é não deixar nada esquecido.
   */
  totalExames: number
  totalConsultas: number
}

// Traz o nome junto, numa consulta só. Sem isto seria N+1 numa tela que a
// equipe abre todo dia.
const RESIDENTE = {
  select: { id: true, nomeCompleto: true, nomeSocial: true },
} as const

const ONDE_EXAMES = { status: { in: EXAMES_EM_ABERTO } } as const
const ONDE_CONSULTAS = { status: 'AGENDADA' } as const

/**
 * **Um limite para a tela inteira, e não um por lista.** As duas listas são
 * tratadas como uma sequência só — exames primeiro, consultas depois — e a
 * página é uma fatia dessa sequência.
 *
 * A consequência é visível e foi escolhida: quando os exames em aberto
 * passarem do tamanho da página, as consultas somem da primeira página. Há
 * teste fixando exatamente isso, para que não seja descoberto como defeito.
 *
 * Sem `pagina`, devolve tudo — que é o que a tela fazia antes de paginar, e é
 * o que os testes das outras regras deste módulo continuam usando.
 */
export async function listarPendencias(
  ctx: Ctx,
  filtro: { pagina?: number; por?: Tamanho } = {}
): Promise<Pendencias> {
  exigirPapel(ctx, 'Exame', 'COORDENACAO', 'SAUDE')

  // A mais antiga primeiro, porque a mais antiga é a mais esquecida.
  // `nulls: 'last'`: exame sem data de solicitação não tem idade a comparar, e
  // pô-lo no topo empurraria para baixo o que de fato espera há meses.
  const ordemExames = [
    { dataSolicitacao: { sort: 'asc', nulls: 'last' } },
    { id: 'asc' },
  ] as const
  const ordemConsultas = [{ dataHora: 'asc' }, { id: 'asc' }] as const

  if (filtro.pagina === undefined) {
    const [exames, consultas] = await Promise.all([
      prisma.exame.findMany({
        where: ONDE_EXAMES,
        include: { residente: RESIDENTE },
        orderBy: [...ordemExames],
      }),
      prisma.consulta.findMany({
        where: ONDE_CONSULTAS,
        include: { residente: RESIDENTE },
        orderBy: [...ordemConsultas],
      }),
    ])
    const total = exames.length + consultas.length
    return {
      exames,
      consultas,
      total,
      paginas: 1,
      totalExames: exames.length,
      totalConsultas: consultas.length,
    }
  }

  const por = filtro.por ?? TAMANHO_PADRAO
  const pagina = Math.max(1, filtro.pagina)
  const deslocamento = (pagina - 1) * por

  // Conta-se antes de fatiar porque é a contagem de exames que diz onde a
  // sequência deixa de ser exame e passa a ser consulta. Sem ela, não há como
  // saber quantas consultas cabem na fatia sem trazer as duas tabelas
  // inteiras — que é justamente o que paginar existe para evitar.
  const [totalExames, totalConsultas] = await Promise.all([
    prisma.exame.count({ where: ONDE_EXAMES }),
    prisma.consulta.count({ where: ONDE_CONSULTAS }),
  ])
  const total = totalExames + totalConsultas

  const cabemDeExames = Math.max(0, Math.min(por, totalExames - deslocamento))
  const [exames, consultas] = await Promise.all([
    cabemDeExames > 0
      ? prisma.exame.findMany({
          where: ONDE_EXAMES,
          include: { residente: RESIDENTE },
          orderBy: [...ordemExames],
          skip: deslocamento,
          take: cabemDeExames,
        })
      : Promise.resolve([]),
    // O deslocamento das consultas é o que sobra depois de passar por todos os
    // exames. Na primeira página em que a fatia atravessa a fronteira, ele é
    // zero — as consultas começam do início.
    prisma.consulta.findMany({
      where: ONDE_CONSULTAS,
      include: { residente: RESIDENTE },
      orderBy: [...ordemConsultas],
      skip: Math.max(0, deslocamento - totalExames),
      take: por - cabemDeExames,
    }),
  ])

  return {
    exames,
    consultas,
    total,
    paginas: totalDePaginas(total, por),
    totalExames,
    totalConsultas,
  }
}
