import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import {
  existeAfericaoDaMedida,
  listarSinaisVitais,
} from '@/modules/health/sinais-vitais.service'
import { listarFaixas } from '@/modules/health/faixas.service'
import {
  CAMPO_DO_GRAFICO,
  JANELAS,
  MEDIDAS_GRAFICO,
  ROTULO_GRAFICO,
  UNIDADE_GRAFICO,
  faixaDoGrafico,
  janelaDaUrl,
  medidaDaUrl,
  montarSerie,
} from '@/modules/health/tendencia'
import { GraficoTendencia } from '@/components/grafico-tendencia'

/**
 * A tendência de uma medida de um residente.
 *
 * Sem condição de papel aqui: `listarSinaisVitais` exige COORDENACAO ou SAUDE,
 * e um ADMINISTRATIVO que digite a URL recebe `ErroPermissao`, cai na fronteira
 * de erro e deixa linha `ACESSO_NEGADO` na trilha. É o mesmo padrão de
 * `/faixas` e do prontuário.
 *
 * A medida e a janela vêm da URL, então o seletor é um link por opção: nenhum
 * componente cliente, nenhum estado, e cada combinação tem endereço próprio —
 * dá para mandar por mensagem "olha o peso da dona Maria em 365 dias".
 */
export default async function PaginaTendencia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ medida?: string; dias?: string }>
}) {
  const { id } = await params
  const filtros = await searchParams
  const medida = medidaDaUrl(filtros.medida)
  const dias = janelaDaUrl(filtros.dias)

  const ctx = await obterCtx()
  const fim = new Date()
  const inicio = new Date(fim.getTime() - dias * 86_400_000)

  const [residente, afericoes, ajustes] = await Promise.all([
    obterResidente(ctx, id),
    listarSinaisVitais(ctx, id, inicio),
    listarFaixas(ctx, id),
  ])

  const faixa = faixaDoGrafico(medida, ajustes)
  const serie = montarSerie(afericoes, medida, faixa)
  const rotulo = ROTULO_GRAFICO[medida]
  const unidade = UNIDADE_GRAFICO[medida]

  // Só quando o gráfico sai vazio, e só então: a tela precisa dizer qual dos
  // dois vazios é o dela, e a consulta não vale a pena quando há o que mostrar.
  const jaFoiAferida =
    serie.pontos.length > 0 ||
    (await existeAfericaoDaMedida(ctx, id, CAMPO_DO_GRAFICO[medida]))

  const endereco = (troca: { medida?: string; dias?: number }) =>
    `/residentes/${id}/prontuario/tendencia?medida=${troca.medida ?? medida}&dias=${
      troca.dias ?? dias
    }`

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-secao font-semibold text-forte">
          Tendência — {residente.nomeSocial || residente.nomeCompleto}
        </h1>
        {/* A legenda acompanha a medida: peso não tem faixa, e prometer uma
            sombra que não existe é pior do que não explicar nada — ainda mais
            aqui, que é a tela que abre por padrão. */}
        <p className="text-suporte text-apoio">
          Cada ponto é uma aferição, na data em que foi feita.{' '}
          {faixa
            ? 'A faixa sombreada é a de normalidade em vigor para este residente — a mesma que gera alerta.'
            : 'Peso não tem faixa de normalidade: 62 kg não é alarmante nem tranquilizador sem os 68 kg do mês passado. É por isso que ele só se lê aqui.'}
        </p>
      </div>

      <nav aria-label="Medida" className="flex flex-wrap gap-2">
        {MEDIDAS_GRAFICO.map((opcao) => (
          <Link
            key={opcao}
            href={endereco({ medida: opcao })}
            aria-current={opcao === medida ? 'page' : undefined}
            className={
              opcao === medida
                ? 'rounded border border-acao bg-acao px-2 py-1 text-legenda text-sobre-acao'
                : 'rounded border px-2 py-1 text-legenda text-medio'
            }
          >
            {ROTULO_GRAFICO[opcao]}
          </Link>
        ))}
      </nav>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {JANELAS.map((opcao) => (
          <Link
            key={opcao}
            href={endereco({ dias: opcao })}
            aria-current={opcao === dias ? 'page' : undefined}
            className={
              opcao === dias
                ? 'rounded border border-acao px-2 py-1 text-legenda font-semibold text-acao'
                : 'rounded border px-2 py-1 text-legenda text-medio'
            }
          >
            {opcao === 365 ? '1 ano' : `${opcao} dias`}
          </Link>
        ))}
      </nav>

      {serie.pontos.length > 0 ? (
        <div className="rounded border p-3">
          <p className="text-legenda uppercase tracking-wide text-apoio">
            {rotulo} ({unidade})
          </p>
          <GraficoTendencia
            serie={serie}
            faixa={faixa}
            inicio={inicio}
            fim={fim}
            rotulo={rotulo}
            unidade={unidade}
          />
          {serie.pontos.length === 1 && (
            <p className="text-suporte text-apoio">
              Uma aferição só. Um ponto mostra o valor, não a tendência.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded border p-3">
          {/* Os dois vazios pedem coisas opostas, e por isso não dividem
              mensagem: um pede abrir a janela, o outro pede começar a medir. */}
          <p className="text-suporte text-medio">
            {jaFoiAferida
              ? `Nenhuma aferição de ${rotulo.toLowerCase()} nos últimos ${dias} dias. Há registro mais antigo — experimente um período maior.`
              : `${rotulo} nunca foi aferido neste residente.`}
          </p>
        </div>
      )}

      <Link href={`/residentes/${id}/prontuario`} className="text-suporte underline">
        Voltar ao prontuário
      </Link>
    </section>
  )
}
