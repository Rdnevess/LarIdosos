import { z } from 'zod'
import type { Consulta } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Consultas externas.
 *
 * O `status` não está no modelo da spec-mãe: foi acrescentado na 2A porque sem
 * ele não há como distinguir consulta por vir de consulta esquecida de
 * consulta que não vai mais acontecer — e a área de pendências não teria o que
 * mostrar. É o mesmo papel que o `status` de `Exame` já cumpre.
 */

const statusSchema = z.enum(['AGENDADA', 'REALIZADA', 'CANCELADA'])

const novaConsultaSchema = z.object({
  residenteId: z.string().cuid(),
  // Sem recusa de data futura, ao contrário de anotação e sinal vital:
  // consulta nasce agendada, e data futura é o caso normal.
  dataHora: z.date(),
  especialidade: z.string().trim().min(2, 'Informe a especialidade'),
  profissional: z.string().trim().nullish(),
  local: z.string().trim().nullish(),
  motivo: z.string().trim().nullish(),
  conduta: z.string().trim().nullish(),
  encaminhamento: z.string().trim().nullish(),
  dataRetorno: z.date().nullish(),
  status: statusSchema.optional(),
  documentoId: z.string().cuid().nullish(),
})

const atualizacaoConsultaSchema = novaConsultaSchema.partial().omit({ residenteId: true })

export type DadosConsulta = z.infer<typeof novaConsultaSchema>
export type DadosAtualizacaoConsulta = z.infer<typeof atualizacaoConsultaSchema>

export async function registrarConsulta(ctx: Ctx, dados: DadosConsulta): Promise<Consulta> {
  exigirPapel(ctx, 'Consulta', 'COORDENACAO', 'SAUDE')
  const entrada = validar(novaConsultaSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
    select: { id: true },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criada = await tx.consulta.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Consulta',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { especialidade: { de: null, para: criada.especialidade } },
    })

    return criada
  })
}

export async function atualizarConsulta(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoConsulta
): Promise<Consulta> {
  exigirPapel(ctx, 'Consulta', 'COORDENACAO', 'SAUDE')
  const entrada = validar(atualizacaoConsultaSchema, dados)

  const atual = await prisma.consulta.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Consulta não encontrada')

  // Consulta sem conduta registrada não saiu do lugar: o idoso foi, voltou, e
  // ninguém sabe o que o médico disse. Cancelar não exige conduta — consulta
  // desmarcada não tem o que registrar, e exigi-la empurraria a equipe a
  // inventar texto.
  //
  // Como no exame, a guarda olha o estado gravado: uma consulta que já tinha
  // conduta não precisa reenviá-la para mudar de status.
  if (entrada.status === 'REALIZADA') {
    const conduta = entrada.conduta ?? atual.conduta
    if (!conduta) {
      throw new ErroValidacao(
        'Para marcar a consulta como realizada, registre a conduta'
      )
    }
  }

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.consulta.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Consulta',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff,
    })

    return atualizada
  })
}

export async function listarConsultas(ctx: Ctx, residenteId: string): Promise<Consulta[]> {
  exigirPapel(ctx, 'Consulta', 'COORDENACAO', 'SAUDE')

  return prisma.consulta.findMany({
    where: { residenteId },
    orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
  })
}
