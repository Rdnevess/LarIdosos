import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { montarMapaDoTurno } from '@/modules/health/mapa-do-turno'
import { janelaDoTurno, turnoAnterior } from '@/lib/turno'
import { MapaDoTurno, CabecalhoDoTurno } from '@/components/mapa-do-turno'

/**
 * A tela mais usada do sistema.
 *
 * Sem nenhuma condição de papel aqui: `montarMapaDoTurno` exige COORDENACAO ou
 * SAUDE, e um ADMINISTRATIVO que digite a URL recebe `ErroPermissao`, cai na
 * fronteira de erro e deixa linha `ACESSO_NEGADO` na trilha.
 *
 * A navegação vai por query string, como os demais filtros do sistema: sem
 * estado de cliente, e o turno sobrevive a um recarregamento. Não há seletor
 * de data — quem precisa de três semanas atrás está fazendo auditoria, não
 * plantão, e o lugar disso é o relatório de aderência.
 */
export default async function PaginaTurno({
  searchParams,
}: {
  searchParams: Promise<{ passos?: string }>
}) {
  const { passos } = await searchParams
  const ctx = await obterCtx()

  const agora = new Date()
  const deslocamento = Number(passos ?? '0')
  // Limite de segurança para uma URL editada à mão: sem ele, `?passos=-99999`
  // faria o servidor iterar dezenas de milhares de vezes antes de responder.
  const passosValidos = Number.isFinite(deslocamento)
    ? Math.max(-90, Math.min(0, Math.trunc(deslocamento)))
    : 0

  // A navegação para trás conta passos a partir de agora, e não soma janelas
  // guardadas: assim "turno seguinte" nunca ultrapassa o corrente, e a URL
  // sozinha basta para reconstruir a tela.
  let janela = janelaDoTurno(agora)
  for (let i = 0; i < Math.abs(passosValidos); i += 1) {
    janela = turnoAnterior(janela)
  }

  const mapa = await montarMapaDoTurno(ctx, janela, agora)
  const ehTurnoCorrente = passosValidos === 0

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabecalhoDoTurno mapa={mapa} />
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/turno?passos=${passosValidos - 1}`}
            className="min-h-11 inline-flex items-center rounded border border-borda px-4 py-2 text-suporte text-firme"
          >
            Turno anterior
          </Link>
          {!ehTurnoCorrente && (
            <Link
              href={passosValidos + 1 === 0 ? '/turno' : `/turno?passos=${passosValidos + 1}`}
              className="min-h-11 inline-flex items-center rounded border border-borda px-4 py-2 text-suporte text-firme"
            >
              Turno seguinte
            </Link>
          )}
        </div>
      </div>

      {!ehTurnoCorrente && (
        <p className="rounded border border-alerta-borda bg-alerta-fundo p-2 text-suporte text-alerta">
          Este turno já passou. Registrar uma dose aqui exige escrever o que
          aconteceu — é o que mantém honesto o indicador de doses sem registro.
        </p>
      )}

      <MapaDoTurno mapa={mapa} ehTurnoCorrente={ehTurnoCorrente} />
    </section>
  )
}