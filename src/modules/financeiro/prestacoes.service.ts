import { z } from 'zod'
import { Prisma, type PrestacaoContas } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * A prestação de contas: uma por conta bancária, por mês.
 *
 * **Fechar congela** os lançamentos da competência — é o que impede um
 * lançamento posterior de mudar, em silêncio, um documento já protocolado no
 * órgão. **Reabrir exige motivo** e deixa rastro na trilha e nas observações do
 * documento regerado: erro acontece, e um sistema que não deixa corrigir vira
 * planilha paralela.
 *
 * Fechar e reabrir são só de COORDENACAO. São atos institucionais, não de
 * escrituração.
 */

const competenciaSchema = z.object({
  contaBancariaId: z.string().cuid(),
  anoCompetencia: z.number().int().min(2000).max(2100),
  mesCompetencia: z.number().int().min(1).max(12),
})

export type FiltrosPrestacao = {
  contaBancariaId?: string
  anoCompetencia?: number
  mesCompetencia?: number
  status?: 'ABERTA' | 'FECHADA'
}

function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100
}

function limitesDaCompetencia(ano: number, mes: number): { inicio: Date; fim: Date } {
  return { inicio: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 1) }
}

/** O mês anterior a uma competência, virando o ano quando preciso. */
function competenciaAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
}

/**
 * Soma dos lançamentos `REALIZADO` da conta na competência. Previsto e
 * cancelado não entram: o primeiro ainda não aconteceu, o segundo não
 * aconteceu.
 */
async function movimentoDaCompetencia(
  contaBancariaId: string,
  ano: number,
  mes: number
): Promise<{ receitas: number; despesas: number }> {
  const { inicio, fim } = limitesDaCompetencia(ano, mes)

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      contaBancariaId,
      status: 'REALIZADO',
      data: { gte: inicio, lt: fim },
    },
    select: { natureza: true, valor: true },
  })

  let receitas = 0
  let despesas = 0
  for (const lancamento of lancamentos) {
    const valor = Number(lancamento.valor)
    if (lancamento.natureza === 'RECEITA') receitas += valor
    else despesas += valor
  }

  return { receitas: duasCasas(receitas), despesas: duasCasas(despesas) }
}

/**
 * O saldo anterior vem do saldo disponível da prestação **fechada**
 * imediatamente anterior da mesma conta; não havendo, do saldo inicial da
 * conta.
 *
 * Prestação ainda aberta é ignorada de propósito: o saldo dela pode mudar, e
 * herdá-lo daria um saldo inicial que se move sozinho.
 *
 * É isto que elimina a recontagem manual — hoje alguém copia o saldo final do
 * mês anterior torcendo para não errar.
 */
export async function calcularSaldoAnterior(
  ctx: Ctx,
  contaBancariaId: string,
  ano: number,
  mes: number
): Promise<number> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const anterior = competenciaAnterior(ano, mes)
  const prestacaoAnterior = await prisma.prestacaoContas.findFirst({
    where: {
      contaBancariaId,
      status: 'FECHADA',
      anoCompetencia: anterior.ano,
      mesCompetencia: anterior.mes,
    },
  })

  if (!prestacaoAnterior) {
    const conta = await prisma.contaBancaria.findUnique({ where: { id: contaBancariaId } })
    if (!conta) throw new ErroNaoEncontrado('Conta bancária não encontrada')
    return Number(conta.saldoInicial)
  }

  const saldoDaAnterior = Number(
    prestacaoAnterior.saldoAnteriorAjustado ?? prestacaoAnterior.saldoAnterior
  )
  const { receitas, despesas } = await movimentoDaCompetencia(
    contaBancariaId,
    anterior.ano,
    anterior.mes
  )

  return duasCasas(saldoDaAnterior + receitas - despesas)
}

