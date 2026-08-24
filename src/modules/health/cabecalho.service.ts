import { z } from 'zod'
import type {
  Alergia,
  CondicaoCronica,
  Gravidade,
  RestricaoAlimentar,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria, type EntidadeAuditada } from '@/modules/audit/auditoria.service'

/**
 * As três entidades que alimentam o cabeçalho fixo do prontuário — a
 * informação que a equipe precisa ver **antes de encostar na pessoa**, e que
 * por isso não pode estar a três cliques de distância.
 *
 * Ficam num arquivo só porque são a mesma coisa vista de três ângulos: um
 * texto por residente, ativo ou não, sem regra própria. Separá-las em três
 * arquivos daria três vezes o mesmo cabeçalho de imports para vinte linhas de
 * conteúdo cada.
 */

const condicaoSchema = z.object({
  residenteId: z.string().cuid(),
  descricao: z.string().trim().min(3, 'Descreva a condição'),
  cid10: z.string().trim().nullish(),
  dataDiagnostico: z.date().nullish(),
})

const alergiaSchema = z.object({
  residenteId: z.string().cuid(),
  agente: z.string().trim().min(2, 'Informe o agente da alergia'),
  tipo: z.enum(['MEDICAMENTO', 'ALIMENTO', 'OUTRO']),
  gravidade: z.enum(['LEVE', 'MODERADA', 'GRAVE']),
  reacao: z.string().trim().nullish(),
})

const restricaoSchema = z.object({
  residenteId: z.string().cuid(),
  descricao: z.string().trim().min(3, 'Descreva a restrição'),
})

export type DadosCondicaoCronica = z.infer<typeof condicaoSchema>
export type DadosAlergia = z.infer<typeof alergiaSchema>
export type DadosRestricaoAlimentar = z.infer<typeof restricaoSchema>

export type CabecalhoClinico = {
  alergias: Alergia[]
  condicoes: CondicaoCronica[]
  restricoes: RestricaoAlimentar[]
}

/**
 * `GRAVE` antes de `MODERADA` antes de `LEVE`. O enum do Prisma ordena pela
 * ordem de declaração no banco, que aqui coincide com o inverso do que se
 * quer — por isso a ordem é imposta em memória, e não num `orderBy`.
 */
const PESO_GRAVIDADE: Record<Gravidade, number> = { GRAVE: 0, MODERADA: 1, LEVE: 2 }

async function exigirResidente(id: string): Promise<void> {
  const residente = await prisma.residente.findUnique({ where: { id }, select: { id: true } })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
}

export async function registrarCondicaoCronica(
  ctx: Ctx,
  dados: DadosCondicaoCronica
): Promise<CondicaoCronica> {
  exigirPapel(ctx, 'CondicaoCronica', 'COORDENACAO', 'SAUDE')
  const entrada = validar(condicaoSchema, dados)
  await exigirResidente(entrada.residenteId)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.condicaoCronica.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'CondicaoCronica',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { descricao: { de: null, para: criada.descricao } },
    })

    return criada
  })
}

export async function registrarAlergia(ctx: Ctx, dados: DadosAlergia): Promise<Alergia> {
  exigirPapel(ctx, 'Alergia', 'COORDENACAO', 'SAUDE')
  const entrada = validar(alergiaSchema, dados)
  await exigirResidente(entrada.residenteId)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.alergia.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Alergia',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: {
        agente: { de: null, para: criada.agente },
        gravidade: { de: null, para: criada.gravidade },
      },
    })

    return criada
  })
}

export async function registrarRestricaoAlimentar(
  ctx: Ctx,
  dados: DadosRestricaoAlimentar
): Promise<RestricaoAlimentar> {
  exigirPapel(ctx, 'RestricaoAlimentar', 'COORDENACAO', 'SAUDE')
  const entrada = validar(restricaoSchema, dados)
  await exigirResidente(entrada.residenteId)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.restricaoAlimentar.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'RestricaoAlimentar',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { descricao: { de: null, para: criada.descricao } },
    })

    return criada
  })
}

/**
 * As três desativações são o mesmo ato — `ativa: false` mais uma linha de
 * auditoria com o estado anterior — sobre tabelas diferentes. O ramo repetido
 * abaixo é o preço de o Prisma não oferecer um cliente genérico sem que os
 * tipos de cada tabela se percam: escrever as três funções por extenso
 * triplicaria a checagem de existência e a chamada de auditoria, que é
 * justamente a parte onde um descuido não apareceria em teste nenhum.
 *
 * O parâmetro `entidade` é o que vai para a trilha, e é o mesmo valor que
 * `exigirPapel` registra quando a permissão é negada.
 */
async function desativar(
  ctx: Ctx,
  entidade: Extract<EntidadeAuditada, 'CondicaoCronica' | 'Alergia' | 'RestricaoAlimentar'>,
  id: string
): Promise<void> {
  exigirPapel(ctx, entidade, 'COORDENACAO', 'SAUDE')

  const atual =
    entidade === 'CondicaoCronica'
      ? await prisma.condicaoCronica.findUnique({ where: { id } })
      : entidade === 'Alergia'
        ? await prisma.alergia.findUnique({ where: { id } })
        : await prisma.restricaoAlimentar.findUnique({ where: { id } })

  if (!atual || !atual.ativa) throw new ErroNaoEncontrado('Registro não encontrado')

  await prisma.$transaction(async (tx) => {
    if (entidade === 'CondicaoCronica') {
      await tx.condicaoCronica.update({ where: { id }, data: { ativa: false } })
    } else if (entidade === 'Alergia') {
      await tx.alergia.update({ where: { id }, data: { ativa: false } })
    } else {
      await tx.restricaoAlimentar.update({ where: { id }, data: { ativa: false } })
    }

    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade,
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { ativa: { de: true, para: false } },
    })
  })
}

export const desativarCondicaoCronica = (ctx: Ctx, id: string) =>
  desativar(ctx, 'CondicaoCronica', id)
export const desativarAlergia = (ctx: Ctx, id: string) => desativar(ctx, 'Alergia', id)
export const desativarRestricaoAlimentar = (ctx: Ctx, id: string) =>
  desativar(ctx, 'RestricaoAlimentar', id)

export async function obterCabecalhoClinico(
  ctx: Ctx,
  residenteId: string
): Promise<CabecalhoClinico> {
  exigirPapel(ctx, 'Alergia', 'COORDENACAO', 'SAUDE')

  const [alergias, condicoes, restricoes] = await Promise.all([
    prisma.alergia.findMany({ where: { residenteId, ativa: true } }),
    prisma.condicaoCronica.findMany({
      where: { residenteId, ativa: true },
      orderBy: [{ descricao: 'asc' }],
    }),
    prisma.restricaoAlimentar.findMany({
      where: { residenteId, ativa: true },
      orderBy: [{ descricao: 'asc' }],
    }),
  ])

  alergias.sort(
    (a, b) =>
      PESO_GRAVIDADE[a.gravidade] - PESO_GRAVIDADE[b.gravidade] ||
      a.agente.localeCompare(b.agente, 'pt-BR')
  )

  return { alergias, condicoes, restricoes }
}
