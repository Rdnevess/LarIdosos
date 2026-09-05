import { z } from 'zod'
import type { CategoriaDespesa, Fornecedor, OrigemReceita } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { validarCpf, validarCnpj, somenteDigitos } from '@/lib/ptbr'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Os três cadastros auxiliares do financeiro: de onde vem o dinheiro, em que
 * se gasta, e para quem se paga.
 *
 * Ficam num arquivo só porque são a mesma forma vista de três ângulos — um
 * nome, um estado de ativação, e nenhuma regra própria além da validação do
 * documento do fornecedor.
 */

const origemSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da origem'),
  // O caso comum é os dois coincidirem, e exigir a digitação dupla seria
  // convidar ao erro que o agrupamento por texto do Excel já pune.
  rotuloPrestacao: z.string().trim().min(2).optional(),
  exigeResidente: z.boolean().optional(),
})

const categoriaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da categoria'),
})

const fornecedorSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome do fornecedor'),
    documento: z.string().trim().transform(somenteDigitos),
    tipoDocumento: z.enum(['CNPJ', 'CPF']),
    telefone: z.string().trim().nullish(),
    email: z.string().trim().email('E-mail inválido').nullish(),
  })
  // O tipo escolhido decide qual verificação roda: um CPF válido não é um
  // CNPJ válido, e o documento errado aqui sai errado na prestação — este
  // cadastro substitui o XLOOKUP quebrado da planilha.
  .refine(
    (d) => (d.tipoDocumento === 'CPF' ? validarCpf(d.documento) : validarCnpj(d.documento)),
    { message: 'Documento inválido para o tipo informado', path: ['documento'] }
  )

export type DadosOrigemReceita = z.input<typeof origemSchema>
/**
 * O nome reduzido ao que ele de fato distingue: sem caixa, sem acento e sem
 * espaço sobrando. "Água e Esgoto", "agua e esgoto" e "ÁGUA  E  ESGOTO" caem
 * todos em `agua e esgoto`.
 *
 * Serve à guarda de duplicata da categoria de despesa, e a nada mais: é
 * comparação, nunca armazenamento. O nome guardado é o que a pessoa digitou,
 * acento e caixa inclusive, porque é ele que sai no documento do órgão.
 */
