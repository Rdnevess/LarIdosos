import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { calcularDiff } from '@/modules/audit/auditoria.service'
import { dadosDoResidente } from './conversores'

const CAMPOS = [
  'nomeCompleto', 'nomeSocial', 'dataNascimento', 'sexo', 'estadoCivil',
  'naturalidade', 'nacionalidade', 'religiao', 'escolaridade', 'cpf', 'rg',
  'orgaoEmissorRg', 'cns', 'dataAdmissao', 'origemAdmissao', 'motivoAdmissao',
  'quarto', 'leito', 'planoSaude', 'numeroPlanoSaude', 'beneficioTipo',
  'beneficioNumero', 'beneficioValor',
]

/**
 * Monta o `FormData` como o navegador o envia: todo campo do formulário
 * presente, os não preenchidos com string vazia. É essa forma — e não um
 * objeto com só os campos interessantes — que produzia o diff falso.
 */
function formularioDeResidente(preenchidos: Record<string, string> = {}): FormData {
  const dados = new FormData()
  for (const campo of CAMPOS) dados.set(campo, preenchidos[campo] ?? '')
  return dados
}

/**
 * O oposto do anterior: existem no `FormData` só os campos listados. É o que
 * uma tela parcial envia, e é a diferença que o `FormData` expressa por
 * `has()` — ausente não é a mesma coisa que presente e vazio.
 */
function formularioParcial(preenchidos: Record<string, string>): FormData {
  const dados = new FormData()
  for (const [campo, valor] of Object.entries(preenchidos)) dados.set(campo, valor)
  return dados
}

describe('dadosDoResidente', () => {
  it('manda null no campo que a tela ofereceu e a pessoa deixou em branco', () => {
    const convertido = dadosDoResidente(
      formularioDeResidente({
        nomeCompleto: 'Maria Aparecida',
        dataNascimento: '1940-03-12',
        sexo: 'FEMININO',
        dataAdmissao: '2026-01-15',
      })
    )

    // Oferecer o campo é convidar a apagá-lo: a chave precisa chegar ao
    // Prisma com `null`, senão a coluna guarda o valor antigo e a tela
    // responde "Registro salvo." sem nada ter sido salvo.
    expect(convertido.religiao).toBeNull()
    expect(convertido.beneficioValor).toBeNull()
  })

  it('omite as chaves dos campos que o formulário nem ofereceu', () => {
    const convertido = dadosDoResidente(
      formularioParcial({
        nomeCompleto: 'Maria Aparecida',
        dataNascimento: '1940-03-12',
        sexo: 'FEMININO',
        dataAdmissao: '2026-01-15',
      })
    )

    // Campo que a tela não mostrou não carrega intenção nenhuma. A chave
    // precisa estar ausente — não presente com `null`, que apagaria a
    // coluna, nem presente com `undefined`, que fazia `calcularDiff`
    // inventar linhas.
    expect(Object.keys(convertido).sort()).toEqual([
      'dataAdmissao',
      'dataNascimento',
      'nacionalidade',
      'nomeCompleto',
      'sexo',
    ])
    expect('religiao' in convertido).toBe(false)
    expect('beneficioValor' in convertido).toBe(false)
  })

  it('preenche a nacionalidade padrão quando o campo vem em branco', () => {
    const convertido = dadosDoResidente(formularioDeResidente({ nomeCompleto: 'Maria' }))
    expect(convertido.nacionalidade).toBe('Brasileira')
  })

  it('converte data, número e enum dos campos preenchidos', () => {
    const convertido = dadosDoResidente(
      formularioDeResidente({
        nomeCompleto: 'José Carlos',
        dataNascimento: '1938-07-04',
        sexo: 'MASCULINO',
        dataAdmissao: '2026-02-20',
        beneficioTipo: 'APOSENTADORIA',
        beneficioValor: '1412',
        quarto: '  7  ',
      })
    )

    expect(convertido.dataNascimento.getDate()).toBe(4)
    expect(convertido.dataNascimento.getMonth()).toBe(6)
    expect(convertido.beneficioValor).toBe(1412)
    expect(convertido.beneficioTipo).toBe('APOSENTADORIA')
    expect(convertido.quarto).toBe('7')
  })

  it('registra no diff o campo que a pessoa apagou', () => {
    // A pendência 7 inteira em uma asserção: apagar "Religião" e salvar
    // precisa virar gravação e linha de auditoria. Antes, a chave sumia, o
    // Prisma não tocava na coluna, e a trilha ficava tão silenciosa quanto
    // o banco.
    const atual = {
      nomeCompleto: 'Maria Aparecida',
      dataNascimento: new Date('1940-03-12T00:00:00Z'),
      sexo: 'FEMININO',
      nacionalidade: 'Brasileira',
      dataAdmissao: new Date('2026-01-15T00:00:00Z'),
      religiao: 'Católica',
    }

    const reenviado = dadosDoResidente(
      formularioDeResidente({
        nomeCompleto: 'Maria Aparecida',
        dataNascimento: '1940-03-12',
        sexo: 'FEMININO',
        nacionalidade: 'Brasileira',
        dataAdmissao: '2026-01-15',
      })
    )

    expect(calcularDiff(atual, reenviado)).toEqual({
      religiao: { de: 'Católica', para: null },
    })
  })

  it('não produz diff nenhum quando o formulário é reenviado sem alteração', () => {
    // O defeito inteiro em uma asserção: a ficha é aberta, nada é mudado,
    // "Salvar alterações" é clicado. O que o banco tem (`atual`) e o que a
    // tela manda precisam comparar como iguais — inclusive a data, que chega
    // como meia-noite UTC de um lado e meio-dia local do outro, e o benefício,
    // que chega como `Decimal` de um lado e número do outro.
    const atual = {
      nomeCompleto: 'Maria Aparecida',
      dataNascimento: new Date('1940-03-12T00:00:00Z'),
      sexo: 'FEMININO',
      nacionalidade: 'Brasileira',
      dataAdmissao: new Date('2026-01-15T00:00:00Z'),
      quarto: '7',
      religiao: null,
      beneficioValor: new Prisma.Decimal('1412.00'),
      beneficioTipo: 'APOSENTADORIA',
    }

    const reenviado = dadosDoResidente(
      formularioDeResidente({
        nomeCompleto: 'Maria Aparecida',
        dataNascimento: '1940-03-12',
        sexo: 'FEMININO',
        nacionalidade: 'Brasileira',
        dataAdmissao: '2026-01-15',
        quarto: '7',
        beneficioValor: '1412',
        beneficioTipo: 'APOSENTADORIA',
      })
    )

    expect(calcularDiff(atual, reenviado)).toBeNull()
  })
})
