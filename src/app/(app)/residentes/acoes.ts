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
import {
  adicionarResponsavel,
  atualizarResponsavel,
  removerResponsavel,
} from '@/modules/residents/responsaveis.service'
import {
  criarAnotacao,
  editarAnotacao,
  retificarAnotacao,
} from '@/modules/residents/anotacoes.service'
import { registrarAvaliacao } from '@/modules/residents/dependencia.service'
import { anexarDocumento, excluirDocumento } from '@/modules/residents/documentos.service'

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

/**
 * O formulário de edição oferece todos os campos do responsável, e é isso que
 * autoriza apagá-los: campo oferecido e deixado em branco chega como `null` e
 * limpa a coluna (ver `texto`, em `src/lib/formulario.ts`). Corrigir um
 * telefone secundário para vazio passa a ser possível pela tela.
 */
export async function acaoAtualizarResponsavel(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarResponsavel(ctx, String(dados.get('id')), {
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

/**
 * Remoção é desativação: `removerResponsavel` grava `ativo: false` e audita o
 * estado anterior. O registro continua no banco — quem foi responsável de um
 * residente é parte da história dele, e a trilha precisa poder mostrá-la.
 */
export async function acaoRemoverResponsavel(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await removerResponsavel(ctx, String(dados.get('id')))
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

/**
 * Correção dentro da janela de 15 minutos, só pelo autor. As duas restrições
 * são do serviço (`editarAnotacao`, em
 * `src/modules/residents/anotacoes.service.ts`), não desta camada: a ficha
 * esconde o botão fora da janela, mas quem recusa é ele.
 */
export async function acaoEditarAnotacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    // `?? ''` e não `!`: campo vazio precisa chegar como string vazia, para o
    // Zod do serviço devolver "Escreva o conteúdo da anotação". Com `!`, o
    // `undefined` viraria a string "undefined" mais adiante.
    await editarAnotacao(ctx, String(dados.get('id')), texto(dados, 'texto') ?? '')
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

/**
 * Depois da janela, o registro antigo não é apagado nem alterado: nasce uma
 * anotação nova apontando para ele. É a regra R3 da spec, e era inalcançável
 * pela tela até agora.
 */
export async function acaoRetificarAnotacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await retificarAnotacao(ctx, String(dados.get('id')), {
      texto: texto(dados, 'texto') ?? '',
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

/**
 * Exclusão lógica: `excluirDocumento` grava `ativo: false`, e o arquivo
 * continua no disco. A tela nunca apaga bytes — um documento removido por
 * engano ainda pode ser recuperado pelo banco, e a trilha de auditoria registra
 * quem removeu.
 *
 * Quem pode ver o documento pode excluí-lo: o serviço chama `exigirPapel` com
 * o mesmo `papeisQuePodemVer` que filtra a listagem. Por isso a ficha oferece o
 * botão em todo documento que ela mostra, sem condição própria.
 */
export async function acaoExcluirDocumento(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await excluirDocumento(ctx, String(dados.get('id')))
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}