function nomeNormalizado(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type DadosCategoriaDespesa = z.input<typeof categoriaSchema>
export type DadosFornecedor = z.input<typeof fornecedorSchema>

export async function criarOrigemReceita(
  ctx: Ctx,
  dados: DadosOrigemReceita
): Promise<OrigemReceita> {
  exigirPapel(ctx, 'OrigemReceita', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(origemSchema, dados)

  const rotulo = entrada.rotuloPrestacao ?? entrada.nome
  const existentes = await prisma.origemReceita.findMany({
    select: { nome: true, rotuloPrestacao: true },
  })

  // Mesma regra da categoria de despesa: dois nomes que só diferem por caixa,
  // acento ou espaço são a mesma origem escrita de dois jeitos. Inclui a
  // desativada, senão desativar e recadastrar devolve as duas à base.
  const alvoNome = nomeNormalizado(entrada.nome)
  const nomeIgual = existentes.find((o) => nomeNormalizado(o.nome) === alvoNome)
  if (nomeIgual) {
    throw new ErroValidacao(`Já existe a origem "${nomeIgual.nome}".`)
  }

  // O rótulo é outra história, e copiar a regra do nome aqui quebraria o
  // desenho: **rótulo repetido é intencional**. "Contribuição de residente" e
  // "Doação avulsa" saem as duas como "Doação" na prestação, e é assim que o
  // nome do idoso não vai para o documento entregue ao órgão.
  //
  // O que parte o subtotal não é o rótulo repetido — é o QUASE repetido. A
  // prestação agrupa por igualdade de texto (`porRotulo` em
  // `documento-prestacao.ts`), então "Doação" e "Doaçao" viram duas linhas na
  // conciliação, com o mesmo significado e valores separados. Idêntico passa;
  // parecido, não.
  const alvoRotulo = nomeNormalizado(rotulo)
  const rotuloQuaseIgual = existentes.find(
    (o) => nomeNormalizado(o.rotuloPrestacao) === alvoRotulo && o.rotuloPrestacao !== rotulo
  )
  if (rotuloQuaseIgual) {
    throw new ErroValidacao(
      `O rótulo "${rotulo}" é quase igual a "${rotuloQuaseIgual.rotuloPrestacao}", que já existe. ` +
        `Use exatamente "${rotuloQuaseIgual.rotuloPrestacao}" para somarem na mesma linha, ou escolha um rótulo diferente.`
    )
  }

  return prisma.$transaction(async (tx) => {
    const criada = await tx.origemReceita.create({
      data: {
        nome: entrada.nome,
        rotuloPrestacao: rotulo,
        exigeResidente: entrada.exigeResidente ?? false,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'OrigemReceita',
      entidadeId: criada.id,
      diff: {
        nome: { de: null, para: criada.nome },
        rotuloPrestacao: { de: null, para: criada.rotuloPrestacao },
      },
    })

    return criada
  })
}

export async function listarOrigensReceita(ctx: Ctx): Promise<OrigemReceita[]> {
  exigirPapel(ctx, 'OrigemReceita', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativas = await prisma.origemReceita.findMany({ where: { ativa: true } })
  return ativas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function criarCategoriaDespesa(
  ctx: Ctx,
  dados: DadosCategoriaDespesa
): Promise<CategoriaDespesa> {
  exigirPapel(ctx, 'CategoriaDespesa', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(categoriaSchema, dados)

  // A pendência 3 decidiu não fechar a lista: a equipe cadastra categoria nova
  // sem depender de um deploy que ninguém ali faz. O que se barra aqui é só a
  // duplicata textual — a mesma categoria escrita de outro jeito parte o
  // subtotal da conciliação em duas linhas, e o documento entregue ao órgão
  // mostra "Energia 400,00" e "energia 350,00" onde havia uma despesa só.
  //
  // A comparação inclui a categoria desativada: sem isso, desativar "Energia"
  // e cadastrá-la de novo devolveria as duas à base, uma morta e uma viva,
  // com os lançamentos repartidos entre elas — exatamente a sopa que a
  // desativação tinha ido arrumar.
  const existentes = await prisma.categoriaDespesa.findMany({ select: { nome: true } })
  const alvo = nomeNormalizado(entrada.nome)
  const colidente = existentes.find((c) => nomeNormalizado(c.nome) === alvo)
  if (colidente) {
    throw new ErroValidacao(`Já existe a categoria "${colidente.nome}".`)
  }

  return prisma.$transaction(async (tx) => {
    const criada = await tx.categoriaDespesa.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'CategoriaDespesa',
      entidadeId: criada.id,
      diff: { nome: { de: null, para: criada.nome } },
    })

    return criada
  })
}

export async function listarCategoriasDespesa(ctx: Ctx): Promise<CategoriaDespesa[]> {
  exigirPapel(ctx, 'CategoriaDespesa', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativas = await prisma.categoriaDespesa.findMany({ where: { ativa: true } })
  // Ordem alfabética brasileira: sem o `localeCompare` com `pt-BR`, "Água"
  // cairia depois de "Salário".
  return ativas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Junta duas categorias que são a mesma coisa: reclassifica os lançamentos de
 * `deId` para `paraId` e desativa a de origem.
 *
 * É o conserto que a pendência 3 prescreve, e o motivo de ele não ser só
 * "desativar": desativada, a duplicada some do formulário, mas os lançamentos
 * continuam apontando para ela — e o nome dela continua saindo na conciliação
 * da prestação, que é justamente onde a sopa aparece.
 *
 * **O que não se mexe:** lançamento de prestação FECHADA fica onde está. Um
 * documento já protocolado mostrou "Luz", e vai continuar mostrando "Luz" —
 * reescrever isso seria falsificar o que foi entregue ao órgão. A mesclagem
 * vale dali para frente, e `mantidos` conta quantos ficaram para trás, para
 * que quem operou saiba que a limpeza não foi total.
 */
export async function mesclarCategoriasDespesa(
  ctx: Ctx,
  { deId, paraId }: { deId: string; paraId: string }
): Promise<{ reclassificados: number; mantidos: number }> {
  exigirPapel(ctx, 'CategoriaDespesa', 'COORDENACAO', 'ADMINISTRATIVO')

  if (deId === paraId) {
    throw new ErroValidacao('Escolha duas categorias diferentes.')
  }

  const [de, para] = await Promise.all([
    prisma.categoriaDespesa.findUnique({ where: { id: deId } }),
    prisma.categoriaDespesa.findUnique({ where: { id: paraId } }),
  ])
  if (!de || !para) throw new ErroNaoEncontrado('Categoria não encontrada')

  // A origem pode estar desativada — mesclar depois de desativar é o caminho
  // natural de quem já tinha tentado arrumar. O destino, não: mandar os
  // lançamentos para uma categoria morta trocaria uma duplicada por outra, e
  // eles sumiriam do formulário sem sumir do documento.
  if (!para.ativa) {
    throw new ErroValidacao(`A categoria "${para.nome}" está desativada.`)
  }

  const daOrigem = await prisma.lancamento.findMany({
    where: { categoriaDespesaId: deId },
    select: { id: true, prestacaoContas: { select: { status: true } } },
  })
  const moveis = daOrigem.filter((l) => l.prestacaoContas?.status !== 'FECHADA')
  const mantidos = daOrigem.length - moveis.length

  await prisma.$transaction(async (tx) => {
    if (moveis.length > 0) {
      await tx.lancamento.updateMany({
        where: { id: { in: moveis.map((l) => l.id) } },
        data: { categoriaDespesaId: paraId },
      })
    }
    await tx.categoriaDespesa.update({ where: { id: deId }, data: { ativa: false } })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'CategoriaDespesa',
      entidadeId: deId,
      diff: {
        mescladaEm: { de: de.nome, para: para.nome },
        reclassificados: { de: null, para: String(moveis.length) },
        mantidosPorPrestacaoFechada: { de: null, para: String(mantidos) },
      },
    })
  })

  return { reclassificados: moveis.length, mantidos }
}

/**
 * Junta duas origens que são a mesma coisa: reclassifica os lançamentos de
 * `deId` para `paraId` e desativa a de origem.
 *
 * Gêmea de `mesclarCategoriasDespesa`, e existe pela mesma razão: a guarda de
 * duplicata impede que uma origem repetida ENTRE, mas não desfaz a que já
 * estiver na base. Sem isto, "desativar" seria de novo o meio-caminho que a
 * pendência 3 recusou — a origem some do formulário e continua saindo na
 * prestação pelos lançamentos que ficaram nela.
 *
 * **O efeito aqui é maior do que na categoria.** A conciliação agrupa os
 * recebimentos por `rotuloPrestacao`, então mesclar não muda só um nome numa
 * linha de detalhe: muda **em que subtotal o dinheiro entra**. É por isso que
 * o destino é escolhido pela pessoa, e não deduzido pelo sistema.
 *
 * **O que não se mexe:** lançamento de prestação FECHADA fica onde está. O
 * documento entregue mostrou aquele rótulo, e vai continuar mostrando.
 * `mantidos` conta quantos ficaram para trás.
 */
export async function mesclarOrigensReceita(
  ctx: Ctx,
  { deId, paraId }: { deId: string; paraId: string }
): Promise<{ reclassificados: number; mantidos: number }> {
  exigirPapel(ctx, 'OrigemReceita', 'COORDENACAO', 'ADMINISTRATIVO')

  if (deId === paraId) {
    throw new ErroValidacao('Escolha duas origens diferentes.')
  }

  const [de, para] = await Promise.all([
    prisma.origemReceita.findUnique({ where: { id: deId } }),
    prisma.origemReceita.findUnique({ where: { id: paraId } }),
  ])
  if (!de || !para) throw new ErroNaoEncontrado('Origem não encontrada')

  if (!para.ativa) {
    throw new ErroValidacao(`A origem "${para.nome}" está desativada.`)
  }

  const daOrigem = await prisma.lancamento.findMany({
    where: { origemReceitaId: deId },
    select: { id: true, prestacaoContas: { select: { status: true } } },
  })
  const moveis = daOrigem.filter((l) => l.prestacaoContas?.status !== 'FECHADA')
  const mantidos = daOrigem.length - moveis.length

  await prisma.$transaction(async (tx) => {
    if (moveis.length > 0) {
      await tx.lancamento.updateMany({
        where: { id: { in: moveis.map((l) => l.id) } },
        data: { origemReceitaId: paraId },
      })
    }
    await tx.origemReceita.update({ where: { id: deId }, data: { ativa: false } })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'OrigemReceita',
      entidadeId: deId,
      diff: {
        mescladaEm: { de: de.nome, para: para.nome },
        rotuloPassaASer: { de: de.rotuloPrestacao, para: para.rotuloPrestacao },
        reclassificados: { de: null, para: String(moveis.length) },
        mantidosPorPrestacaoFechada: { de: null, para: String(mantidos) },
      },
    })
  })

  return { reclassificados: moveis.length, mantidos }
}

export async function criarFornecedor(
  ctx: Ctx,
  dados: DadosFornecedor
): Promise<Fornecedor> {
  exigirPapel(ctx, 'Fornecedor', 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(fornecedorSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.fornecedor.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Fornecedor',
      entidadeId: criado.id,
      diff: { nome: { de: null, para: criado.nome } },
    })

    return criado
  })
}

