'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { texto, data, numero } from '@/lib/formulario'
// A divisão do dia mora em `@/lib/turno` desde a Fase 2B: as anotações de
// saúde e a tela do turno precisam da mesma resposta para "em que turno isso
// aconteceu?". O turno continua sendo só o palpite inicial aqui — o
// formulário o deixa editável.
import { turnoDaHora } from '@/lib/turno'
import { obterCtx } from '@/modules/auth/sessao'
import {
  registrarAlergia,
  registrarCondicaoCronica,
  registrarRestricaoAlimentar,
  desativarAlergia,
  desativarCondicaoCronica,
  desativarRestricaoAlimentar,
} from '@/modules/health/cabecalho.service'
import {
  criarAnotacaoSaude,
  editarAnotacaoSaude,
  retificarAnotacaoSaude,
} from '@/modules/health/anotacoes-saude.service'
import { registrarSinalVital } from '@/modules/health/sinais-vitais.service'
import { registrarExame, atualizarExame } from '@/modules/health/exames.service'
import { registrarConsulta, atualizarConsulta } from '@/modules/health/consultas.service'
import { registrarVacina } from '@/modules/health/vacinas.service'
import {
  prescrever,
  suspenderMedicacao,
  prescreverSubstituta,
} from '@/modules/health/medicacoes.service'

/**
 * Server Actions do prontuário. Ficam aqui, e não junto das da ficha
 * cadastral (`../../acoes.ts`), porque a fronteira de permissão é outra: tudo
 * neste arquivo exige COORDENACAO ou SAUDE, e o ADMINISTRATIVO é recusado no
 * serviço.
 */

function caminho(residenteId: string): string {
  return `/residentes/${residenteId}/prontuario`
}

