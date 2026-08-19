'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { ErroValidacao } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import { criarResidente, atualizarResidente } from '@/modules/residents/residentes.service'
import { adicionarResponsavel } from '@/modules/residents/responsaveis.service'
import { criarAnotacao } from '@/modules/residents/anotacoes.service'
import { registrarAvaliacao } from '@/modules/residents/dependencia.service'
import { anexarDocumento } from '@/modules/residents/documentos.service'

function texto(dados: FormData, campo: string): string | undefined {
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? undefined : s
}

/**
 * O `T12:00:00` evita o clássico deslocamento de um dia: `new Date('2026-03-12')`
 * é interpretado como meia-noite UTC, o que em fuso brasileiro vira 11 de março.
 */
function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo)
  return valor ? new Date(`${valor}T12:00:00`) : undefined
}

function numero(dados: FormData, campo: string): number | undefined {
  const valor = texto(dados, campo)
  return valor ? Number(valor) : undefined
}

function dadosDoResidente(dados: FormData) {
  return {
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    nomeSocial: texto(dados, 'nomeSocial'),
    dataNascimento: data(dados, 'dataNascimento')!,
    sexo: texto(dados, 'sexo') as 'FEMININO' | 'MASCULINO' | 'OUTRO',
    estadoCivil: texto(dados, 'estadoCivil'),
    naturalidade: texto(dados, 'naturalidade'),
    nacionalidade: texto(dados, 'nacionalidade') ?? 'Brasileira',
    religiao: texto(dados, 'religiao'),
    escolaridade: texto(dados, 'escolaridade'),
    cpf: texto(dados, 'cpf'),
    rg: texto(dados, 'rg'),
    orgaoEmissorRg: texto(dados, 'orgaoEmissorRg'),
    cns: texto(dados, 'cns'),
    dataAdmissao: data(dados, 'dataAdmissao')!,
    origemAdmissao: texto(dados, 'origemAdmissao'),
    motivoAdmissao: texto(dados, 'motivoAdmissao'),
    quarto: texto(dados, 'quarto'),
    leito: texto(dados, 'leito'),
    planoSaude: texto(dados, 'planoSaude'),
    numeroPlanoSaude: texto(dados, 'numeroPlanoSaude'),
    beneficioTipo: texto(dados, 'beneficioTipo') as
      | 'APOSENTADORIA' | 'BPC' | 'PENSAO' | 'NENHUM' | undefined,
    beneficioNumero: texto(dados, 'beneficioNumero'),
    beneficioValor: numero(dados, 'beneficioValor'),
  }
}

export async function acaoCriarResidente(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  let id: string | undefined

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const residente = await criarResidente(ctx, dadosDoResidente(dados))
    id = residente.id
  })

  if (resultado.erro) return resultado

  revalidatePath('/residentes')
  // Fora do `executarAcao`: `redirect` sinaliza lançando, e dentro do try o
  // adaptador o trataria como falha inesperada.
  redirect(`/residentes/${id}`)
}

export async function acaoAtualizarResidente(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = String(dados.get('id'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarResidente(ctx, id, dadosDoResidente(dados))
  })

  revalidatePath(`/residentes/${id}`)
  return resultado
}

export async function acaoAdicionarResponsavel(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await adicionarResponsavel(ctx, {
      residenteId,
      nome: texto(dados, 'nome')!,
      parentesco: texto(dados, 'parentesco')!,
      cpf: texto(dados, 'cpf'),
      telefonePrincipal: texto(dados, 'telefonePrincipal')!,
      telefoneSecundario: texto(dados, 'telefoneSecundario'),
      email: texto(dados, 'email'),
      ehResponsavelLegal: dados.get('ehResponsavelLegal') === 'on',
      ehContatoEmergencia: dados.get('ehContatoEmergencia') === 'on',
      autorizadoVisitar: dados.get('autorizadoVisitar') === 'on',
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoCriarAnotacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarAnotacao(ctx, {
      residenteId,
      categoria: texto(dados, 'categoria') as 'OUTRO',
      texto: texto(dados, 'texto')!,
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoRegistrarAvaliacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarAvaliacao(ctx, {
      residenteId,
      grau: texto(dados, 'grau') as 'I' | 'II' | 'III',
      dataAvaliacao: data(dados, 'dataAvaliacao')!,
      avaliadorNome: texto(dados, 'avaliadorNome')!,
      justificativa: texto(dados, 'justificativa'),
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoAnexarDocumento(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const arquivo = dados.get('arquivo') as File | null
    // `ErroValidacao`, e não `Error`: o adaptador só mostra ao usuário a
    // mensagem de erro de domínio — um `Error` cru viraria "não foi possível
    // concluir a operação", escondendo justamente o que ele precisa corrigir.
    if (!arquivo || arquivo.size === 0) {
      throw new ErroValidacao('Selecione um arquivo')
    }

    await anexarDocumento(ctx, {
      tipo: texto(dados, 'tipo') as 'OUTRO',
      descricao: texto(dados, 'descricao'),
      nomeArquivoOriginal: arquivo.name,
      mimeType: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
      residenteId,
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}
