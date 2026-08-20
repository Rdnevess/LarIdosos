import { describe, it, expect } from 'vitest'
import { calcularDiff } from '@/modules/audit/auditoria.service'
import { dadosDoFuncionario } from './conversores'

/**
 * Monta o `FormData` como o navegador o envia: todo campo do formulário
 * presente, os não preenchidos com string vazia.
 */
function formularioDeFuncionario(preenchidos: Record<string, string> = {}): FormData {
  const dados = new FormData()
  const campos = [
    'nomeCompleto', 'cpf', 'rg', 'cargo', 'vinculo', 'dataAdmissao',
    'telefone', 'email', 'conselhoSigla', 'conselhoNumero', 'conselhoUf',
    'conselhoValidade',
  ]
  for (const campo of campos) dados.set(campo, preenchidos[campo] ?? '')
  return dados
}

describe('dadosDoFuncionario', () => {
  it('omite as chaves dos campos deixados em branco', () => {
    const convertido = dadosDoFuncionario(
      formularioDeFuncionario({
        nomeCompleto: 'Ana Souza',
        cpf: '11144477735',
        cargo: 'Técnica de enfermagem',
        vinculo: 'CLT',
        dataAdmissao: '2025-02-01',
      })
    )

    expect(Object.keys(convertido).sort()).toEqual([
      'cargo',
      'cpf',
      'dataAdmissao',
      'nomeCompleto',
      'vinculo',
    ])
    expect('conselhoValidade' in convertido).toBe(false)
    expect('email' in convertido).toBe(false)
  })

  it('converte a validade do conselho sem deslocar o dia', () => {
    const convertido = dadosDoFuncionario(
      formularioDeFuncionario({
        nomeCompleto: 'Ana Souza',
        cpf: '11144477735',
        cargo: 'Enfermeira',
        vinculo: 'CLT',
        dataAdmissao: '2025-02-01',
        conselhoValidade: '2027-11-30',
      })
    )

    expect(convertido.conselhoValidade?.getDate()).toBe(30)
    expect(convertido.conselhoValidade?.getMonth()).toBe(10)
  })

  it('não produz diff nenhum quando o formulário é reenviado sem alteração', () => {
    const atual = {
      nomeCompleto: 'Ana Souza',
      cpf: '11144477735',
      cargo: 'Enfermeira',
      vinculo: 'CLT',
      dataAdmissao: new Date('2025-02-01T00:00:00Z'),
      conselhoValidade: new Date('2027-11-30T00:00:00Z'),
      telefone: null,
      email: null,
    }

    const reenviado = dadosDoFuncionario(
      formularioDeFuncionario({
        nomeCompleto: 'Ana Souza',
        cpf: '11144477735',
        cargo: 'Enfermeira',
        vinculo: 'CLT',
        dataAdmissao: '2025-02-01',
        conselhoValidade: '2027-11-30',
      })
    )

    expect(calcularDiff(atual, reenviado)).toBeNull()
  })
})
