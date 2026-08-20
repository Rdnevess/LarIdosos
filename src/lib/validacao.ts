import type { ZodTypeAny, z } from 'zod'
import { ErroValidacao } from './erros'
// Efeito colateral: instala o errorMap global do Zod em português. `validar`
// é o único ponto por onde todo schema do projeto passa, então importar
// aqui garante que o mapa esteja ativo antes de qualquer `safeParse`. Ver
// `@/lib/zodErros` para o porquê de mensagens explícitas continuarem
// vencendo o mapa.
import './zodErros'

export function validar<S extends ZodTypeAny>(schema: S, valor: unknown): z.infer<S> {
  const resultado = schema.safeParse(valor)
  if (!resultado.success) {
    throw new ErroValidacao(resultado.error.issues.map((i) => i.message).join('; '))
  }
  return resultado.data
}
