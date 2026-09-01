import { describe, it, expect } from 'vitest'
import { TipoDocumento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  anexarDocumento,
  listarDocumentos,
  obterDocumentoParaDownload,
  excluirDocumento,
  papeisQuePodemVer,
  tiposQuePodeAnexar,
  TIPOS_DE_ALVO,
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

  it('recusa funcionarioId inexistente, do mesmo jeito que residenteId', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      anexarDocumento(ctx, {
        tipo: 'CONSELHO_PROFISSIONAL',
        nomeArquivoOriginal: 'coren.pdf',
        mimeType: 'application/pdf',
        conteudo,
        funcionarioId: 'clfake000000000000000000',
      })
    ).rejects.toThrow(ErroNaoEncontrado)

    // Recusado ANTES de gravar bytes: nada de arquivo órfão no disco.
    expect(await prisma.documento.count()).toBe(0)
  })

  it('anexa ao funcionário existente e o vincula pela chave estrangeira', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await prisma.funcionario.create({
      data: {
        nomeCompleto: 'Ana Souza',
        cpf: '11144477735',
        cargo: 'Enfermeira',
        vinculo: 'CLT',
        dataAdmissao: new Date('2025-02-01'),
      },
    })

    const documento = await anexarDocumento(ctx, {
      tipo: 'CONSELHO_PROFISSIONAL',
      nomeArquivoOriginal: 'coren.pdf',
      mimeType: 'application/pdf',
      conteudo,
      funcionarioId: funcionario.id,
    })

    expect(documento.funcionarioId).toBe(funcionario.id)
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

  it('recusa registro em conselho vinculado a residente', async () => {
    // O conselho é do profissional, não de quem mora aqui. A tela deixou de
    // oferecer o tipo na ficha do residente, mas quem monta o POST à mão
    // escolhe o que quiser: a recusa tem de estar no serviço.
    const ctx = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    await expect(
      anexarDocumento(ctx, {
        tipo: 'CONSELHO_PROFISSIONAL',
        nomeArquivoOriginal: 'coren.pdf',
        mimeType: 'application/pdf',
        conteudo,
        residenteId: residente.id,
      })
    ).rejects.toThrow(ErroValidacao)
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
      // Sem funcionário, é combinação que não pode existir: ninguém vê. É
      // esse vazio que tira o tipo do seletor da ficha do residente, pela
      // derivação de `tiposQuePodeAnexar` — sem uma segunda lista na tela.
      { tipo: 'CONSELHO_PROFISSIONAL' as const, funcionarioId: null, esperado: [] },
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

describe('tiposQuePodeAnexar', () => {
  it('oferece a SAUDE os tipos clínicos que a ficha escondia dela', () => {
    const tipos = tiposQuePodeAnexar('SAUDE')

    // O laudo do grau de dependência é o documento que a fiscalização
    // sanitária cobra, e a enfermeira não conseguia anexá-lo.
    expect(tipos).toContain('LAUDO')
    expect(tipos).toContain('EXAME')
    expect(tipos).toContain('RG')
  })

  it('não oferece registro em conselho na ficha do residente', () => {
    // O seletor da ficha oferecia "Registro em conselho" — tipo que só faz
    // sentido para funcionário — porque a política o classificava como
    // visível a todos quando não havia `funcionarioId`.
    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      expect(tiposQuePodeAnexar(papel)).not.toContain('CONSELHO_PROFISSIONAL')
    }

    // E continua sendo oferecido onde faz sentido.
    expect(tiposQuePodeAnexar('ADMINISTRATIVO', { funcionarioId: 'fun_1' })).toContain(
      'CONSELHO_PROFISSIONAL'
    )
  })

  it('não oferece a SAUDE o que ela não pode ver', () => {
    expect(tiposQuePodeAnexar('SAUDE')).not.toContain('COMPROVANTE_FISCAL')
  })

  it('não oferece ao ADMINISTRATIVO os tipos clínicos', () => {
    const tipos = tiposQuePodeAnexar('ADMINISTRATIVO')

    expect(tipos).not.toContain('EXAME')
    expect(tipos).not.toContain('LAUDO')
    expect(tipos).toContain('COMPROVANTE_FISCAL')
  })

  it('concorda com papeisQuePodemVer para todo tipo e todo papel', () => {
    // Esta é a asserção que impede as duas listas de divergirem de novo: se
    // alguém acrescentar uma exceção só na tela, ou mexer na ordem dos ifs de
    // `papeisQuePodemVer`, este teste acusa.
    //
    // O universo aqui é `TIPOS_DE_ALVO`, não `Object.values(TipoDocumento)`:
    // COMPROVANTE_PAGAMENTO e EXTRATO_BANCARIO são autorizados a COORDENACAO
    // e ADMINISTRATIVO em `papeisQuePodemVer` (são visíveis num lançamento ou
    // numa prestação de contas), mas nunca aparecem no seletor da ficha de
    // uma pessoa — a divergência ali é deliberada, não o defeito que este
    // teste vigia.
    const papeis = ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const

    for (const papel of papeis) {
      for (const alvo of [{}, { funcionarioId: 'fun_1' }]) {
        const oferecidos = tiposQuePodeAnexar(papel, alvo)

        for (const tipo of TIPOS_DE_ALVO) {
          const autorizado = papeisQuePodemVer({
            tipo,
            funcionarioId: alvo.funcionarioId ?? null,
          }).includes(papel)

          expect(oferecidos.includes(tipo)).toBe(autorizado)
        }
      }
    }
  })

  it('trata documento de funcionário como assunto de pessoal, não da equipe clínica', () => {
    // `papeisQuePodemVer` testa `funcionarioId` ANTES do tipo, e a derivação
    // precisa preservar isso: um LAUDO de funcionário não é oferecido a SAUDE.
    expect(tiposQuePodeAnexar('SAUDE', { funcionarioId: 'fun_1' })).toEqual([])
    expect(tiposQuePodeAnexar('ADMINISTRATIVO', { funcionarioId: 'fun_1' })).toContain('LAUDO')
  })
})

describe('os tipos do financeiro nao sao anexo de pessoa', () => {
  it('extrato e comprovante de pagamento so alcancam coordenacao e administrativo', () => {
    // O ultimo `return` de `papeisQuePodemVer` e TODOS. Um tipo novo sem regra
    // propria nasce visivel a SAUDE — e o extrato bancario e o documento mais
    // sensivel que este sistema guarda.
    expect(papeisQuePodemVer({ tipo: 'EXTRATO_BANCARIO', funcionarioId: null }))
      .toEqual(['COORDENACAO', 'ADMINISTRATIVO'])
    expect(papeisQuePodemVer({ tipo: 'COMPROVANTE_PAGAMENTO', funcionarioId: null }))
      .toEqual(['COORDENACAO', 'ADMINISTRATIVO'])
  })

  it('nao aparecem no seletor da ficha, para papel nenhum', () => {
    // `tiposQuePodeAnexar` deriva de `papeisQuePodemVer`. Sem barreira, a
    // coordenacao passaria a ver "Extrato bancario" no seletor de tipo de
    // documento de um residente.
    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const oferecidos = tiposQuePodeAnexar(papel)
      expect(oferecidos, `${papel} nao pode anexar extrato a uma pessoa`)
        .not.toContain('EXTRATO_BANCARIO')
      expect(oferecidos, `${papel} nao pode anexar comprovante de pagamento a uma pessoa`)
        .not.toContain('COMPROVANTE_PAGAMENTO')
    }
  })

  it('anexarDocumento recusa os dois, mesmo forjados no formulario', async () => {
    const ctx = { usuarioId: 'u1', papel: 'COORDENACAO' as const, email: 'c@lar.local' }

    // Cuid sintaticamente valido mas de ninguem: o unico motivo de falha
    // possivel tem de ser o tipo fora de `TIPOS_DE_ALVO`, nunca o formato do
    // vinculo nem a busca do residente/funcionario (que so aconteceria
    // depois, se o schema deixasse passar).
    //
    // A §8 da spec pede os DOIS tipos novos recusados como anexo dos DOIS
    // alvos — residente e funcionario. A barreira real e' um `z.enum` so
    // (`TIPOS_DE_ALVO`), que pega os quatro casos de uma vez, mas o teste
    // precisa afirmar o que o nome promete, e nao so um quarto dele.
    const casos = [
      { tipo: 'EXTRATO_BANCARIO' as 'OUTRO', vinculo: { residenteId: 'ckqv0000000000000000000a' } },
      { tipo: 'EXTRATO_BANCARIO' as 'OUTRO', vinculo: { funcionarioId: 'ckqv0000000000000000000b' } },
      { tipo: 'COMPROVANTE_PAGAMENTO' as 'OUTRO', vinculo: { residenteId: 'ckqv0000000000000000000a' } },
      { tipo: 'COMPROVANTE_PAGAMENTO' as 'OUTRO', vinculo: { funcionarioId: 'ckqv0000000000000000000b' } },
    ]

    for (const caso of casos) {
      await expect(
        anexarDocumento(ctx, {
          tipo: caso.tipo,
          nomeArquivoOriginal: 'anexo.pdf',
          mimeType: 'application/pdf',
          conteudo: Buffer.from('%PDF-1.4 x'),
          ...caso.vinculo,
        })
      ).rejects.toThrow(ErroValidacao)
    }
  })

  it('todo tipo do enum e de alvo ou e do financeiro, nunca nenhum dos dois', () => {
    // Sem esta contagem, um tipo novo poderia ficar fora de `TIPOS_DE_ALVO` e
    // fora da lista do financeiro ao mesmo tempo — invisivel nos dois lugares,
    // e sem nada reclamando.
    const doFinanceiro = ['COMPROVANTE_PAGAMENTO', 'EXTRATO_BANCARIO']
    expect(TIPOS_DE_ALVO.length + doFinanceiro.length)
      .toBe(Object.values(TipoDocumento).length)
  })
})
