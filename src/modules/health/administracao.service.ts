import { z } from 'zod'
import { Prisma, type AdministracaoMedicacao } from '@prisma/client'
import { janelaDoTurno, turnoSeguinte } from '@/lib/turno'
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
 * Um registro é tardio quando **o turno de origem da dose já voltou** e ele
 * ainda não tinha vindo.
 *
 * Não é o relógio que decide, é a rotação da equipe. Uma dose do turno do dia
 * registrada à noite é trabalho normal de plantão: quem entrou à noite
 * encontrou a pendência e a resolveu. O que precisa aparecer no relatório é
 * outra coisa — a dose do dia que ninguém registrou, e que só foi lançada
 * quando a equipe do dia voltou, no dia seguinte, e a encontrou em aberto.
 *
 * ## As duas regras anteriores, e por que caíram
 *
 * **"Fora do turno da dose"** foi a primeira, e media a coisa errada: dependia
 * de onde a fronteira do plantão caía. A dose das 17:00 registrada às 18:30 era
 * tardia — uma hora e meia, mas atravessou a fronteira —, enquanto a das 08:00
 * registrada às 17:00 não era, com nove horas.
 *
 * **"Quatro horas de atraso"** foi a segunda, e era consistente mas arbitrária:
 * o número saiu de preservar a sensibilidade da anterior, e não de nada que o
 * Lar reconhecesse. Sinalizava o atraso para o turno seguinte, que é justamente
 * o trabalho normal do plantão — e alerta que dispara no que acontece todo dia
 * treina a equipe a ignorá-lo.
 *
 * ## A propriedade que esta regra tem, e a que ela não tem
 *
 * O equivalente em horas **varia com a posição da dose dentro do turno**: de
 * doze a vinte e quatro, porque uma dose do fim do turno e uma do começo
 * esperam o mesmo instante — o retorno do turno. Isso está em teste, como
 * propriedade e não como defeito: o que se mede é uma rotação inteira, e a
 * variação é a largura do próprio turno.
 *
 * Não há número a calibrar. A regra se ajusta sozinha se a divisão dos turnos
 * mudar de novo — e ela já mudou uma vez.
 *
 * Não é campo no banco: sai da comparação entre `registradoEm` e a janela de
 * `horarioPrevisto`. Guardá-lo seria guardar algo que já se pode calcular.
 *
 * **Registro adiantado não é tardio.** Dose dada um pouco cedo não é dose
 * atrasada, e chamar uma da outra gravaria afirmação falsa num prontuário.
 * Aqui isso sai de graça: um registro anterior à dose está muito antes do
 * retorno do turno.
 *
 * `SE_NECESSARIO` nunca é tardia: sem `horarioPrevisto` não há turno de
 * origem, e ela é registrada quando acontece.
 */
export function ehRegistroTardio(horarioPrevisto: Date | null, registradoEm: Date): boolean {
  if (!horarioPrevisto) return false

  const janela = janelaDoTurno(horarioPrevisto)

  // Anda pelas janelas até o mesmo turno voltar, em vez de somar 24 horas ou
  // de andar duas vezes. Somar 24h dependeria de as janelas terem doze horas;
  // andar duas vezes dependeria de haver exatamente dois turnos. Os dois já
  // foram verdade e já deixaram de ser — eram três turnos de oito horas até
  // 27/08/2026. O laço só depende de a divisão do dia ser cíclica.
  let volta = turnoSeguinte(janela)
  while (volta.turno !== janela.turno) volta = turnoSeguinte(volta)

  return registradoEm >= volta.inicio
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
