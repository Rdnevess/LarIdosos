import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { dosesPrevistas } from './doses'
import { ehRegistroTardio } from './administracao.service'

/**
 * O relatório de aderência, por residente e por período.
 *
 * O número que a coordenação acompanha é o **percentual sem registro**. Ele
 * não mede o cuidado: mede a disciplina de anotar. Somá-lo a "não
 * administrada" esconderia as duas coisas — uma é falha de anotação, a outra é
 * decisão de alguém, e elas se corrigem de maneiras diferentes.
 */

export type Aderencia = {
  previstas: number
  administradas: number
  recusadas: number
  naoAdministradas: number
  semRegistro: number
  registradasForaDoTurno: number
  porMotivo: Record<string, number>
  percentualSemRegistro: number
}

export async function calcularAderencia(
  ctx: Ctx,
  residenteId: string,
  periodo: { de: Date; ate: Date }
): Promise<Aderencia> {
  exigirPapel(ctx, 'AdministracaoMedicacao', 'COORDENACAO', 'SAUDE')

  const prescricoes = await prisma.medicacao.findMany({
    where: {
      residenteId,
      dataInicio: { lte: periodo.ate },
      OR: [{ dataFim: null }, { dataFim: { gte: periodo.de } }],
    },
  })

  const registros = await prisma.administracaoMedicacao.findMany({
    where: { residenteId, horarioPrevisto: { gte: periodo.de, lt: periodo.ate } },
  })

  const porDose = new Map(
    registros
      .filter((r) => r.horarioPrevisto)
      .map((r) => [`${r.medicacaoId}|${r.horarioPrevisto!.toISOString()}`, r])
  )

  const previstas = dosesPrevistas(prescricoes, {
    inicio: periodo.de,
    fim: periodo.ate,
  })

  const contagem: Aderencia = {
    previstas: previstas.length,
    administradas: 0,
    recusadas: 0,
    naoAdministradas: 0,
    semRegistro: 0,
    registradasForaDoTurno: 0,
    porMotivo: {},
    percentualSemRegistro: 0,
  }

  for (const dose of previstas) {
    const registro = porDose.get(
      `${dose.medicacaoId}|${dose.horarioPrevisto.toISOString()}`
    )

    if (!registro) {
      // Nunca "não administrada": a dose pode ter sido dada e apenas não
      // marcada, e afirmar o contrário grava mentira no prontuário.
      contagem.semRegistro += 1
      continue
    }

    if (registro.status === 'ADMINISTRADA') contagem.administradas += 1
    if (registro.status === 'RECUSADA') contagem.recusadas += 1
    if (registro.status === 'NAO_ADMINISTRADA') contagem.naoAdministradas += 1

    if (registro.motivo) {
      contagem.porMotivo[registro.motivo] = (contagem.porMotivo[registro.motivo] ?? 0) + 1
    }

    // As tardias contam DENTRO de administradas — elas aconteceram. Aparecem
    // à parte porque medem disciplina de registro, não de administração.
    if (ehRegistroTardio(registro.horarioPrevisto, registro.registradoEm)) {
      contagem.registradasForaDoTurno += 1
    }
  }

  contagem.percentualSemRegistro =
    contagem.previstas === 0
      ? 0
      : Math.round((contagem.semRegistro / contagem.previstas) * 100)

  return contagem
}
