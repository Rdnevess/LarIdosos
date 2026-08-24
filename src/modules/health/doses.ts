/**
 * As doses previstas, derivadas do esquema medicamentoso.
 *
 * **Puro de propósito: não toca no banco.** É a única parte do sistema que dá
 * para exercitar exaustivamente sem Postgres — virada da meia-noite, dia da
 * semana do lado certo da virada, bordas da vigência —, e é exatamente onde os
 * bugs de verdade moram.
 *
 * A prescrição é a fonte da verdade; `AdministracaoMedicacao` persiste
 * **somente o que aconteceu**. A dose prevista não existe em tabela nenhuma, e
 * é isso que impede o sistema de escrever "não administrada" sobre uma dose
 * que pode ter sido dada e apenas não marcada.
 *
 * A alternativa — um job noturno criando registros "pendente" — exigiria cron,
 * duplicaria estado, quebraria quando a prescrição mudasse no meio do dia, e
 * gravaria afirmação falsa no prontuário ao fechar o dia.
 */

export type PrescricaoParaDerivacao = {
  id: string
  residenteId: string
  tipo: 'HORARIO_FIXO' | 'SE_NECESSARIO'
  horarios: string[]
  diasSemana: number[]
  dataInicio: Date
  dataFim: Date | null
}

export type DosePrevista = {
  medicacaoId: string
  residenteId: string
  horarioPrevisto: Date
}

/**
 * As datas de calendário que a janela toca — uma, ou duas quando ela atravessa
 * a meia-noite. É sobre elas que os `HH:mm` do esquema são combinados.
 */
function datasQueAJanelaToca(janela: { inicio: Date; fim: Date }): Date[] {
  const dias: Date[] = []
  const cursor = new Date(janela.inicio)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= janela.fim) {
    dias.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dias
}

function instanteDe(dia: Date, horario: string): Date | null {
  const [hora, minuto] = horario.split(':').map(Number)
  if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null

  const instante = new Date(dia)
  instante.setHours(hora, minuto, 0, 0)
  return instante
}

export function dosesPrevistas(
  prescricoes: PrescricaoParaDerivacao[],
  janela: { inicio: Date; fim: Date }
): DosePrevista[] {
  const dias = datasQueAJanelaToca(janela)
  const doses: DosePrevista[] = []

  for (const prescricao of prescricoes) {
    // `SE_NECESSARIO` não tem dose prevista, por definição: ela é registrada
    // quando a necessidade aparece, e a tela do turno a lista em seção
    // separada.
    if (prescricao.tipo !== 'HORARIO_FIXO') continue

    for (const dia of dias) {
      for (const horario of prescricao.horarios) {
        const instante = instanteDe(dia, horario)
        if (!instante) continue

        // Início inclusivo, fim exclusivo: a dose das 14:00 é da tarde e de
        // mais nenhum turno.
        if (instante < janela.inicio || instante >= janela.fim) continue

        // O dia da semana é o **do instante**, não o da janela: numa janela
        // que atravessa a meia-noite os dois diferem.
        if (
          prescricao.diasSemana.length > 0 &&
          !prescricao.diasSemana.includes(instante.getDay())
        ) {
          continue
        }

        if (instante < prescricao.dataInicio) continue
        if (prescricao.dataFim && instante > prescricao.dataFim) continue

        doses.push({
          medicacaoId: prescricao.id,
          residenteId: prescricao.residenteId,
          horarioPrevisto: instante,
        })
      }
    }
  }

  // Por horário, desempatando por medicação para a ordem ser estável entre
  // carregamentos — o mesmo cuidado que as listagens do prontuário já tomam.
  doses.sort(
    (a, b) =>
      a.horarioPrevisto.getTime() - b.horarioPrevisto.getTime() ||
      a.medicacaoId.localeCompare(b.medicacaoId)
  )

  return doses
}
