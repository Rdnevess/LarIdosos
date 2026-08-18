import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  anexarDocumento,
  listarDocumentos,
  obterDocumentoParaDownload,
  excluirDocumento,
  papeisQuePodemVer,
} from './documentos.service'

const conteudo = Buffer.from('%PDF-1.4 laudo')

describe('anexarDocumento', () => {
  it('grava o arquivo e o metadado, e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg maria.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    expect(documento.nomeArquivoOriginal).toBe('rg maria.pdf')
    expect(documento.caminhoArmazenamento).not.toContain('rg maria')
    expect(documento.tamanhoBytes).toBe(conteudo.length)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Documento', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega anexar documento clínico ao papel ADMINISTRATIVO', async () => {
    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      anexarDocumento(administrativo, {
        tipo: 'EXAME',
        nomeArquivoOriginal: 'hemograma.pdf',
        mimeType: 'application/pdf',
        conteudo,
        residenteId: residente.id,
      })
    ).rejects.toThrow(ErroPermissao)
  })

  it('nega anexar documento fiscal ao papel SAUDE', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      anexarDocumento(saude, {
        tipo: 'COMPROVANTE_FISCAL',
        nomeArquivoOriginal: 'nota.pdf',
        mimeType: 'application/pdf',
        conteudo,
        residenteId: residente.id,
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('obterDocumentoParaDownload', () => {
  it('entrega o conteúdo e registra o download na auditoria', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const resultado = await obterDocumentoParaDownload(ctx, documento.id)

    expect(resultado.conteudo.equals(conteudo)).toBe(true)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Documento', acao: 'DOWNLOAD' },
    })
    expect(log.entidadeId).toBe(documento.id)
  })

  it('nega documento clínico ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      obterDocumentoParaDownload(administrativo, exame.id)
    ).rejects.toThrow(ErroPermissao)
  })

  it('nega documento fiscal ao papel SAUDE', async () => {
    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const comprovante = await anexarDocumento(administrativo, {
      tipo: 'COMPROVANTE_FISCAL',
      nomeArquivoOriginal: 'nota.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const saude = await ctxComPapel('SAUDE')
    await expect(
      obterDocumentoParaDownload(saude, comprovante.id)
    ).rejects.toThrow(ErroPermissao)
  })

  it('permite documento cadastral aos três papéis', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()
    const rg = await anexarDocumento(admin, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const resultado = await obterDocumentoParaDownload(ctx, rg.id)
      expect(resultado.documento.id).toBe(rg.id)
    }
  })
})

describe('papeisQuePodemVer', () => {
  it('classifica cada tipo de documento', () => {
    const casos = [
      { tipo: 'EXAME' as const, funcionarioId: null, esperado: ['COORDENACAO', 'SAUDE'] },
      { tipo: 'LAUDO' as const, funcionarioId: null, esperado: ['COORDENACAO', 'SAUDE'] },
      { tipo: 'COMPROVANTE_FISCAL' as const, funcionarioId: null, esperado: ['COORDENACAO', 'ADMINISTRATIVO'] },
      { tipo: 'RG' as const, funcionarioId: null, esperado: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
      { tipo: 'TERMO_LGPD' as const, funcionarioId: null, esperado: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
      // Documento de funcionário é assunto de pessoal, não da equipe clínica:
      // mesmo sendo LAUDO, fica com o administrativo e fora do alcance de SAUDE.
      { tipo: 'LAUDO' as const, funcionarioId: 'fun_1', esperado: ['COORDENACAO', 'ADMINISTRATIVO'] },
      { tipo: 'CONSELHO_PROFISSIONAL' as const, funcionarioId: 'fun_1', esperado: ['COORDENACAO', 'ADMINISTRATIVO'] },
    ]

    for (const caso of casos) {
      expect(papeisQuePodemVer({ tipo: caso.tipo, funcionarioId: caso.funcionarioId })).toEqual(
        caso.esperado
      )
    }
  })
})

describe('excluirDocumento', () => {
  it('desativa sem apagar e audita com o estado anterior real', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    await excluirDocumento(ctx, documento.id)

    const registro = await prisma.documento.findUniqueOrThrow({ where: { id: documento.id } })
    expect(registro.ativo).toBe(false)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Documento', acao: 'EXCLUIR' },
    })
    expect(log.diff).toEqual({ ativo: { de: true, para: false } })
  })

  it('some da listagem depois de excluído', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    await excluirDocumento(ctx, documento.id)

    expect(await listarDocumentos(ctx, { residenteId: residente.id })).toHaveLength(0)
    await expect(obterDocumentoParaDownload(ctx, documento.id)).rejects.toThrow(ErroNaoEncontrado)
  })

  it('nega exclusão de documento clínico ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    await expect(excluirDocumento(administrativo, exame.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarDocumentos', () => {
  it('recusa chamada sem alvo, em vez de varrer a tabela', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await expect(listarDocumentos(ctx, {})).rejects.toThrow(ErroValidacao)
  })

  it('recusa chamada com os dois vínculos ao mesmo tempo', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    await expect(
      listarDocumentos(ctx, { residenteId: residente.id, funcionarioId: 'fun_1' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('omite da lista os documentos que o papel não pode ver', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })
    await anexarDocumento(saude, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const lista = await listarDocumentos(administrativo, { residenteId: residente.id })

    expect(lista.map((d) => d.tipo)).toEqual(['RG'])
  })
})
