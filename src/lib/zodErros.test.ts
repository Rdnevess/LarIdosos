import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import './zodErros'

describe('mapaErroZodPtBr (errorMap global)', () => {
  it('traduz too_big de string com exact (length) para português', () => {
    // Mesmo formato do `conselhoUf` de funcionarios.schema.ts: sem mensagem
    // explícita. Antes deste errorMap, o Zod devolvia em inglês
    // ("String must contain exactly 2 character(s)").
    const resultado = z.string().trim().length(2).toUpperCase().optional().safeParse('SPO')

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('Deve ter exatamente 2 caractere(s)')
  })

  it('traduz too_small de string com exact (length) para português', () => {
    const resultado = z.string().trim().length(2).toUpperCase().optional().safeParse('S')

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('Deve ter exatamente 2 caractere(s)')
  })

  it('traduz too_small de número não-negativo para português', () => {
    // Mesmo formato do `beneficioValor` de residentes.schema.ts: sem
    // mensagem explícita. Antes deste errorMap: "Number must be greater
    // than or equal to 0".
    const resultado = z.number().nonnegative().optional().safeParse(-5)

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('Deve ser maior ou igual a 0')
  })

  it('traduz invalid_type de campo ausente para português', () => {
    // O caso mais comum de requisição forjada: o campo nem chega no
    // payload (o `required` do HTML só cobre campo vazio, não ausente).
    const resultado = z.object({ nome: z.string() }).safeParse({})

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('Campo obrigatório')
  })

  it('não sobrescreve mensagem explícita do schema', () => {
    const resultado = z.string().trim().length(2, 'UF deve ter 2 letras').optional().safeParse('SPO')

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('UF deve ter 2 letras')
  })

  it('não sobrescreve errorMap definido no próprio schema', () => {
    // Mesmo mecanismo de `desligamentoSchema.status` em residentes.schema.ts.
    const schema = z.enum(['A', 'B'], {
      errorMap: () => ({ message: 'Escolha A ou B' }),
    })
    const resultado = schema.safeParse('C')

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues[0].message).toBe('Escolha A ou B')
  })
})
