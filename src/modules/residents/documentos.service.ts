import { z } from 'zod'
import { TipoDocumento } from '@prisma/client'
import type { Documento, Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { salvarArquivo, lerArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { dispararRegistroDeAcessoNegado } from '@/modules/audit/acesso-negado'

const TODOS: Papel[] = ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO']
const CLINICO: Papel[] = ['COORDENACAO', 'SAUDE']
const FINANCEIRO_E_PESSOAL: Papel[] = ['COORDENACAO', 'ADMINISTRATIVO']
// Lista vazia significa ninguém: `exigirPapel` recusa todo papel, e
// `tiposQuePodeAnexar` não oferece o tipo. É como a política diz "esta
// combinação não existe" sem que a tela precise de uma exceção própria.
const NINGUEM: Papel[] = []

/**
 * A ordem das checagens importa e é deliberada: o vínculo com funcionário vem
 * ANTES do tipo. Um laudo de funcionário — atestado, perícia — é assunto de
 * pessoal, não da equipe que cuida dos idosos; por isso fica visível ao
 * ADMINISTRATIVO e oculto ao SAUDE, ao contrário do laudo de um residente.
 * Inverter esses dois ifs abriria prontuário de funcionário à equipe clínica.
 *
 * Pelo mesmo motivo, a exceção do CONSELHO_PROFISSIONAL vem depois do vínculo:
 * o registro em conselho de um funcionário é documento legítimo de pessoal.
 */
export function papeisQuePodemVer(documento: {
  tipo: TipoDocumento
  funcionarioId: string | null
}): Papel[] {
  if (documento.funcionarioId) return FINANCEIRO_E_PESSOAL
  // O registro em conselho é o vínculo do profissional com o órgão de classe;
  // não existe para quem mora aqui. Chegando neste ponto, o alvo é residente —
  // combinação que `anexoSchema` recusa ao gravar e que ninguém enxerga. É
  // esse vazio que tira "Registro em conselho" do seletor da ficha, porque
  // `tiposQuePodeAnexar` deriva daqui em vez de repetir a regra.
  if (documento.tipo === 'CONSELHO_PROFISSIONAL') return NINGUEM
  if (documento.tipo === 'EXAME' || documento.tipo === 'LAUDO') return CLINICO
  if (documento.tipo === 'COMPROVANTE_FISCAL') return FINANCEIRO_E_PESSOAL
  return TODOS
}

/**
 * Tipos que `papel` pode anexar ao alvo informado.
 *
 * Derivado de `papeisQuePodemVer`, consultando-a — não é uma segunda lista de
 * permissões. Era essa segunda lista que fazia a ficha esconder o formulário
 * de anexo justamente do papel SAUDE, autorizado a anexar EXAME e LAUDO, e o
 * seletor omitir os três tipos restritos: a enfermeira não conseguia anexar o
 * laudo do grau de dependência, documento que a fiscalização sanitária cobra.
 *
 * O universo vem de `Object.values(TipoDocumento)`, o enum gerado pelo Prisma
 * a partir de `prisma/schema.prisma`: um tipo novo no schema entra aqui
 * sozinho, e o `Record<TipoDocumento, string>` de `ROTULO_TIPO_DOCUMENTO`
 * (`src/lib/ptbr.ts`) quebra o typecheck se ele não tiver rótulo.
 *
 * O alvo importa porque `papeisQuePodemVer` testa `funcionarioId` ANTES do
 * tipo — um LAUDO de funcionário é assunto de pessoal, não da equipe clínica.
 * Passar o alvo adiante em vez de assumir residente preserva essa ordem.
 */
export function tiposQuePodeAnexar(
  papel: Papel,
  alvo: { funcionarioId?: string | null } = {}
): TipoDocumento[] {
  return Object.values(TipoDocumento).filter((tipo) =>
    papeisQuePodemVer({ tipo, funcionarioId: alvo.funcionarioId ?? null }).includes(papel)
  )
}

const anexoSchema = z
  .object({
    tipo: z.enum([
      'RG', 'CPF', 'CNS', 'CERTIDAO', 'LAUDO', 'PROCURACAO',
      'TERMO_RESPONSABILIDADE', 'TERMO_LGPD', 'FOTO', 'EXAME',
      'COMPROVANTE_FISCAL', 'CONSELHO_PROFISSIONAL', 'OUTRO',
    ]),
    descricao: z.string().trim().nullish(),
    nomeArquivoOriginal: z.string().trim().min(1, 'Informe o nome do arquivo'),
    mimeType: z.string().trim().min(1),
    conteudo: z.instanceof(Buffer),
    residenteId: z.string().cuid().optional(),
    funcionarioId: z.string().cuid().optional(),
  })
  .refine((d) => Boolean(d.residenteId) !== Boolean(d.funcionarioId), {
    message: 'Informe exatamente um vínculo: residente ou funcionário',
  })
  // A tela deixou de oferecer o tipo na ficha do residente, mas quem monta o
  // POST à mão escolhe o que quiser. Sem esta recusa, o documento entraria no
  // banco numa combinação que `papeisQuePodemVer` esconde de todo mundo — e
  // ficaria lá, invisível e impossível de excluir pela tela.
  .refine((d) => d.tipo !== 'CONSELHO_PROFISSIONAL' || Boolean(d.funcionarioId), {
    message: 'Registro em conselho pertence ao cadastro do funcionário',
  })

export type DadosAnexo = z.input<typeof anexoSchema>

export async function anexarDocumento(ctx: Ctx, dados: DadosAnexo): Promise<Documento> {
  const entrada = validar(anexoSchema, dados)
  exigirPapel(
    ctx,
    'Documento',
    ...papeisQuePodemVer({
      tipo: entrada.tipo,
      funcionarioId: entrada.funcionarioId ?? null,
    })
  )

  // Confere o vínculo ANTES de gravar bytes. Sem isso, um `residenteId`
  // inexistente só falharia na chave estrangeira do insert — depois do arquivo
  // já estar no disco, sem registro e sem ninguém para limpá-lo.
  //
  // A checagem do funcionário é simétrica e faltava. Até a migration
  // `documento_funcionario_fk`, `funcionarioId` não tinha nem chave
  // estrangeira: um id inexistente entrava no banco e nem no insert falhava —
  // o documento ficava vinculado a ninguém, e `papeisQuePodemVer`, que testa
  // `funcionarioId` antes do tipo, continuava tratando-o como assunto de
  // pessoal para sempre.
  if (entrada.residenteId) {
    const residente = await prisma.residente.findUnique({
      where: { id: entrada.residenteId },
      select: { id: true },
    })
    if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
  }

  if (entrada.funcionarioId) {
    const funcionario = await prisma.funcionario.findUnique({
      where: { id: entrada.funcionarioId },
      select: { id: true },
    })
    if (!funcionario) throw new ErroNaoEncontrado('Funcionário não encontrado')
  }

  const salvo = await salvarArquivo(entrada.conteudo, entrada.mimeType)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.documento.create({
      data: {
        tipo: entrada.tipo,
        descricao: entrada.descricao,
        nomeArquivoOriginal: entrada.nomeArquivoOriginal,
        caminhoArmazenamento: salvo.caminhoRelativo,
        mimeType: entrada.mimeType,
        tamanhoBytes: salvo.tamanhoBytes,
        hashSha256: salvo.hashSha256,
        residenteId: entrada.residenteId,
        funcionarioId: entrada.funcionarioId,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Documento',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { tipo: { de: null, para: criado.tipo } },
    })

    return criado
  })
}

/**
 * Aceita os três papéis por desenho: a permissão real é por documento
 * (`papeisQuePodemVer`), não por tela. Recusar a listagem inteira para quem
 * não pode ver um tipo específico vazaria por omissão a existência desse
 * documento — por isso a função filtra o resultado em vez de recusar o
 * acesso.
 *
 * **Não audita, e o motivo não é o das outras listagens.** A regra do projeto
 * dá duas saídas para leitura de dado sensível — minimizar campos ou registrar
 * o acesso — e aqui nenhuma das duas é o que decide: o dado sensível de um
 * documento é o **conteúdo do arquivo**, e ele não passa por aqui. Esta função
 * devolve metadado (tipo, nome original, data, tamanho, hash); quem lê os
 * bytes é `obterDocumentoParaDownload`, logo abaixo, e essa leitura registra
 * `DOWNLOAD` a cada vez. O acesso à ficha que dispara esta listagem também já
 * deixa rastro, por `obterResidente`
 * (`src/modules/residents/residentes.service.ts:55-60`, que registra
 * `VISUALIZAR`). Auditar aqui somaria uma linha a cada abertura de ficha sem
 * acrescentar rastro nenhum que as duas outras não deem — o mesmo raciocínio
 * de `listarResponsaveis`.
 *
 * **Essa justificativa só vale hoje para `alvo.residenteId`.** A função
 * também aceita `alvo.funcionarioId`, mas nenhuma tela chama esse caminho —
 * só testes (grep em `src/app/**`). Se um dia existir uma ficha de
 * funcionário que liste os documentos dele, o rastro compensatório não vem
 * de graça: `obterFuncionario` (`funcionarios.service.ts:54`, que audita
 * `VISUALIZAR` em `58-62`) só cobre o caso se essa tela realmente chamar
 * `obterFuncionario` antes de listar. Confirme isso — ou audite
 * `listarDocumentos` para esse alvo — antes de assumir que a omissão
 * continua correta.
 */
export async function listarDocumentos(
  ctx: Ctx,
  alvo: { residenteId?: string; funcionarioId?: string }
): Promise<Documento[]> {
  exigirPapel(ctx, 'Documento', ...TODOS)

  // Sem isso, `alvo` vazio produziria `where: { ativo: true }` — o Prisma ignora
  // chaves `undefined` — e a função varreria todos os documentos de todos os
  // residentes e funcionários. O contrato é "escopo em um alvo"; esta validação
  // é o que impede uma varredura global silenciosa.
  if (Boolean(alvo.residenteId) === Boolean(alvo.funcionarioId)) {
    throw new ErroValidacao('Informe exatamente um vínculo: residente ou funcionário')
  }

  const documentos = await prisma.documento.findMany({
    where: alvo.residenteId
      ? { residenteId: alvo.residenteId, ativo: true }
      : { funcionarioId: alvo.funcionarioId, ativo: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
  })

  return documentos.filter((documento) =>
    papeisQuePodemVer(documento).includes(ctx.papel)
  )
}

export async function excluirDocumento(ctx: Ctx, id: string): Promise<void> {
  const documento = await prisma.documento.findUnique({ where: { id } })
  if (!documento || !documento.ativo) {
    throw new ErroNaoEncontrado('Documento não encontrado')
  }

  exigirPapel(ctx, 'Documento', ...papeisQuePodemVer(documento))

  await prisma.$transaction(async (tx) => {
    await tx.documento.update({ where: { id }, data: { ativo: false } })

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade: 'Documento',
      entidadeId: id,
      residenteId: documento.residenteId ?? undefined,
      diff: { ativo: { de: documento.ativo, para: false } },
    })
  })
}

export async function obterDocumentoParaDownload(
  ctx: Ctx,
  id: string
): Promise<{ documento: Documento; conteudo: Buffer }> {
  const documento = await prisma.documento.findUnique({ where: { id } })
  if (!documento || !documento.ativo) {
    throw new ErroNaoEncontrado('Documento não encontrado')
  }

  if (!papeisQuePodemVer(documento).includes(ctx.papel)) {
    // Aqui os papeis saem de `papeisQuePodemVer`, que decide por documento —
    // `exigirPapel` recebe uma lista estatica e nao serve. O registro entao
    // parte daqui, para que a tentativa negada deixe rastro como a bem
    // sucedida ja deixava.
    dispararRegistroDeAcessoNegado(ctx, 'Documento')
    throw new ErroPermissao()
  }

  const conteudo = await lerArquivo(documento.caminhoArmazenamento)

  await registrarAuditoria(prisma, ctx, {
    acao: 'DOWNLOAD',
    entidade: 'Documento',
    entidadeId: id,
    residenteId: documento.residenteId ?? undefined,
  })

  return { documento, conteudo }
}
