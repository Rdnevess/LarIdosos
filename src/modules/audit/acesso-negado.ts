import { prisma } from '@/lib/prisma'
import type { Ctx } from '@/lib/contexto'
import { registrarAuditoria, type EntidadeAuditada } from './auditoria.service'

/**
 * Silêncio necessário para a contagem recomeçar. Desliza a cada tentativa: uma
 * rajada contínua mantém a mesma janela aberta, e é isso que faz a contagem
 * crescer em vez de reiniciar a cada minuto.
 */
const JANELA_MS = 60_000

type Janela = { tentativas: number; expiraEm: number }

/**
 * Estado em memória, por processo. A implantação roda um contêiner só
 * (`docker-compose.yml`), então "por processo" e "por sistema" são a mesma
 * coisa hoje; num dia com duas réplicas, cada uma contaria por si e a trilha
 * receberia até o dobro de linhas — mais ruído, nunca menos sinal.
 *
 * Não tem limpeza própria: a chave é `usuário + entidade`, e o número de
 * usuários do Lar é da ordem de dezenas.
 */
const janelas = new Map<string, Janela>()

const pendentes = new Set<Promise<unknown>>()

const ehPotenciaDeDois = (n: number) => (n & (n - 1)) === 0

/**
 * Registra uma tentativa de acesso negada — o evento que a trilha não tinha.
 * Ela registrava o que **aconteceu**, nunca o que foi **tentado**, e para dado
 * de saúde sob a LGPD (art. 11) é o segundo que interessa: saber que alguém
 * tentou ler repetidamente e não conseguiu diz mais que qualquer leitura bem
 * sucedida.
 *
 * **Não grava uma linha por tentativa.** Era esse o impedimento registrado na
 * pendência 2: um script hostil afogaria em ruído a trilha que a fiscalização
 * lê. Registra na 1ª, 2ª, 4ª, 8ª tentativa da janela, com a contagem — dez mil
 * tentativas cabem em catorze linhas, e a magnitude, que é o sinal, continua
 * legível. O preço assumido: entre duas linhas, o número exato de tentativas
 * não está na trilha, só o intervalo em que caiu.
 *
 * Escreve com `prisma` fora de transação, como `LOGIN_FALHA` em
 * `src/modules/auth/config.ts` — não há transação da operação a que se juntar,
 * porque a operação não começou.
 */
export async function registrarAcessoNegado(
  ctx: Ctx,
  entidade: EntidadeAuditada
): Promise<void> {
  const chave = `${ctx.usuarioId}:${entidade}`
  const agora = Date.now()
  const anterior = janelas.get(chave)
  const tentativas =
    anterior && anterior.expiraEm > agora ? anterior.tentativas + 1 : 1

  janelas.set(chave, { tentativas, expiraEm: agora + JANELA_MS })

  if (!ehPotenciaDeDois(tentativas)) return

  await registrarAuditoria(prisma, ctx, {
    acao: 'ACESSO_NEGADO',
    entidade,
    diff: {
      // O papel vai no diff porque o papel de uma conta pode ser corrigido
      // depois (`atualizarUsuario`): sem isto, a trilha mostraria o papel de
      // hoje no lugar do que a pessoa tinha quando tentou.
      papel: { de: null, para: ctx.papel },
      tentativas: { de: null, para: tentativas },
    },
  })
}

/**
 * Dispara o registro sem esperá-lo. `exigirPapel` é síncrona e chamada no topo
 * de trinta e poucos serviços; torná-la assíncrona exigiria um `await` em cada
 * um, e um `await` esquecido não falharia o build — só deixaria de barrar o
 * acesso. A checagem de permissão continua exatamente como era, e só a escrita
 * da trilha fica para depois.
 *
 * Falha de escrita vai para o log do servidor e não derruba nada: a trilha não
 * pode ser o motivo de uma tela quebrar.
 */
export function dispararRegistroDeAcessoNegado(
  ctx: Ctx,
  entidade: EntidadeAuditada
): void {
  const promessa = registrarAcessoNegado(ctx, entidade)
    .catch((erro) => {
      console.error('Falha ao registrar acesso negado na auditoria', erro)
    })
    .finally(() => {
      pendentes.delete(promessa)
    })

  pendentes.add(promessa)
}

/**
 * Espera as escritas disparadas por `dispararRegistroDeAcessoNegado`.
 *
 * **Existe para os testes**, que precisam observar uma escrita que a produção
 * de propósito não espera. Não tem chamador fora deles; um `setTimeout` no
 * teste seria a alternativa, e falharia de vez em quando numa máquina lenta.
 */
export function registrosDeNegacaoPendentes(): Promise<unknown> {
  return Promise.all([...pendentes])
}