export async function abrirPrestacao(
  ctx: Ctx,
  contaBancariaId: string,
  anoCompetencia: number,
  mesCompetencia: number
): Promise<PrestacaoContas> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(competenciaSchema, {
    contaBancariaId,
    anoCompetencia,
    mesCompetencia,
  })

  const saldoAnterior = await calcularSaldoAnterior(
    ctx,
    entrada.contaBancariaId,
    entrada.anoCompetencia,
    entrada.mesCompetencia
  )

  try {
    return await prisma.$transaction(async (tx) => {
      const criada = await tx.prestacaoContas.create({
        data: { ...entrada, saldoAnterior, criadoPorId: ctx.usuarioId },
      })

      await registrarAuditoria(tx, ctx, {
        acao: 'CRIAR',
        entidade: 'PrestacaoContas',
        entidadeId: criada.id,
        diff: {
          competencia: { de: null, para: `${entrada.mesCompetencia}/${entrada.anoCompetencia}` },
          saldoAnterior: { de: null, para: saldoAnterior },
        },
      })

      return criada
    })
  } catch (erro) {
    // A restrição única do banco já barra; aqui ela vira mensagem de gente.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroValidacao('Já existe prestação desta conta nesta competência')
    }
    throw erro
  }
}

async function exigirPrestacao(id: string): Promise<PrestacaoContas> {
  const prestacao = await prisma.prestacaoContas.findUnique({ where: { id } })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')
  return prestacao
}

/**
 * O valor derivado continua em `saldoAnterior`; o ajuste vai para o campo ao
 * lado, com a justificativa. A divergência fica registrada com autor e motivo,
 * em vez de ser sobrescrita em silêncio — e a justificativa sai nas observações
 * do documento.
 */
export async function ajustarSaldoAnterior(
  ctx: Ctx,
  id: string,
  valor: number,
  justificativa: string
): Promise<PrestacaoContas> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const texto = validar(
    z.string().trim().min(5, 'Explique por que o saldo anterior está sendo ajustado'),
    justificativa
  )
  const saldoAnteriorAjustado = validar(z.number(), valor)

  const atual = await exigirPrestacao(id)
  if (atual.status === 'FECHADA') {
    throw new ErroValidacao('Esta prestação está fechada. Reabra-a antes de ajustar o saldo.')
  }

  return prisma.$transaction(async (tx) => {
    const ajustada = await tx.prestacaoContas.update({
      where: { id },
      data: { saldoAnteriorAjustado, justificativaAjuste: texto },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'PrestacaoContas',
      entidadeId: id,
      diff: {
        saldoAnteriorAjustado: {
          de: atual.saldoAnteriorAjustado ? Number(atual.saldoAnteriorAjustado) : null,
          para: saldoAnteriorAjustado,
        },
        justificativaAjuste: { de: atual.justificativaAjuste, para: texto },
      },
    })

    return ajustada
  })
}

/**
 * O texto livre que vai ao órgão, acima da declaração de encerramento: onde a
 * instituição justifica movimentação incomum do mês — uma doação atípica, uma
 * despesa que não se repete, um valor que salta aos olhos.
 *
 * Fechada, não muda: o documento já foi protocolado com um texto, e alterá-lo
 * em silêncio faria o arquivo do órgão divergir do sistema. Reabra antes.
 */
export async function registrarObservacoes(
  ctx: Ctx,
  id: string,
  texto: string
): Promise<PrestacaoContas> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  // Sem mínimo: escrito por engano precisa poder sair, e vazio é o normal.
  const observacoes = validar(z.string().trim(), texto)

  const atual = await exigirPrestacao(id)
  if (atual.status === 'FECHADA') {
    throw new ErroValidacao(
      'Esta prestação está fechada. Reabra-a antes de alterar as observações.'
    )
  }

  return prisma.$transaction(async (tx) => {
    const salva = await tx.prestacaoContas.update({ where: { id }, data: { observacoes } })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'PrestacaoContas',
      entidadeId: id,
      diff: { observacoes: { de: atual.observacoes, para: observacoes } },
    })

    return salva
  })
}