export async function acaoRegistrarAlergia(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarAlergia(ctx, {
      residenteId,
      agente: texto(dados, 'agente')!,
      tipo: texto(dados, 'tipo') as 'MEDICAMENTO' | 'ALIMENTO' | 'OUTRO',
      gravidade: texto(dados, 'gravidade') as 'LEVE' | 'MODERADA' | 'GRAVE',
      reacao: texto(dados, 'reacao'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarCondicaoCronica(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarCondicaoCronica(ctx, {
      residenteId,
      descricao: texto(dados, 'descricao')!,
      cid10: texto(dados, 'cid10'),
      dataDiagnostico: data(dados, 'dataDiagnostico'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarRestricaoAlimentar(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarRestricaoAlimentar(ctx, {
      residenteId,
      descricao: texto(dados, 'descricao')!,
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

/**
 * As três desativações são o mesmo formulário com um `id` oculto. Retirar do
 * cabeçalho é ato frequente — alergia que se confirmou não existir, condição
 * que deixou de ser tratada — e a exclusão é lógica: o registro fica no banco
 * e na trilha.
 */
export async function acaoDesativarAlergia(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarAlergia(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoDesativarCondicaoCronica(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarCondicaoCronica(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoDesativarRestricaoAlimentar(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarRestricaoAlimentar(ctx, String(dados.get('id')))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

/**
 * Data e hora vêm preenchidas com o agora no formulário, mas continuam
 * editáveis: o registro retroativo da madrugada é o caso que a §9 do design
 * protege. Sem campo, cai no agora.
 */
function momentoDoFormulario(dados: FormData, campo: string): Date {
  const valor = texto(dados, campo)
  if (!valor) return new Date()
  const quando = new Date(valor)
  return Number.isNaN(quando.getTime()) ? new Date() : quando
}

type CategoriaSaude =
  | 'EVOLUCAO' | 'INTERCORRENCIA' | 'ALIMENTACAO' | 'SONO'
  | 'HIGIENE' | 'COMPORTAMENTO' | 'QUEDA'

export async function acaoCriarAnotacaoSaude(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const ocorridoEm = momentoDoFormulario(dados, 'ocorridoEm')
    const turno = texto(dados, 'turno')

    await criarAnotacaoSaude(ctx, {
      residenteId,
      categoria: texto(dados, 'categoria') as CategoriaSaude,
      turno: (turno as 'MANHA' | 'TARDE' | 'NOITE') || turnoDaHora(ocorridoEm),
      texto: texto(dados, 'texto')!,
      gravidade: texto(dados, 'gravidade') as 'LEVE' | 'MODERADA' | 'GRAVE' | null,
      conduta: texto(dados, 'conduta'),
      ocorridoEm,
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoEditarAnotacaoSaude(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await editarAnotacaoSaude(ctx, String(dados.get('id')), texto(dados, 'texto') ?? '')
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRetificarAnotacaoSaude(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await retificarAnotacaoSaude(ctx, String(dados.get('id')), {
      texto: texto(dados, 'texto') ?? '',
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarSinalVital(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarSinalVital(ctx, {
      residenteId,
      aferidoEm: momentoDoFormulario(dados, 'aferidoEm'),
      pressaoSistolica: numero(dados, 'pressaoSistolica'),
      pressaoDiastolica: numero(dados, 'pressaoDiastolica'),
      frequenciaCardiaca: numero(dados, 'frequenciaCardiaca'),
      frequenciaRespiratoria: numero(dados, 'frequenciaRespiratoria'),
      temperatura: numero(dados, 'temperatura'),
      saturacaoO2: numero(dados, 'saturacaoO2'),
      glicemia: numero(dados, 'glicemia'),
      peso: numero(dados, 'peso'),
      observacao: texto(dados, 'observacao'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

type StatusExame =
  | 'SOLICITADO' | 'AGENDADO' | 'REALIZADO' | 'RESULTADO_RECEBIDO' | 'CANCELADO'

export async function acaoRegistrarExame(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarExame(ctx, {
      residenteId,
      tipo: texto(dados, 'tipo')!,
      dataSolicitacao: data(dados, 'dataSolicitacao'),
      solicitanteNome: texto(dados, 'solicitanteNome'),
      laboratorio: texto(dados, 'laboratorio'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoAtualizarExame(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarExame(ctx, String(dados.get('id')), {
      status: texto(dados, 'status') as StatusExame,
      dataRealizacao: data(dados, 'dataRealizacao'),
      dataResultado: data(dados, 'dataResultado'),
      resumoResultado: texto(dados, 'resumoResultado'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarConsulta(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarConsulta(ctx, {
      residenteId,
      dataHora: momentoDoFormulario(dados, 'dataHora'),
      especialidade: texto(dados, 'especialidade')!,
      profissional: texto(dados, 'profissional'),
      local: texto(dados, 'local'),
      motivo: texto(dados, 'motivo'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoAtualizarConsulta(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarConsulta(ctx, String(dados.get('id')), {
      status: texto(dados, 'status') as 'AGENDADA' | 'REALIZADA' | 'CANCELADA',
      conduta: texto(dados, 'conduta'),
      encaminhamento: texto(dados, 'encaminhamento'),
      dataRetorno: data(dados, 'dataRetorno'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoRegistrarVacina(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarVacina(ctx, {
      residenteId,
      imunizante: texto(dados, 'imunizante')!,
      dose: texto(dados, 'dose')!,
      dataAplicacao: data(dados, 'dataAplicacao')!,
      lote: texto(dados, 'lote'),
      localAplicacao: texto(dados, 'localAplicacao'),
    })
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

type ViaMedicacao =
  | 'ORAL' | 'SUBLINGUAL' | 'IM' | 'EV' | 'SC'
  | 'TOPICA' | 'INALATORIA' | 'OFTALMICA' | 'OTOLOGICA' | 'RETAL'

/**
 * O formulário recebe os horários como texto separado por vírgula — é o que a
 * equipe escreve ao ler a receita ("08:00, 20:00"). A lista tipada começa
 * aqui, e o schema do serviço recusa qualquer item fora de `HH:mm`.
 */
function listaDeHorarios(dados: FormData): string[] {
  return (texto(dados, 'horarios') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h !== '')
}

function dadosDaMedicacao(dados: FormData, residenteId: string) {
  return {
    residenteId,
    farmaco: texto(dados, 'farmaco')!,
    concentracao: texto(dados, 'concentracao'),
    formaFarmaceutica: texto(dados, 'formaFarmaceutica'),
    dose: texto(dados, 'dose')!,
    via: texto(dados, 'via') as ViaMedicacao,
    tipo: texto(dados, 'tipo') as 'HORARIO_FIXO' | 'SE_NECESSARIO',
    horarios: listaDeHorarios(dados),
    diasSemana: [] as number[],
    instrucoes: texto(dados, 'instrucoes'),
    prescritorNome: texto(dados, 'prescritorNome'),
    // A receita costuma ser anterior ao momento em que alguém a digita, e a
    // vigência é o que decide quais doses existem: sem este campo, uma receita
    // do café da manhã cadastrada às 10h perderia a dose das 08:00 de hoje.
    // Em branco, vale a partir de agora.
    dataInicio: momentoDoFormulario(dados, 'dataInicio'),
  }
}

export async function acaoPrescrever(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await prescrever(ctx, dadosDaMedicacao(dados, residenteId))
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

export async function acaoSuspenderMedicacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await suspenderMedicacao(ctx, String(dados.get('id')), texto(dados, 'motivo') ?? '')
  })

  revalidatePath(caminho(residenteId))
  return resultado
}

/**
 * O segundo passo dos dois que a R5 exige, e o único caminho que grava o elo
 * `substituiMedicacaoId`. Uma prescrição criada pelo formulário comum não o
 * recebe, porque não é substituição de nada.
 */
export async function acaoPrescreverSubstituta(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await prescreverSubstituta(
      ctx,
      String(dados.get('idAnterior')),
      dadosDaMedicacao(dados, residenteId)
    )
  })

  revalidatePath(caminho(residenteId))
  return resultado
}
