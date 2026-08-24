import { z } from 'zod'
import { Prisma, type AdministracaoMedicacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { janelaDoTurno } from '@/lib/turno'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * O registro do que aconteceu com cada dose.
 *
 * Esta tabela persiste **somente eventos ocorridos**. A dose prevista é
 * derivada (`doses.ts`) e não existe aqui — é o que impede o sistema de
 * escrever "não administrada" sobre uma dose que pode ter sido dada e apenas
 * não marcada.
 */

/**
 * Um registro é tardio quando foi feito fora do turno a que a dose pertence.
 *
 * Não é campo no banco: sai da comparação entre `registradoEm` e a janela do
 * turno de `horarioPrevisto`. Guardá-lo seria guardar algo que já se pode
 * calcular, e que ficaria errado se a divisão dos turnos mudasse.
 *
 * `SE_NECESSARIO` nunca é tardia: sem `horarioPrevisto` não há turno de
 * referência, e ela é registrada quando acontece.
 */
export function ehRegistroTardio(horarioPrevisto: Date | null, registradoEm: Date): boolean {
  if (!horarioPrevisto) return false

  const janela = janelaDoTurno(horarioPrevisto)
  return registradoEm < janela.inicio || registradoEm >= janela.fim
}

const administracaoSchema = z
  .object({
    medicacaoId: z.string().cuid(),
    residenteId: z.string().cuid(),
    horarioPrevisto: z.date().nullish(),
    status: z.enum(['ADMINISTRADA', 'RECUSADA', 'NAO_ADMINISTRADA']),
    motivo: z
      .enum([
        'IDOSO_HOSPITALIZADO', 'IDOSO_AUSENTE', 'MEDICAMENTO_EM_FALTA',
        'SUSPENSA_MEDICO', 'RECUSA_IDOSO', 'OUTRO',
      ])
      .nullish(),
    observacao: z.string().trim().nullish(),
  })
  // "Não administrada" sem motivo é meia informação: quem lê o prontuário
  // depois precisa saber se faltou remédio ou se o idoso estava internado.
  .refine((d) => d.status !== 'NAO_ADMINISTRADA' || Boolean(d.motivo), {
    message: 'Informe o motivo de a dose não ter sido administrada',
    path: ['motivo'],
  })

export type DadosAdministracao = z.infer<typeof administracaoSchema>

export async function registrarAdministracao(
  ctx: Ctx,
  dados: DadosAdministracao
): Promise<AdministracaoMedicacao> {
  exigirPapel(ctx, 'AdministracaoMedicacao', 'COORDENACAO', 'SAUDE')
  const entrada = validar(administracaoSchema, dados)

  const medicacao = await prisma.medicacao.findUnique({
    where: { id: entrada.medicacaoId },
    select: { id: true, residenteId: true },
  })
  if (!medicacao) throw new ErroNaoEncontrado('Medicação não encontrada')

  const registradoEm = new Date()

  // Registro tardio é livre e exige justificativa. A verificação mora aqui, e
  // não no schema, porque depende do relógio: o mesmo payload é ou não tardio
  // conforme a hora em que chega.
  if (
    ehRegistroTardio(entrada.horarioPrevisto ?? null, registradoEm) &&
    !entrada.observacao
  ) {
    throw new ErroValidacao(
      'Esta dose é de um turno que já passou. Escreva o que aconteceu antes de registrar.'
    )
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const criado = await tx.administracaoMedicacao.create({
        data: { ...entrada, registradoEm, criadoPorId: ctx.usuarioId },
      })

      await registrarAuditoria(tx, ctx, {
        acao: 'CRIAR',
        entidade: 'AdministracaoMedicacao',
        entidadeId: criado.id,
        residenteId: medicacao.residenteId,
        diff: {
          status: { de: null, para: criado.status },
          horarioPrevisto: { de: null, para: criado.horarioPrevisto },
        },
      })

      return criado
    })
  } catch (erro) {
    // A colisão da restrição única da R4: duas pessoas com a tela do turno
    // aberta ao mesmo tempo. A mensagem diz o que aconteceu, e não "violação
    // de restrição única".
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroValidacao('Esta dose já foi registrada por outra pessoa')
    }
    throw erro
  }
}

export async function listarAdministracoes(
  ctx: Ctx,
  janela: { inicio: Date; fim: Date }
): Promise<AdministracaoMedicacao[]> {
  exigirPapel(ctx, 'AdministracaoMedicacao', 'COORDENACAO', 'SAUDE')

  return prisma.administracaoMedicacao.findMany({
    where: { horarioPrevisto: { gte: janela.inicio, lt: janela.fim } },
  })
}
