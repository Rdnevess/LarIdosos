import { ErroPermissao, ErroValidacao } from './erros'
import type { Ctx } from './contexto'

/**
 * Regra R3 do design: anotação é editável pelo autor por 15 minutos; depois
 * disso, a correção só entra como registro novo vinculado à original, que
 * nunca é alterada.
 *
 * Mora aqui, e não dentro de um dos serviços, porque duas entidades a seguem —
 * `Anotacao` (geral, na ficha) e `AnotacaoSaude` (prontuário). Duas cópias da
 * mesma regra divergem, e esta é uma regra que a fiscalização lê.
 */
export const JANELA_EDICAO_MINUTOS = 15

export function prazoDeEdicao(): Date {
  return new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000)
}

/**
 * A autoria é conferida antes do prazo, de propósito: para quem não escreveu,
 * o prazo é irrelevante, e "a janela expirou" sugeriria que ter chegado antes
 * teria adiantado alguma coisa.
 */
export function exigirJanelaAberta(
  editavelAte: Date,
  autorId: string | null,
  ctx: Ctx
): void {
  if (autorId !== ctx.usuarioId) {
    throw new ErroPermissao('Só o autor pode editar a própria anotação')
  }

  if (editavelAte.getTime() < Date.now()) {
    throw new ErroValidacao(
      `A janela de ${JANELA_EDICAO_MINUTOS} minutos para edição expirou. Registre uma retificação.`
    )
  }
}
