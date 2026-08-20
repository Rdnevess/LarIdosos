import { z, ZodIssueCode, type ZodErrorMap } from 'zod'

/**
 * Traduz para português as mensagens padrão do Zod — aquelas que nenhum
 * schema define explicitamente. Instalado uma única vez, globalmente, com
 * `z.setErrorMap()` no fim deste arquivo.
 *
 * Uma mensagem explícita (ex.: `z.string().min(2, 'UF deve ter 2 letras')`)
 * sempre vence este mapa: o Zod resolve `issueData.message` antes de
 * consultar qualquer errorMap — ver `makeIssue` em
 * `node_modules/zod/v3/helpers/parseUtil.cjs`. Este arquivo só entra em
 * jogo quando o schema não deu mensagem nenhuma.
 *
 * Importado por `@/lib/validacao`, o único ponto do projeto por onde todo
 * schema passa (`validar()`), para garantir que o mapa esteja instalado
 * antes de qualquer `safeParse`.
 */

const nomesDeTipo: Partial<Record<string, string>> = {
  string: 'texto',
  number: 'número',
  boolean: 'valor verdadeiro/falso',
  date: 'data',
  bigint: 'número inteiro',
  array: 'lista',
  object: 'objeto',
  null: 'nulo',
  undefined: 'valor ausente',
  function: 'função',
  map: 'mapa',
  set: 'conjunto',
  nan: 'número',
  symbol: 'símbolo',
  promise: 'promessa',
  unknown: 'valor',
  void: 'vazio',
  integer: 'número inteiro',
  float: 'número',
  never: 'valor',
}

function traduzirTipo(tipo: string): string {
  return nomesDeTipo[tipo] ?? tipo
}

export const mapaErroZodPtBr: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      // Campo ausente do payload (o caso mais comum de requisição forjada,
      // já que o HTML `required` não cobre isso — só cobre input vazio).
      if (issue.received === 'undefined') {
        return { message: 'Campo obrigatório' }
      }
      return {
        message: `Esperado ${traduzirTipo(issue.expected)}, recebido ${traduzirTipo(issue.received)}`,
      }

    case ZodIssueCode.invalid_literal:
      return { message: `Valor inválido, esperado ${JSON.stringify(issue.expected)}` }

    case ZodIssueCode.unrecognized_keys:
      return { message: `Campo(s) não reconhecido(s): ${issue.keys.join(', ')}` }

    case ZodIssueCode.invalid_union:
      return { message: 'Valor inválido' }

    case ZodIssueCode.invalid_union_discriminator:
      return { message: `Valor inválido. Esperado um destes: ${issue.options.join(', ')}` }

    case ZodIssueCode.invalid_enum_value:
      return {
        message: `Valor inválido. Esperado um destes: ${issue.options.join(', ')}; recebido '${issue.received}'`,
      }

    case ZodIssueCode.invalid_arguments:
      return { message: 'Argumentos inválidos' }

    case ZodIssueCode.invalid_return_type:
      return { message: 'Retorno inválido' }

    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida' }

    case ZodIssueCode.invalid_string: {
      const { validation } = issue
      if (typeof validation === 'object') {
        if ('includes' in validation) return { message: `Deve conter "${validation.includes}"` }
        if ('startsWith' in validation) return { message: `Deve começar com "${validation.startsWith}"` }
        if ('endsWith' in validation) return { message: `Deve terminar com "${validation.endsWith}"` }
        return { message: 'Texto inválido' }
      }
      if (validation === 'email') return { message: 'E-mail inválido' }
      if (validation === 'url') return { message: 'Endereço inválido' }
      if (validation === 'uuid' || validation === 'cuid' || validation === 'cuid2' || validation === 'ulid') {
        return { message: 'Identificador inválido' }
      }
      if (validation === 'regex') return { message: 'Formato inválido' }
      return { message: 'Texto inválido' }
    }

    case ZodIssueCode.too_small: {
      const { minimum, inclusive, exact, type } = issue
      if (type === 'string') {
        if (exact) return { message: `Deve ter exatamente ${minimum} caractere(s)` }
        return {
          message: inclusive
            ? `Deve ter no mínimo ${minimum} caractere(s)`
            : `Deve ter mais de ${minimum} caractere(s)`,
        }
      }
      if (type === 'number' || type === 'bigint') {
        if (exact) return { message: `Deve ser exatamente igual a ${minimum}` }
        return {
          message: inclusive ? `Deve ser maior ou igual a ${minimum}` : `Deve ser maior que ${minimum}`,
        }
      }
      if (type === 'array') {
        if (exact) return { message: `Deve conter exatamente ${minimum} item(ns)` }
        return {
          message: inclusive
            ? `Deve conter no mínimo ${minimum} item(ns)`
            : `Deve conter mais de ${minimum} item(ns)`,
        }
      }
      if (type === 'date') {
        const data = new Date(Number(minimum)).toLocaleDateString('pt-BR')
        if (exact) return { message: `Deve ser exatamente ${data}` }
        return {
          message: inclusive ? `Deve ser igual ou posterior a ${data}` : `Deve ser posterior a ${data}`,
        }
      }
      return { message: 'Valor abaixo do mínimo permitido' }
    }

    case ZodIssueCode.too_big: {
      const { maximum, inclusive, exact, type } = issue
      if (type === 'string') {
        if (exact) return { message: `Deve ter exatamente ${maximum} caractere(s)` }
        return {
          message: inclusive
            ? `Deve ter no máximo ${maximum} caractere(s)`
            : `Deve ter menos de ${maximum} caractere(s)`,
        }
      }
      if (type === 'number' || type === 'bigint') {
        if (exact) return { message: `Deve ser exatamente igual a ${maximum}` }
        return {
          message: inclusive ? `Deve ser menor ou igual a ${maximum}` : `Deve ser menor que ${maximum}`,
        }
      }
      if (type === 'array') {
        if (exact) return { message: `Deve conter exatamente ${maximum} item(ns)` }
        return {
          message: inclusive
            ? `Deve conter no máximo ${maximum} item(ns)`
            : `Deve conter menos de ${maximum} item(ns)`,
        }
      }
      if (type === 'date') {
        const data = new Date(Number(maximum)).toLocaleDateString('pt-BR')
        if (exact) return { message: `Deve ser exatamente ${data}` }
        return {
          message: inclusive ? `Deve ser igual ou anterior a ${data}` : `Deve ser anterior a ${data}`,
        }
      }
      return { message: 'Valor acima do máximo permitido' }
    }

    case ZodIssueCode.custom:
      return { message: 'Valor inválido' }

    case ZodIssueCode.invalid_intersection_types:
      return { message: 'Não foi possível combinar os valores informados' }

    case ZodIssueCode.not_multiple_of:
      return { message: `Deve ser múltiplo de ${issue.multipleOf}` }

    case ZodIssueCode.not_finite:
      return { message: 'Deve ser um número finito' }

    default:
      return { message: ctx.defaultError }
  }
}

z.setErrorMap(mapaErroZodPtBr)
