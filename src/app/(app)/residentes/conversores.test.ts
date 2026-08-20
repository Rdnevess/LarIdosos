import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { calcularDiff } from '@/modules/audit/auditoria.service'
import { dadosDoResidente } from './conversores'

/**
 * Monta o `FormData` como o navegador o envia: todo campo do formulário
 * presente, os não preenchidos com string vazia. É essa forma — e não um
 * objeto com só os campos interessantes — que produzia o diff falso.
 */
function formularioDeResidente(preenchidos: Record<string, string> = {}): FormData {
  const dados = new FormData()
  const campos = [
    'nomeCompleto', 'nomeSocial', 'dataNascimento', 'sexo', 'estadoCivil',
    'naturalidade', 'nacionalidade', 'religiao', 'escolaridade', 'cpf', 'rg',
    'orgaoEmissorRg', 'cns', 'dataAdmissao', 'origemAdmissao', 'motivoAdmissao',
    'quarto', 'leito', 'planoSaude', 'numeroPlanoSaude', 'beneficioTipo',
    'beneficioNumero', 'beneficioValor',
  ]
  for (const campo of campos) dados.set(campo, preenchidos[campo] ?? '')
  return dados
}

describe('dadosDoResidente', () => {
  it('omite as chaves dos campos deixados em branco', () => {
    const convertido = dadosDoResidente(
      formularioDeResidente({
        nomeCompleto: 'Maria Aparecida',
        dataNascimento: '1940-03-12',
        sexo: 'FEMININO',
        dataAdmissao: '2026-01-15',
      })
    )

    expect(Object.keys(convertido).sort()).toEqual([
      'dataAdmissao',
      'dataNascimento',
      'nacionalidade',
      'nomeCompleto',
      'sexo',
    ])
    // A chave precisa estar ausente, não presente com `undefined`: é a
    // presença que fazia `calcularDiff` inventar linhas.
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
