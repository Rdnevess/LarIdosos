import { z } from 'zod'

/**
 * O texto de uma anotação, e o mínimo que ele precisa ter.
 *
 * Mora aqui, e não dentro de um dos serviços, pelo mesmo motivo que
 * `janela-edicao.ts`: duas entidades seguem a regra — `Anotacao` (geral, na
 * ficha) e `AnotacaoSaude` (prontuário). Estava escrita em três lugares, e três
 * cópias da mesma frase divergem no dia em que alguém melhora uma delas. Quem
 * escreve no plantão veria mensagens diferentes para o mesmo erro, dependendo
 * de qual tela abriu.
 *
 * A retificação tem mensagem própria de propósito: é outro ato, e chamar o
 * texto dela de "anotação" mandaria a pessoa procurar o campo errado.
 */
export const textoDeAnotacaoSchema = z
  .string()
  .trim()
  .min(3, 'Escreva o conteúdo da anotação')

export const textoDeRetificacaoSchema = z
  .string()
  .trim()
  .min(3, 'Escreva o conteúdo da retificação')
