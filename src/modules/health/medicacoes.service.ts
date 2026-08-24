import { z } from 'zod'
import type { Medicacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * O esquema medicamentoso.
 *
 * **Prescrição não é editada no lugar** (regra R5): alterar dose ou horário
 * encerra a vigente e cria outra, ligada à anterior. A tela expõe isso como
 * dois atos explícitos — suspender e prescrever substituta —, e
 * `prescreverSubstituta` recusa enquanto a anterior estiver ativa, para o
 * atalho não desfazer a decisão.
 */

/**
 * O formato é contrato com a derivação (`doses.ts`): "8h" não vira dose
 * nenhuma, e a falha apareceria como uma medicação que nunca chega à tela do
 * turno — o tipo de defeito que só se descobre quando alguém não recebe o
 * remédio.
 */
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/

const medicacaoSchema = z
  .object({
    residenteId: z.string().cuid(),
    farmaco: z.string().trim().min(2, 'Informe o fármaco'),
    concentracao: z.string().trim().nullish(),
    formaFarmaceutica: z.string().trim().nullish(),
    // Texto livre: a unidade varia por fármaco e por apresentação ("1
    // comprimido", "10 gotas", "meio comprimido"), e um campo numérico
    // forçaria a equipe a traduzir a receita antes de digitá-la.
    dose: z.string().trim().min(1, 'Informe a dose'),
    via: z.enum([
      'ORAL', 'SUBLINGUAL', 'IM', 'EV', 'SC',
      'TOPICA', 'INALATORIA', 'OFTALMICA', 'OTOLOGICA', 'RETAL',
    ]),
    tipo: z.enum(['HORARIO_FIXO', 'SE_NECESSARIO']),
    horarios: z.array(z.string().regex(HORARIO, 'Horário deve estar no formato HH:mm')),
    diasSemana: z.array(z.number().int().min(0).max(6)),
    instrucoes: z.string().trim().nullish(),
    prescritorNome: z.string().trim().nullish(),
    prescritorConselho: z.string().trim().nullish(),
    dataInicio: z.date(),
    dataFim: z.date().nullish(),
  })
  .refine((d) => d.tipo === 'SE_NECESSARIO' || d.horarios.length > 0, {
    message: 'Medicação de horário fixo precisa de ao menos um horário',
    path: ['horarios'],
  })

export type DadosMedicacao = z.infer<typeof medicacaoSchema>

async function exigirResidente(id: string): Promise<void> {
  const residente = await prisma.residente.findUnique({ where: { id }, select: { id: true } })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
}

async function criar(
  ctx: Ctx,
  dados: DadosMedicacao,
  substituiMedicacaoId: string | null
): Promise<Medicacao> {
  const entrada = validar(medicacaoSchema, dados)
  await exigirResidente(entrada.residenteId)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.medicacao.create({
      data: { ...entrada, substituiMedicacaoId, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Medicacao',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: {
        farmaco: { de: null, para: criada.farmaco },
        dose: { de: null, para: criada.dose },
        horarios: { de: null, para: criada.horarios.join(', ') },
      },
    })

    return criada
  })
}

export async function prescrever(ctx: Ctx, dados: DadosMedicacao): Promise<Medicacao> {
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')
  return criar(ctx, dados, null)
}

/**
 * Grava `dataFim = agora`, e não o fim do dia: a dose seguinte simplesmente
 * não é derivada, e o relatório de aderência não a acusa como "sem registro"
 * — uma dose que o médico mandou não dar.
 */
export async function suspenderMedicacao(
  ctx: Ctx,
  id: string,
  motivo: string
): Promise<Medicacao> {
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')

  const motivoSuspensao = validar(
    z.string().trim().min(3, 'Informe o motivo da suspensão'),
    motivo
  )

  const atual = await prisma.medicacao.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Medicação não encontrada')
  if (!atual.ativa) throw new ErroValidacao('Esta medicação já está suspensa')

  return prisma.$transaction(async (tx) => {
    const suspensa = await tx.medicacao.update({
      where: { id },
      data: { ativa: false, dataFim: new Date(), motivoSuspensao },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Medicacao',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: {
        ativa: { de: true, para: false },
        motivoSuspensao: { de: null, para: motivoSuspensao },
      },
    })

    return suspensa
  })
}

/**
 * O segundo passo dos dois que a R5 exige. Recusa enquanto a anterior estiver
 * ativa: a substituição pressupõe a suspensão, e permitir o atalho faria a
 * prescrição ser "editada no lugar" por outro nome.
 */
export async function prescreverSubstituta(
  ctx: Ctx,
  idAnterior: string,
  dados: DadosMedicacao
): Promise<Medicacao> {
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')

  const anterior = await prisma.medicacao.findUnique({ where: { id: idAnterior } })
  if (!anterior) throw new ErroNaoEncontrado('Medicação anterior não encontrada')
  if (anterior.ativa) {
    throw new ErroValidacao(
      'Suspenda a prescrição atual antes de prescrever a substituta'
    )
  }

  return criar(ctx, dados, idAnterior)
}

export async function listarMedicacoes(ctx: Ctx, residenteId: string): Promise<Medicacao[]> {
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')

  return prisma.medicacao.findMany({
    where: { residenteId },
    orderBy: [{ ativa: 'desc' }, { dataInicio: 'desc' }, { id: 'desc' }],
  })
}

export async function listarMedicacoesAtivas(
  ctx: Ctx,
  residenteId: string
): Promise<Medicacao[]> {
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')

  const ativas = await prisma.medicacao.findMany({ where: { residenteId, ativa: true } })

  // Pelo primeiro horário do dia: é a ordem em que a equipe encontra os
  // remédios no turno, e a que o cabeçalho clínico mostra.
  return ativas.sort((a, b) => {
    const primeiro = (m: Medicacao) => m.horarios[0] ?? '99:99'
    return primeiro(a).localeCompare(primeiro(b)) || a.farmaco.localeCompare(b.farmaco, 'pt-BR')
  })
}
