import type { Consulta, Exame } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { TAMANHO_PADRAO, totalDePaginas, type Tamanho } from '@/lib/paginacao'
import { listarAlertasVitais, type AlertaVital } from './alertas-vitais'
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
  /**
   * Vêm **antes** de exames e consultas na sequência paginada: se a página
   * encher, o que cai para a seguinte é exame agendado, e nunca sinal vital.
   */
  alertas: AlertaVital[]
  totalAlertas: number
  /** Somados, os três. É o que a paginação fatia. */
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
    const [alertas, exames, consultas] = await Promise.all([
      listarAlertasVitais(ctx),
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
    const total = alertas.length + exames.length + consultas.length
    return {
      alertas,
      totalAlertas: alertas.length,
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

  // Conta-se antes de fatiar porque são as contagens que dizem onde a sequência
  // deixa de ser alerta e passa a ser exame, e onde deixa de ser exame e passa
  // a ser consulta. Sem elas, não há como saber quanto cabe na fatia sem trazer
  // as tabelas inteiras — que é o que paginar existe para evitar.
  //
  // Os alertas vêm inteiros porque são derivados, e não contáveis por `count`:
  // saber quantos existem já é tê-los. É o custo aceito na §4 da spec.
  const [todosAlertas, totalExames, totalConsultas] = await Promise.all([
    listarAlertasVitais(ctx),
    prisma.exame.count({ where: ONDE_EXAMES }),
    prisma.consulta.count({ where: ONDE_CONSULTAS }),
  ])
  const totalAlertas = todosAlertas.length
  const total = totalAlertas + totalExames + totalConsultas

  // **Os três deslocamentos são encadeados**, e é aqui que uma implementação
  // desatenta some com um registro no meio sem quebrar nada visivelmente: o
  // deslocamento de cada lista é o que sobra depois de atravessar as anteriores.
  const cabemDeAlertas = Math.max(0, Math.min(por, totalAlertas - deslocamento))
  const alertas = todosAlertas.slice(deslocamento, deslocamento + cabemDeAlertas)

  const deslocamentoExames = Math.max(0, deslocamento - totalAlertas)
  const cabemDeExames = Math.max(
    0,
    Math.min(por - cabemDeAlertas, totalExames - deslocamentoExames)
  )

  const deslocamentoConsultas = Math.max(0, deslocamento - totalAlertas - totalExames)
  const cabemDeConsultas = por - cabemDeAlertas - cabemDeExames

  const [exames, consultas] = await Promise.all([
    cabemDeExames > 0
      ? prisma.exame.findMany({
          where: ONDE_EXAMES,
          include: { residente: RESIDENTE },
          orderBy: [...ordemExames],
          skip: deslocamentoExames,
          take: cabemDeExames,
        })
      : Promise.resolve([]),
    cabemDeConsultas > 0
      ? prisma.consulta.findMany({
          where: ONDE_CONSULTAS,
          include: { residente: RESIDENTE },
          orderBy: [...ordemConsultas],
          skip: deslocamentoConsultas,
          take: cabemDeConsultas,
        })
      : Promise.resolve([]),
  ])

  return {
    alertas,
    totalAlertas,
    exames,
    consultas,
    total,
    paginas: totalDePaginas(total, por),
    totalExames,
    totalConsultas,
  }
}
