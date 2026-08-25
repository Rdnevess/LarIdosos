import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { exigirPapel } from '@/lib/contexto'
import { ErroPermissao } from '@/lib/erros'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  anexarDocumento,
  obterDocumentoParaDownload,
} from '@/modules/residents/documentos.service'
import { criarAnotacao, editarAnotacao } from '@/modules/residents/anotacoes.service'
import {
  criarAnotacaoSaude,
  editarAnotacaoSaude,
} from '@/modules/health/anotacoes-saude.service'
import { registrarAcessoNegado, registrosDeNegacaoPendentes } from './acesso-negado'

async function negacoesDe(usuarioId: string) {
  return prisma.logAuditoria.findMany({
    where: { acao: 'ACESSO_NEGADO', usuarioId },
    orderBy: { criadoEm: 'asc' },
  })
}

describe('registrarAcessoNegado', () => {
  it('grava quem tentou, o que tentou e o papel que tinha na hora', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await registrarAcessoNegado(ctx, 'Usuario')

    const [log] = await negacoesDe(ctx.usuarioId)
    expect(log.usuarioEmail).toBe(ctx.email)
    expect(log.entidade).toBe('Usuario')
    expect(log.ip).toBe('127.0.0.1')
    // O papel vai no diff porque o papel de uma conta pode ser corrigido
    // depois: sem isto, a trilha diria o papel de hoje, não o de quando a
    // tentativa aconteceu.
    expect(log.diff).toEqual({
      papel: { de: null, para: 'SAUDE' },
      tentativas: { de: null, para: 1 },
    })
  })

  it('dobra o intervalo entre registros em vez de gravar uma linha por tentativa', async () => {
    // O que trava auditar negação é o volume: um script hostil geraria
    // milhares de linhas e afogaria a trilha que a fiscalização lê. Registrar
    // na 1ª, 2ª, 4ª, 8ª tentativa mantém o que interessa — a magnitude — e faz
    // 10 mil tentativas caberem em 14 linhas.
    const ctx = await ctxComPapel('SAUDE')

    for (let i = 0; i < 5; i += 1) await registrarAcessoNegado(ctx, 'Residente')

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs.map((log) => (log.diff as { tentativas: { para: number } }).tentativas.para))
      .toEqual([1, 2, 4])
  })

  it('conta cada entidade por si', async () => {
    // Tentar a ficha de um residente e a tela de usuários são sinais
    // diferentes, e um não pode abafar o outro.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await registrarAcessoNegado(ctx, 'Residente')
    await registrarAcessoNegado(ctx, 'Usuario')

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs.map((log) => log.entidade).sort()).toEqual(['Residente', 'Usuario'])
  })
})

describe('exigirPapel', () => {
  it('registra a negação sem que o serviço precise lembrar de registrá-la', async () => {
    // O ganho de auditar dentro de `exigirPapel`: nenhum dos trinta e poucos
    // serviços tem uma linha a mais, e nenhum pode esquecer.
    const ctx = await ctxComPapel('SAUDE')

    expect(() => exigirPapel(ctx, 'Usuario', 'COORDENACAO')).toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const logs = await negacoesDe(ctx.usuarioId)
    expect(logs).toHaveLength(1)
    expect(logs[0].entidade).toBe('Usuario')
  })

  it('não registra nada quando o papel é aceito', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    exigirPapel(ctx, 'Usuario', 'COORDENACAO')
    await registrosDeNegacaoPendentes()

    expect(await negacoesDe(ctx.usuarioId)).toHaveLength(0)
  })

  it('registra a tentativa de abrir a lista de usuários com o papel SAUDE', async () => {
    // O caminho inteiro, pelo serviço de verdade: é este o cenário do art. 11
    // da LGPD — alguém tentando alcançar dado que o papel dele não alcança.
    const ctx = await ctxComPapel('SAUDE')

    await expect(listarUsuarios(ctx)).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoesDe(ctx.usuarioId)
    expect(log.entidade).toBe('Usuario')
    expect(log.acao).toBe('ACESSO_NEGADO')
  })
})

describe('obterDocumentoParaDownload', () => {
  it('registra a tentativa de baixar documento que o papel nao alcanca', async () => {
    // O download bem-sucedido ja entrava na trilha como `DOWNLOAD`; a tentativa
    // negada nao deixava nada. Os papeis aqui sao calculados por documento
    // (`papeisQuePodemVer`), entao `exigirPapel` nao serve e o registro precisa
    // partir do proprio servico.
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo: Buffer.from('%PDF-1.4 exame'),
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      obterDocumentoParaDownload(administrativo, exame.id)
    ).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoesDe(administrativo.usuarioId)
    expect(log.entidade).toBe('Documento')
    expect(log.acao).toBe('ACESSO_NEGADO')
  })
})

describe('exigirJanelaAberta', () => {
  it('registra a tentativa de editar anotacao de outra pessoa', async () => {
    // Nao e checagem de papel — os dois tem papel para anotar. E de autoria, e
    // por isso escapava do `exigirPapel`. Numa ILPI, tentar alterar registro
    // clinico alheio e evento forense, e a trilha nao guardava nada.
    const autor = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacao(autor, {
      residenteId: residente.id,
      categoria: 'SOCIAL',
      texto: 'Recebeu visita da filha.',
    })

    const outra = await ctxComPapel('COORDENACAO')
    await expect(
      editarAnotacao(outra, anotacao.id, 'Texto trocado por quem nao escreveu.')
    ).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoesDe(outra.usuarioId)
    expect(log.entidade).toBe('Anotacao')
    expect(log.acao).toBe('ACESSO_NEGADO')
  })

  it('distingue anotacao do prontuario da anotacao da ficha', async () => {
    // A entidade e obrigatoria justamente para isto: na tela de auditoria,
    // 'tentou alterar anotacao clinica' pesa diferente de 'tentou alterar
    // anotacao social'. Se as duas chegassem com o mesmo nome, o parametro
    // seria enfeite.
    const autor = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(autor, {
      residenteId: residente.id,
      categoria: 'QUEDA',
      turno: 'NOITE',
      texto: 'Queda sem ferimento aparente.',
      ocorridoEm: new Date(Date.now() - 3_600_000),
    })

    const outra = await ctxComPapel('COORDENACAO')
    await expect(
      editarAnotacaoSaude(outra, anotacao.id, 'Texto trocado por quem nao escreveu.')
    ).rejects.toThrow(ErroPermissao)
    await registrosDeNegacaoPendentes()

    const [log] = await negacoesDe(outra.usuarioId)
    expect(log.entidade).toBe('AnotacaoSaude')
  })
})
