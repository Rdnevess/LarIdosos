import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * O healthcheck que o Docker consulta.
 *
 * **Toca o banco de propósito.** Numa VPS pequena, a falha que de fato acontece
 * não é o Node morrer — é o Postgres ficar inalcançável enquanto o processo
 * continua respondendo. Uma checagem que só provasse "o processo atende HTTP"
 * ficaria verde exatamente durante a única falha que interessa.
 *
 * `SELECT 1` e nada mais: é a pergunta mais barata que prova que a conexão está
 * de pé, sem tocar em tabela nenhuma.
 *
 * O corpo diz se está de pé, e nada além. Versão, host ou mensagem de erro do
 * banco aqui virariam reconhecimento gratuito para quem estiver varrendo — o
 * endpoint é aberto, porque quem o consulta é o Docker, que não faz login. Por
 * isso ele também precisa estar fora do matcher do `middleware.ts`.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' })
  } catch (erro) {
    // O detalhe vai para o log do servidor, onde quem opera o alcança; a
    // resposta continua muda.
    console.error('Healthcheck falhou ao consultar o banco', erro)
    return NextResponse.json({ status: 'indisponivel' }, { status: 503 })
  }
}
