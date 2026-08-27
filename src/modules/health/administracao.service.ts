import { z } from 'zod'
import { Prisma, type AdministracaoMedicacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
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
 * A partir de quantas horas de atraso um registro passa a ser tardio.
 *
 * Quatro, e o número é uma escolha declarada e não um limite clínico. Ele foi
 * calibrado para **preservar a sensibilidade que a regra anterior tinha**: com
 * três turnos de oito horas, uma dose podia atrasar até quase oito horas sem
 * sinalizar, e a média do que passava despercebido ficava perto de quatro.
 *
 * Um limite bem menor — duas horas, por exemplo — seria mais rigoroso do que
 * este sistema jamais foi, e traria o risco que o aviso de conselho vencendo já
 * documenta em `funcionarios/page.tsx`: alerta que dispara demais treina a
 * equipe a ignorá-lo, e o dia em que houver um atraso de verdade é o dia em que
 * ninguém olha.
 *
 * Se o Lar quiser outro limite, é esta constante que muda.
 */
export const HORAS_ATE_TARDIO = 4

/**
 * Um registro é tardio quando foi feito mais de `HORAS_ATE_TARDIO` depois do
 * horário previsto da dose.
 *
 * **Era "fora do turno a que a dose pertence"**, e mudou em 27/08/2026 porque
 * aquela regra media a coisa errada: ela dependia de *onde a fronteira do
 * plantão caía*, e não de quanto tempo passou. A dose das 17:00 registrada às
 * 18:30 era tardia — uma hora e meia, mas atravessou a fronteira; a das 08:00
 * registrada às 17:00 não era — nove horas, mesmo turno. O mesmo atraso dava
 * respostas opostas conforme a hora do dia, e a passagem de três turnos para
 * dois tornou isso visível ao dobrar a janela sem que ninguém tivesse pedido.
 *
 * Não é campo no banco: sai da comparação entre `registradoEm` e
 * `horarioPrevisto`. Guardá-lo seria guardar algo que já se pode calcular, e
 * que ficaria errado se o limite mudasse.
 *
 * **Registro adiantado não é tardio.** Registrar antes da hora prevista pode
 * ser a dose dada um pouco cedo, e chamá-la de tardia gravaria uma afirmação
 * falsa num prontuário. A regra mede atraso, e atraso negativo não existe.
 *
 * `SE_NECESSARIO` nunca é tardia: sem `horarioPrevisto` não há de que atrasar,
 * e ela é registrada quando acontece.
 */
export function ehRegistroTardio(horarioPrevisto: Date | null, registradoEm: Date): boolean {
  if (!horarioPrevisto) return false

  const atrasoEmHoras = (registradoEm.getTime() - horarioPrevisto.getTime()) / 3_600_000
  return atrasoEmHoras >= HORAS_ATE_TARDIO
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