export async function fecharPrestacao(ctx: Ctx, id: string): Promise<PrestacaoContas> {
  // Só COORDENACAO: fechar é ato institucional, não de escrituração.
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO')

  const atual = await exigirPrestacao(id)
  if (atual.status === 'FECHADA') {
    throw new ErroValidacao('Esta prestação já está fechada')
  }

  const { inicio, fim } = limitesDaCompetencia(atual.anoCompetencia, atual.mesCompetencia)

  return prisma.$transaction(async (tx) => {
    // Só os `REALIZADO`: previsto e cancelado não vão ao órgão.
    await tx.lancamento.updateMany({
      where: {
        contaBancariaId: atual.contaBancariaId,
        status: 'REALIZADO',
        data: { gte: inicio, lt: fim },
      },
      data: { prestacaoContasId: id },
    })

    const fechada = await tx.prestacaoContas.update({
      where: { id },
      data: { status: 'FECHADA', fechadaEm: new Date(), fechadaPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'PrestacaoContas',
      entidadeId: id,
      diff: { status: { de: 'ABERTA', para: 'FECHADA' } },
    })

    return fechada
  })
}

/**
 * Reabrir sobrescreve `motivoReabertura`: reaberta duas vezes, só a última
 * justificativa fica no campo. O histórico completo está na trilha, que é
 * append-only — uma tabela de reaberturas seria estrutura para um caso que
 * talvez nunca aconteça.
 */
export async function reabrirPrestacao(
  ctx: Ctx,
  id: string,
  motivo: string
): Promise<PrestacaoContas> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO')

  const motivoReabertura = validar(
    z.string().trim().min(5, 'Explique por que a prestação está sendo reaberta'),
    motivo
  )

  const atual = await exigirPrestacao(id)
  if (atual.status === 'ABERTA') {
    throw new ErroValidacao('Esta prestação já está aberta')
  }

  return prisma.$transaction(async (tx) => {
    await tx.lancamento.updateMany({
      where: { prestacaoContasId: id },
      data: { prestacaoContasId: null },
    })

    const reaberta = await tx.prestacaoContas.update({
      where: { id },
      data: {
        status: 'ABERTA',
        reabertaEm: new Date(),
        reabertaPorId: ctx.usuarioId,
        motivoReabertura,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'PrestacaoContas',
      entidadeId: id,
      diff: {
        status: { de: 'FECHADA', para: 'ABERTA' },
        motivoReabertura: { de: atual.motivoReabertura, para: motivoReabertura },
      },
    })

    return reaberta
  })
}

export async function obterPrestacao(ctx: Ctx, id: string): Promise<PrestacaoContas> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')
  return exigirPrestacao(id)
}

export type CoberturaAnexos = {
  despesas: number
  comFiscal: number
  comComprovante: number
  temExtrato: boolean
}

/**
 * Quantas despesas da competência já têm cada anexo.
 *
 * Não é alerta e não é erro: é contagem, mostrada no cartão da prestação
 * enquanto ela ainda está aberta. O apêndice do PDF não carimba nada nas
 * páginas — foi decisão explícita —, então lá a falta de uma nota não se
 * enxerga: o leitor vê menos páginas, não um buraco. Aqui se enxerga, e aqui
 * ainda dá para resolver.
 */
export async function coberturaDeAnexos(
  ctx: Ctx,
  prestacaoId: string
): Promise<CoberturaAnexos> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    select: { extratoId: true },
  })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')

  const despesas = await prisma.lancamento.findMany({
    where: { prestacaoContasId: prestacaoId, natureza: 'DESPESA', status: 'REALIZADO' },
    select: { documentoFiscalId: true, comprovantePagamentoId: true },
  })

  return {
    despesas: despesas.length,
    comFiscal: despesas.filter((despesa) => despesa.documentoFiscalId !== null).length,
    comComprovante: despesas.filter((despesa) => despesa.comprovantePagamentoId !== null).length,
    temExtrato: prestacao.extratoId !== null,
  }
}

export async function listarPrestacoes(
  ctx: Ctx,
  filtros: FiltrosPrestacao
): Promise<PrestacaoContas[]> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  return prisma.prestacaoContas.findMany({
    where: {
      contaBancariaId: filtros.contaBancariaId,
      anoCompetencia: filtros.anoCompetencia,
      mesCompetencia: filtros.mesCompetencia,
      status: filtros.status,
    },
    orderBy: [{ anoCompetencia: 'desc' }, { mesCompetencia: 'desc' }, { id: 'desc' }],
  })
}
