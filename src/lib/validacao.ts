import type { ZodTypeAny, z } from 'zod'
import { ErroValidacao } from './erros'

export function validar<S extends ZodTypeAny>(schema: S, valor: unknown): z.infer<S> {
  const resultado = schema.safeParse(valor)
  if (!resultado.success) {
    throw new ErroValidacao(resultado.error.issues.map((i) => i.message).join('; '))
  }
  return resultado.data
}