export async function listarFornecedores(ctx: Ctx): Promise<Fornecedor[]> {
  exigirPapel(ctx, 'Fornecedor', 'COORDENACAO', 'ADMINISTRATIVO')

  const ativos = await prisma.fornecedor.findMany({ where: { ativo: true } })
  return ativos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * As três desativações são o mesmo ato sobre tabelas diferentes, e o Prisma
 * não dá um cliente genérico sem que os tipos de cada tabela se percam. O ramo
 * repetido é o preço de manter a checagem de existência e a chamada de
 * auditoria escritas uma vez — que é a parte onde um descuido não apareceria
 * em teste nenhum.
 */
async function desativar(
  ctx: Ctx,
  entidade: 'OrigemReceita' | 'CategoriaDespesa' | 'Fornecedor',
  id: string
): Promise<void> {
  exigirPapel(ctx, entidade, 'COORDENACAO', 'ADMINISTRATIVO')

  const atual =
    entidade === 'OrigemReceita'
      ? await prisma.origemReceita.findUnique({ where: { id } })
      : entidade === 'CategoriaDespesa'
        ? await prisma.categoriaDespesa.findUnique({ where: { id } })
        : await prisma.fornecedor.findUnique({ where: { id } })

  const estaAtivo =
    atual && ('ativa' in atual ? atual.ativa : atual.ativo)
  if (!atual || !estaAtivo) throw new ErroNaoEncontrado('Registro não encontrado')

  await prisma.$transaction(async (tx) => {
    if (entidade === 'OrigemReceita') {
      await tx.origemReceita.update({ where: { id }, data: { ativa: false } })
    } else if (entidade === 'CategoriaDespesa') {
      await tx.categoriaDespesa.update({ where: { id }, data: { ativa: false } })
    } else {
      await tx.fornecedor.update({ where: { id }, data: { ativo: false } })
    }

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade,
      entidadeId: id,
      diff: { ativo: { de: true, para: false } },
    })
  })
}

export const desativarOrigemReceita = (ctx: Ctx, id: string) =>
  desativar(ctx, 'OrigemReceita', id)
export const desativarCategoriaDespesa = (ctx: Ctx, id: string) =>
  desativar(ctx, 'CategoriaDespesa', id)
export const desativarFornecedor = (ctx: Ctx, id: string) =>
  desativar(ctx, 'Fornecedor', id)
