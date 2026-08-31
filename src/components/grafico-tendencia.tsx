import { formatarData } from '@/lib/ptbr'
import {
  posicaoX,
  posicaoY,
  retanguloDaFaixa,
  type Ponto,
  type Serie,
} from '@/modules/health/tendencia'
import { foraDaFaixa, type Faixa } from '@/modules/health/faixas'

/**
 * A tendência de uma medida, desenhada em SVG no servidor.
 *
 * Sem biblioteca de gráfico e sem JavaScript no cliente: o desenho é uma
 * função dos dados, e o servidor já os tem. As cores saem dos tokens do tema,
 * então claro e escuro vêm de graça e a guarda de contraste não ganha par novo
 * para conferir.
 *
 * A geometria mora em `tendencia.ts`, testada sozinha. Aqui fica só a marcação.
 */

const LARGURA = 640
const ALTURA = 260
/** Espaço para os rótulos: o eixo vertical à esquerda, as datas embaixo. */
const MARGEM = { esquerda: 48, direita: 16, topo: 16, baixo: 28 }

const LARGURA_UTIL = LARGURA - MARGEM.esquerda - MARGEM.direita
const ALTURA_UTIL = ALTURA - MARGEM.topo - MARGEM.baixo

function numero(valor: number): string {
  return (Number.isInteger(valor) ? String(valor) : valor.toFixed(1)).replace('.', ',')
}

export function GraficoTendencia({
  serie,
  faixa,
  inicio,
  fim,
  rotulo,
  unidade,
}: {
  serie: Serie
  faixa: Faixa | null
  inicio: Date
  fim: Date
  rotulo: string
  unidade: string
}) {
  const { pontos, escala } = serie
  const banda = retanguloDaFaixa(faixa, escala, ALTURA_UTIL)

  const coordenada = (ponto: Ponto) => ({
    x: posicaoX(ponto.aferidoEm, inicio, fim, LARGURA_UTIL),
    y: posicaoY(ponto.valor, escala, ALTURA_UTIL),
  })

  const linha = pontos
    .map((ponto) => {
      const { x, y } = coordenada(ponto)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  // Quem não enxerga o desenho lê isto. Sem pontos não há mínimo nem máximo, e
  // `Math.min()` de lista vazia devolveria `Infinity` no meio da frase — a
  // página trata o vazio antes de chegar aqui, e a guarda diz isso em voz alta.
  const valores = pontos.map((p) => p.valor)
  const resumo = valores.length
    ? `${rotulo}: ${valores.length} ${
        valores.length === 1 ? 'aferição' : 'aferições'
      } entre ${formatarData(inicio)} e ${formatarData(fim)}, de ${numero(
        Math.min(...valores)
      )} a ${numero(Math.max(...valores))} ${unidade}.`
    : `${rotulo}: nenhuma aferição entre ${formatarData(inicio)} e ${formatarData(fim)}.`

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={resumo}
    >
      <title>{resumo}</title>

      <g transform={`translate(${MARGEM.esquerda}, ${MARGEM.topo})`}>
        {/* A faixa de normalidade, ao fundo. Sombreada e não delimitada por
            linha forte: ela é o contexto da leitura, não o dado.

            Na família de sucesso, e não em `realce`: aquele token pesa de
            formas diferentes nos dois temas — #f8f4f1 sobre branco some, e
            #32567b no escuro grita —, e a zona normal precisa ler igual nos
            dois. Verde para "dentro" também acompanha o âmbar e o vermelho que
            o resto do sistema já usa para problema. */}
        {banda && (
          <rect
            x={0}
            y={banda.y}
            width={LARGURA_UTIL}
            height={banda.altura}
            className="fill-sucesso-fundo"
          />
        )}

        {/* O quadro. */}
        <rect
          x={0}
          y={0}
          width={LARGURA_UTIL}
          height={ALTURA_UTIL}
          fill="none"
          className="stroke-borda-suave"
          strokeWidth={1}
        />

        {/* As bordas da faixa, tracejadas: é delas que a distância se lê. */}
        {faixa?.maximo != null && (
          <line
            x1={0}
            x2={LARGURA_UTIL}
            y1={posicaoY(faixa.maximo, escala, ALTURA_UTIL)}
            y2={posicaoY(faixa.maximo, escala, ALTURA_UTIL)}
            className="stroke-borda"
            strokeDasharray="4 3"
          />
        )}
        {faixa?.minimo != null && (
          <line
            x1={0}
            x2={LARGURA_UTIL}
            y1={posicaoY(faixa.minimo, escala, ALTURA_UTIL)}
            y2={posicaoY(faixa.minimo, escala, ALTURA_UTIL)}
            className="stroke-borda"
            strokeDasharray="4 3"
          />
        )}

        {/* A linha só existe com dois pontos. Um ponto sozinho não tem
            inclinação, e desenhar segmento nenhum é o que diz isso. */}
        {pontos.length > 1 && (
          <polyline
            points={linha}
            fill="none"
            className="stroke-acao"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Os pontos, sempre. Com aferição esparsa a linha mente sobre o que há
            entre duas medidas; o ponto mostra onde alguém mediu de verdade. */}
        {pontos.map((ponto, indice) => {
          const { x, y } = coordenada(ponto)
          const fora = faixa ? foraDaFaixa(ponto.valor, faixa) : false
          return (
            <circle
              key={`${ponto.aferidoEm.getTime()}-${indice}`}
              cx={x}
              cy={y}
              r={3.5}
              className={fora ? 'fill-perigo' : 'fill-acao'}
            />
          )
        })}
      </g>

      {/* Eixo vertical: só os extremos da escala. Uma grade inteira de números
          competiria com a linha, que é o que se veio ver. */}
      <text
        x={MARGEM.esquerda - 6}
        y={MARGEM.topo + 4}
        textAnchor="end"
        className="fill-apoio text-legenda"
      >
        {numero(escala.maximo)}
      </text>
      <text
        x={MARGEM.esquerda - 6}
        y={MARGEM.topo + ALTURA_UTIL}
        textAnchor="end"
        className="fill-apoio text-legenda"
      >
        {numero(escala.minimo)}
      </text>

      {/* Eixo horizontal: as duas pontas da janela. */}
      <text
        x={MARGEM.esquerda}
        y={ALTURA - 8}
        className="fill-apoio text-legenda"
      >
        {formatarData(inicio)}
      </text>
      <text
        x={LARGURA - MARGEM.direita}
        y={ALTURA - 8}
        textAnchor="end"
        className="fill-apoio text-legenda"
      >
        {formatarData(fim)}
      </text>
    </svg>
  )
}
