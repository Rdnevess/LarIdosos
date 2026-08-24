import type { AdministracaoMedicacao, Medicacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import type { JanelaTurno } from '@/lib/turno'
import { dosesPrevistas } from './doses'
import { ehRegistroTardio } from './administracao.service'

/**
 * A tela mais usada do sistema, em forma de dado.
 *
 * Cruza as doses **derivadas** do esquema com o que foi de fato registrado,
 * para todos os residentes de uma vez. Agrupar por horário e não por residente
 * é o que a rotina pede: a equipe percorre o corredor às 08:00 dando os
 * remédios das 08:00 de todo mundo, e não abre uma ficha por vez.
 */

export type EstadoDose =
  | 'PREVISTA'
  | 'ATRASADA'
  | 'SEM_REGISTRO'
  | 'ADMINISTRADA'
  | 'RECUSADA'
  | 'NAO_ADMINISTRADA'

export type DoseDoTurno = {
  medicacaoId: string
  residenteId: string
  residenteNome: string
  farmaco: string
  dose: string
  via: string
  instrucoes: string | null
  horarioPrevisto: Date
  estado: EstadoDose
  motivo: string | null
  observacao: string | null
  registroTardio: boolean
}

export type MedicacaoSeNecessario = {
  medicacaoId: string
  residenteId: string
  residenteNome: string
  farmaco: string
  dose: string
  via: string
  instrucoes: string | null
}

export type MapaDoTurno = {
  janela: JanelaTurno
  doses: DoseDoTurno[]
  seNecessario: MedicacaoSeNecessario[]
}

/** Depois disso, a dose vencida sem registro ganha destaque na tela. */
export const MINUTOS_PARA_ATRASO = 30

type PrescricaoComResidente = Medicacao & {
  residente: { id: string; nomeCompleto: string; nomeSocial: string | null }
}

function nomeDe(residente: { nomeCompleto: string; nomeSocial: string | null }): string {
  return residente.nomeSocial || residente.nomeCompleto
}

function chave(medicacaoId: string, horarioPrevisto: Date): string {
  return `${medicacaoId}|${horarioPrevisto.toISOString()}`
}

/**
 * A ordem aqui é a decisão de desenho que dá razão à fase.
 *
 * Registrado vence tudo. Sem registro, e enquanto o turno corre, a dose
 * vencida é **atrasada** — alguém ainda pode dá-la. Passado o fim da janela,
 * ela vira **sem registro**, e nunca "não administrada": a dose pode ter sido
 * dada e apenas não marcada, e escrever o contrário é gravar mentira no
 * prontuário.
 */
function estadoDaDose(
  registro: AdministracaoMedicacao | undefined,
  horarioPrevisto: Date,
  janela: JanelaTurno,
  agora: Date
): EstadoDose {
  if (registro) return registro.status
  if (agora >= janela.fim) return 'SEM_REGISTRO'

  const atrasoMs = agora.getTime() - horarioPrevisto.getTime()
  return atrasoMs > MINUTOS_PARA_ATRASO * 60_000 ? 'ATRASADA' : 'PREVISTA'
}

export async function montarMapaDoTurno(
  ctx: Ctx,
  janela: JanelaTurno,
  agora: Date = new Date()
): Promise<MapaDoTurno> {
  // Uma checagem só, e sem auditar `VISUALIZAR`: a tela é aberta dezenas de
  // vezes por dia pela mesma pessoa, e cada administração — essa sim auditada
  // — já dá o rastro que interessa.
  exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')

  // O residente vem junto, numa consulta só: sem isso seria N+1 numa tela
  // aberta dezenas de vezes por dia.
  const prescricoes: PrescricaoComResidente[] = await prisma.medicacao.findMany({
    where: {
      dataInicio: { lte: janela.fim },
      OR: [{ dataFim: null }, { dataFim: { gte: janela.inicio } }],
    },
    include: { residente: { select: { id: true, nomeCompleto: true, nomeSocial: true } } },
  })

  const registros = await prisma.administracaoMedicacao.findMany({
    where: { horarioPrevisto: { gte: janela.inicio, lt: janela.fim } },
  })

  const porDose = new Map<string, AdministracaoMedicacao>()
  for (const registro of registros) {
    if (registro.horarioPrevisto) {
      porDose.set(chave(registro.medicacaoId, registro.horarioPrevisto), registro)
    }
  }

  const porId = new Map(prescricoes.map((p) => [p.id, p]))

  const doses: DoseDoTurno[] = dosesPrevistas(prescricoes, janela).map((dose) => {
    const prescricao = porId.get(dose.medicacaoId)!
    const registro = porDose.get(chave(dose.medicacaoId, dose.horarioPrevisto))

    return {
      medicacaoId: dose.medicacaoId,
      residenteId: dose.residenteId,
      residenteNome: nomeDe(prescricao.residente),
      farmaco: prescricao.farmaco,
      dose: prescricao.dose,
      via: prescricao.via,
      instrucoes: prescricao.instrucoes,
      horarioPrevisto: dose.horarioPrevisto,
      estado: estadoDaDose(registro, dose.horarioPrevisto, janela, agora),
      motivo: registro?.motivo ?? null,
      observacao: registro?.observacao ?? null,
      registroTardio: registro
        ? ehRegistroTardio(registro.horarioPrevisto, registro.registradoEm)
        : false,
    }
  })

  // Por horário, e dentro do horário por nome: é a ordem em que a equipe
  // percorre o corredor.
  doses.sort(
    (a, b) =>
      a.horarioPrevisto.getTime() - b.horarioPrevisto.getTime() ||
      a.residenteNome.localeCompare(b.residenteNome, 'pt-BR')
  )

  const seNecessario: MedicacaoSeNecessario[] = prescricoes
    .filter((p) => p.tipo === 'SE_NECESSARIO' && p.ativa)
    .map((p) => ({
      medicacaoId: p.id,
      residenteId: p.residenteId,
      residenteNome: nomeDe(p.residente),
      farmaco: p.farmaco,
      dose: p.dose,
      via: p.via,
      instrucoes: p.instrucoes,
    }))
    .sort(
      (a, b) =>
        a.residenteNome.localeCompare(b.residenteNome, 'pt-BR') ||
        a.farmaco.localeCompare(b.farmaco, 'pt-BR')
    )

  return { janela, doses, seNecessario }
}
