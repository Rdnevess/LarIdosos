'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { ErroValidacao } from '@/lib/erros'
import { texto, data, booleano } from '@/lib/formulario'
import { obterCtx } from '@/modules/auth/sessao'
import {
  criarResidente,
  atualizarResidente,
  desligarResidente,
} from '@/modules/residents/residentes.service'
import { dadosDoResidente } from './conversores'
import { adicionarResponsavel } from '@/modules/residents/responsaveis.service'
import { criarAnotacao } from '@/modules/residents/anotacoes.service'
import { registrarAvaliacao } from '@/modules/residents/dependencia.service'
import { anexarDocumento } from '@/modules/residents/documentos.service'

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

export async function acaoDesligarResidente(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = String(dados.get('id'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desligarResidente(ctx, id, {
      // O `as` não afrouxa a validação: `desligamentoSchema` aceita só
      // DESLIGADO e FALECIDO, e qualquer outro valor — inclusive campo vazio
      // — vira `ErroValidacao` com mensagem em português
      // (`src/modules/residents/residentes.schema.ts`).
      status: texto(dados, 'status') as 'DESLIGADO' | 'FALECIDO',
      dataSaida: data(dados, 'dataSaida')!,
      motivoSaida: texto(dados, 'motivoSaida')!,
      observacaoSaida: texto(dados, 'observacaoSaida'),
    })
  })

  // A lista também muda: o residente sai do filtro "Ativos".
  revalidatePath('/residentes')
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
      ehResponsavelLegal: booleano(dados, 'ehResponsavelLegal'),
      ehContatoEmergencia: booleano(dados, 'ehContatoEmergencia'),
      autorizadoVisitar: booleano(dados, 'autorizadoVisitar'),
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
