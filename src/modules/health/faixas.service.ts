import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroValidacao } from '@/lib/erros'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import type { Faixa, MedidaVital } from './faixas'

export type AjusteDeFaixa = {
  medida: MedidaVital
  minimo: number | null
  maximo: number | null
}

/**
 * Os ajustes de faixa de um residente.
 *
 * Quem não tem ajuste não tem linha, e a lista volta vazia — a faixa do sistema
 * é o padrão, e não uma cópia gravada em cada residente. Assim, mudar a faixa
 * do sistema alcança todo mundo que não foi ajustado, que é o comportamento
 * que se quer quando a equipe de saúde revisar os números.
 */
export async function listarFaixas(
  ctx: Ctx,
  residenteId: string
): Promise<AjusteDeFaixa[]> {
  exigirPapel(ctx, 'FaixaReferencia', 'COORDENACAO', 'SAUDE')

  const linhas = await prisma.faixaReferencia.findMany({
    where: { residenteId },
    orderBy: { medida: 'asc' },
  })

  // `Number(...)` porque o Prisma devolve `Decimal`, e comparar `Decimal` com
  // número dá sempre falso sem reclamar. É o defeito que o plano avisou.
  return linhas.map((linha) => ({
    medida: linha.medida,
    minimo: linha.minimo === null ? null : Number(linha.minimo),
    maximo: linha.maximo === null ? null : Number(linha.maximo),
  }))
}

/**
 * Define — ou redefine — a faixa de uma medida.
 *
 * Mudar a faixa muda o que o sistema considera normal para aquela pessoa, e por
 * isso é decisão clínica com autor e data na trilha.
 */
export async function definirFaixa(
  ctx: Ctx,
  residenteId: string,
  medida: MedidaVital,
  faixa: Faixa
): Promise<void> {
  exigirPapel(ctx, 'FaixaReferencia', 'COORDENACAO', 'SAUDE')

  // Mínimo maior que máximo não alerta nunca nem alerta sempre, conforme a
  // ordem das comparações. É erro de digitação, e o lugar de recusá-lo é aqui
  // — depois de gravado, ele silencia a medida sem ninguém perceber.
  if (faixa.minimo !== null && faixa.maximo !== null && faixa.minimo > faixa.maximo) {
    throw new ErroValidacao('O mínimo não pode ser maior que o máximo')
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.faixaReferencia.findUnique({
      where: { residenteId_medida: { residenteId, medida } },
    })

    const salvo = await tx.faixaReferencia.upsert({
      where: { residenteId_medida: { residenteId, medida } },
      create: {
        residenteId,
        medida,
        minimo: faixa.minimo,
        maximo: faixa.maximo,
        criadoPorId: ctx.usuarioId,
      },
      update: { minimo: faixa.minimo, maximo: faixa.maximo },
    })

    await registrarAuditoria(tx, ctx, {
      acao: anterior ? 'ATUALIZAR' : 'CRIAR',
      entidade: 'FaixaReferencia',
      entidadeId: salvo.id,
      residenteId,
      diff: {
        minimo: {
          de: anterior?.minimo === null || anterior === null ? null : Number(anterior.minimo),
          para: faixa.minimo,
        },
        maximo: {
          de: anterior?.maximo === null || anterior === null ? null : Number(anterior.maximo),
          para: faixa.maximo,
        },
      },
    })
  })
}
