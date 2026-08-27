import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import type { Ctx } from '@/lib/contexto'
import { janelaDoTurno, turnoAnterior } from '@/lib/turno'
import { prescrever, type DadosMedicacao } from './medicacoes.service'
import {
  registrarAdministracao,
  listarAdministracoes,
  ehRegistroTardio,
} from './administracao.service'

async function prescricaoDeTeste(ctx: Ctx, campos: Partial<DadosMedicacao> = {}) {
  const residente = await criarResidenteDeTeste()
  const medicacao = await prescrever(ctx, {
    residenteId: residente.id,
    farmaco: 'Losartana',
    dose: '1 comprimido',
    via: 'ORAL',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00'],
    diasSemana: [],
    dataInicio: new Date('2026-08-01T00:00:00'),
    ...campos,
  })
  return { residente, medicacao }
}

describe('registrarAdministracao', () => {
  it('registra a dose do turno corrente sem exigir nada além do status', async () => {
    // O "um toque" que o design promete: no turno corrente, marcar
    // administrada é um clique, sem campo nenhum.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(),
      status: 'ADMINISTRADA',
    })

    expect(registro.status).toBe('ADMINISTRADA')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'AdministracaoMedicacao', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa registro tardio sem observação, e diz por quê', async () => {
    // Registro tardio é livre, e exige justificativa: sem ela, maquiar o
    // relatório de aderência no fim do mês não deixaria rastro na tela.
    //
    // A mensagem é asserida porque é o que a pessoa de plantão lê, e porque
    // ela já esteve errada: dizia "de um turno que já passou" depois que a
    // regra deixou de disparar em turno passado.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(/ficou sem registro até o turno dela voltar/)
  })

  it('não exige justificativa para a dose do turno anterior', async () => {
    // **É a regra que o Lar pediu, e o gate que ela destravou.** Registrar no
    // plantão seguinte é o trabalho normal de quem entra e encontra pendência;
    // exigir justificativa ali põe atrito exatamente em quem está resolvendo o
    // problema.
    //
    // Ancorado no turno anterior a agora, e não num número de horas: a
    // asserção precisa valer a qualquer hora que a suíte rode, e a largura do
    // turno já mudou uma vez.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const anterior = turnoAnterior(janelaDoTurno(new Date()))
    const doseDoTurnoAnterior = new Date(anterior.inicio.getTime() + 60_000)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: doseDoTurnoAnterior,
      status: 'ADMINISTRADA',
    })

    expect(registro.observacao).toBeNull()
  })

  it('aceita registro de turno passado com observação', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status: 'ADMINISTRADA',
      observacao: 'Dose dada no plantão, registrada só agora.',
    })

    expect(registro.observacao).toContain('registrada só agora')
  })

  it('exige motivo quando não foi administrada', async () => {
    // "Não administrada" sem motivo é meia informação: quem lê o prontuário
    // depois precisa saber se faltou remédio ou se o idoso estava internado.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'NAO_ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)

    const comMotivo = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(),
      status: 'NAO_ADMINISTRADA',
      motivo: 'MEDICAMENTO_EM_FALTA',
    })
    expect(comMotivo.motivo).toBe('MEDICAMENTO_EM_FALTA')
  })

  it('impede dupla marcação da mesma dose', async () => {
    // A regra R4 em ação: duas pessoas com a tela do turno aberta ao mesmo
    // tempo, e a mensagem diz o que aconteceu de verdade.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)
    const dose = new Date()

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: dose,
      status: 'ADMINISTRADA',
    })

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: dose,
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(/já foi registrada/)
  })

  it('deixa registrar SE_NECESSARIO quantas vezes for preciso', async () => {
    // `horarioPrevisto` nulo, e o Postgres trata nulos como distintos na
    // restrição única — o comportamento que "se necessário" pede.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx, {
      tipo: 'SE_NECESSARIO',
      horarios: [],
      farmaco: 'Dipirona',
    })

    for (let i = 0; i < 3; i += 1) {
      await registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: null,
        status: 'ADMINISTRADA',
        observacao: 'Queixa de dor.',
      })
    }

    const registros = await prisma.administracaoMedicacao.findMany({
      where: { medicacaoId: medicacao.id },
    })
    expect(registros).toHaveLength(3)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(saude)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarAdministracoes', () => {
  it('traz só o que caiu na janela', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date('2026-08-24T08:00:00'),
      status: 'ADMINISTRADA',
      observacao: 'Registro retroativo de teste.',
    })

    const dentro = await listarAdministracoes(ctx, {
      inicio: new Date('2026-08-24T06:00:00'),
      fim: new Date('2026-08-24T14:00:00'),
    })
    const fora = await listarAdministracoes(ctx, {
      inicio: new Date('2026-08-24T14:00:00'),
      fim: new Date('2026-08-24T22:00:00'),
    })

    expect(dentro).toHaveLength(1)
    expect(fora).toHaveLength(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      listarAdministracoes(ctx, { inicio: new Date(), fim: new Date() })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('ehRegistroTardio', () => {
  it('atraso para o turno seguinte é normal, e não é sinalizado', () => {
    // O critério é a rotação da equipe, e não o relógio: quem está de plantão à
    // noite registrando uma dose do dia está fazendo o trabalho normal do
    // plantão. Sinalizar isso encheria o relatório do que acontece todo dia.
    const dose = new Date('2026-08-24T08:00:00') // turno DIA, 6h-18h
    expect(ehRegistroTardio(dose, new Date('2026-08-24T09:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-24T20:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-25T05:59:00'))).toBe(false)
  })

  it('é tardio quando o turno de origem volta e o registro ainda não veio', () => {
    // O caso que o Lar descreveu: um remédio do turno do dia que ninguém
    // administrou, e que alguém tenta registrar só no dia seguinte. Aí a
    // equipe do dia já voltou, e encontrou a dose sem registro — é isso que o
    // relatório precisa mostrar.
    const dose = new Date('2026-08-24T08:00:00') // turno DIA, 6h-18h
    expect(ehRegistroTardio(dose, new Date('2026-08-25T06:00:00'))).toBe(true)
    expect(ehRegistroTardio(dose, new Date('2026-08-25T14:00:00'))).toBe(true)
    expect(ehRegistroTardio(dose, new Date('2026-08-26T10:00:00'))).toBe(true)
  })

  it('vale igual para a noite, que atravessa a meia-noite', () => {
    // A janela da noite é a única partida em dois dias do calendário, e é onde
    // uma implementação ingênua erra. A dose das 23:00 pertence à noite que
    // começou às 18:00 do dia 24; essa noite volta às 18:00 do dia 25.
    const dose = new Date('2026-08-24T23:00:00')
    expect(ehRegistroTardio(dose, new Date('2026-08-25T03:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-25T10:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-25T17:59:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-25T18:00:00'))).toBe(true)
  })

  it('o limite em horas varia com a posição da dose dentro do turno', () => {
    // Propriedade registrada, e não defeito: o critério é "o turno de origem
    // voltou", então o equivalente em horas vai de doze a vinte e quatro
    // conforme onde a dose caiu na janela. Uma dose do fim do turno tem menos
    // folga que uma do começo, porque as duas esperam o mesmo instante — o
    // retorno do turno.
    //
    // É diferente do defeito que a regra antiga tinha, em que 1h30 era tardia
    // e 9h não era. Aqui o que se mede é uma rotação inteira, e a variação é a
    // largura do próprio turno.
    const inicioDoTurno = new Date('2026-08-24T06:00:00')
    const fimDoTurno = new Date('2026-08-24T17:00:00')
    const voltaDoDia = new Date('2026-08-25T06:00:00')

    expect(ehRegistroTardio(inicioDoTurno, voltaDoDia)).toBe(true) // 24h
    expect(ehRegistroTardio(fimDoTurno, voltaDoDia)).toBe(true) // 13h
    expect(ehRegistroTardio(fimDoTurno, new Date('2026-08-25T05:59:00'))).toBe(false)
  })

  it('registro adiantado não é tardio', () => {
    // Registrar antes da hora prevista é outra coisa — pode ser a dose dada um
    // pouco cedo, e chamá-la de "tardia" seria mentira.
    const dose = new Date('2026-08-24T08:00:00')
    expect(ehRegistroTardio(dose, new Date('2026-08-24T07:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-23T20:00:00'))).toBe(false)
  })

  it('SE_NECESSARIO nunca é tardia', () => {
    // Sem `horarioPrevisto` não há turno de referência: ela é registrada
    // quando acontece.
    expect(ehRegistroTardio(null, new Date())).toBe(false)
  })
})
