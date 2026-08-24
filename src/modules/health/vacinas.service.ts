import { z } from 'zod'
import type { Vacina } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * A menor das entidades da 2A: cria e lista, sem status, sem janela de edição,
 * sem máquina. Barata de modelar e das primeiras coisas que a vigilância
 * sanitária pede.
 */

const vacinaSchema = z.object({
  residenteId: z.string().cuid(),
  imunizante: z.string().trim().min(2, 'Informe o imunizante'),
  // Texto livre: "1ª dose", "reforço", "dose anual 2026" — a nomenclatura
  // varia por imunizante e por campanha, e um enum envelheceria a cada ano.
  dose: z.string().trim().min(1, 'Informe a dose'),
  // Vacina se registra depois de aplicada: data futura aqui é erro de
  // digitação, e a carteira de vacinação é documento que a vigilância lê.
  dataAplicacao: z.date().refine((d) => d.getTime() <= Date.now(), {
    message: 'A data de aplicação não pode estar no futuro',
  }),
  lote: z.string().trim().nullish(),
  localAplicacao: z.string().trim().nullish(),
})

export type DadosVacina = z.infer<typeof vacinaSchema>

export async function registrarVacina(ctx: Ctx, dados: DadosVacina): Promise<Vacina> {
  exigirPapel(ctx, 'Vacina', 'COORDENACAO', 'SAUDE')
  const entrada = validar(vacinaSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criada = await tx.vacina.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Vacina',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { imunizante: { de: null, para: criada.imunizante } },
    })

    return criada
  })
}

export async function listarVacinas(ctx: Ctx, residenteId: string): Promise<Vacina[]> {
  exigirPapel(ctx, 'Vacina', 'COORDENACAO', 'SAUDE')

  return prisma.vacina.findMany({
    where: { residenteId },
    orderBy: [{ dataAplicacao: 'desc' }, { id: 'desc' }],
  })
}
