import type { SinalVital } from '@prisma/client'
import {
  MEDIDAS_VITAIS,
  ROTULO_MEDIDA,
  faixaVigente,
  type Faixa,
  type MedidaVital,
} from './faixas'

/**
 * A série de uma medida ao longo do tempo, e a geometria que a desenha.
 *
 * Módulo **puro**, sem banco, como `faixas.ts` e `turno.ts`: é a regra que
 * decide onde cada ponto cai no quadro, e regra assim precisa ser testável
 * sozinha.
 */

/**
 * O domínio do gráfico é um **superconjunto** do domínio do alerta.
 *
 * `MedidaVital` tem sete valores, e peso não é um deles — a exclusão está
 * comentada em `faixas.ts` e é deliberada: alerta por faixa fixa de peso diria
 * algo que não quer dizer nada. Peso entra aqui, onde tendência é justamente o
 * que se mostra, e **não** lá, onde viraria alerta de carona.
 */
export type MedidaGrafico = MedidaVital | 'PESO'

/**
 * As oito medidas que o gráfico desenha, na ordem em que o seletor as mostra.
 *
 * Derivada de `MEDIDAS_VITAIS` em vez de reescrita: uma medida nova que passe
 * a alertar entra no gráfico sozinha, e as duas listas não podem divergir.
 */
export const MEDIDAS_GRAFICO = [
  ...MEDIDAS_VITAIS,
  'PESO',
] as const satisfies readonly MedidaGrafico[]

export const ROTULO_GRAFICO: Record<MedidaGrafico, string> = {
  ...ROTULO_MEDIDA,
  PESO: 'Peso',
}

/**
 * A faixa desenhada atrás da linha — a mesma que alerta, nunca uma segunda
 * opinião. Peso não tem: ver o item 4 das pendências do alerta de sinal vital.
 */
export function faixaDoGrafico(
  medida: MedidaGrafico,
  ajustes: { medida: MedidaVital; minimo: number | null; maximo: number | null }[]
): Faixa | null {
  if (medida === 'PESO') return null
  return faixaVigente(medida, ajustes)
}

/** O que o gráfico precisa de uma aferição. */
export type AfericaoDoGrafico = Pick<
  SinalVital,
  | 'aferidoEm'
  | 'pressaoSistolica'
  | 'pressaoDiastolica'
  | 'frequenciaCardiaca'
  | 'frequenciaRespiratoria'
  | 'temperatura'
  | 'saturacaoO2'
  | 'glicemia'
  | 'peso'
>

/**
 * O campo de `SinalVital` que cada medida do gráfico lê.
 *
 * Tipado contra as chaves do modelo, como o `CAMPO_DA_MEDIDA` de `faixas.ts`:
 * um campo renomeado no schema quebra o typecheck aqui, em vez de virar uma
 * linha que nunca desenha porque a propriedade não existe.
 */
export const CAMPO_DO_GRAFICO = {
  PRESSAO_SISTOLICA: 'pressaoSistolica',
  PRESSAO_DIASTOLICA: 'pressaoDiastolica',
  FREQUENCIA_CARDIACA: 'frequenciaCardiaca',
  FREQUENCIA_RESPIRATORIA: 'frequenciaRespiratoria',
  TEMPERATURA: 'temperatura',
  SATURACAO_O2: 'saturacaoO2',
  GLICEMIA: 'glicemia',
  PESO: 'peso',
} as const satisfies Record<MedidaGrafico, keyof AfericaoDoGrafico>

export type Ponto = { aferidoEm: Date; valor: number }

/** O intervalo que o eixo vertical precisa cobrir. */
export type Escala = { minimo: number; maximo: number }

export type Serie = { pontos: Ponto[]; escala: Escala }

export function montarSerie(
  afericoes: AfericaoDoGrafico[],
  medida: MedidaGrafico,
  faixa: Faixa | null
): Serie {
  const pontos: Ponto[] = []

  for (const afericao of afericoes) {
    const bruto = afericao[CAMPO_DO_GRAFICO[medida]]
    if (bruto === null) continue
    pontos.push({ aferidoEm: afericao.aferidoEm, valor: Number(bruto) })
  }

  // Crescente no tempo. O serviço entrega decrescente, porque as telas mostram
  // o recente primeiro; um gráfico nessa ordem correria para trás.
  pontos.sort((a, b) => a.aferidoEm.getTime() - b.aferidoEm.getTime())

  // A escala cobre os pontos **e** a faixa. Só os pontos, e três aferições
  // entre 120 e 130 dariam um eixo de 120 a 130 com a faixa fora do quadro —
  // e é a distância até a borda dela que o gráfico existe para mostrar.
  const limites = pontos.map((p) => p.valor)
  if (faixa?.minimo != null) limites.push(faixa.minimo)
  if (faixa?.maximo != null) limites.push(faixa.maximo)

  // Sem limite nenhum — peso de quem não foi pesado no período — `Math.min()`
  // devolveria `Infinity`, que vira `NaN` na conta da posição e sai no
  // atributo do SVG sem desenhar e sem reclamar. Zero a zero não desenha nada
  // tampouco, mas falha de um jeito que se enxerga.
  const escala = limites.length
    ? { minimo: Math.min(...limites), maximo: Math.max(...limites) }
    : { minimo: 0, maximo: 0 }

  return { pontos, escala }
}

/**
 * Onde um valor cai no eixo vertical, em unidades do SVG.
 *
 * O `y` do SVG cresce **para baixo**: o maior valor da escala vale zero, e o
 * menor vale a altura inteira. Sem a inversão, uma pressão que sobe desenharia
 * uma linha que desce.
 */
export function posicaoY(valor: number, escala: Escala, altura: number): number {
  const amplitude = escala.maximo - escala.minimo
  // Escala sem amplitude — um ponto só, ou vários iguais — dividiria por zero.
  // No meio do quadro é a única leitura honesta: não há variação a mostrar.
  if (amplitude === 0) return altura / 2
  return ((escala.maximo - valor) / amplitude) * altura
}

/**
 * Onde uma data cai no eixo horizontal, em unidades do SVG.
 *
 * Pela **data**, e não em passo igual entre os pontos: três pesagens em três
 * dias seguidas de um vão de dois meses desenhariam, em passo igual, a mesma
 * inclinação de quatro pesagens semanais. O eixo é o tempo, e ele precisa
 * dizer a verdade sobre o intervalo entre uma aferição e a seguinte.
 */
export function posicaoX(
  quando: Date,
  inicio: Date,
  fim: Date,
  largura: number
): number {
  const duracao = fim.getTime() - inicio.getTime()
  if (duracao === 0) return largura / 2
  return ((quando.getTime() - inicio.getTime()) / duracao) * largura
}

/**
 * As três janelas ofertadas, em dias.
 *
 * Trinta dias é o que responde à dúvida que a pendência 2 do alerta admite ter
 * — com que frequência o Lar afere. Se o gráfico de trinta dias vier quase
 * vazio, a resposta apareceu sozinha, sem ninguém precisar perguntar.
 */
export const JANELAS = [30, 90, 365] as const
export type Janela = (typeof JANELAS)[number]

export const JANELA_PADRAO: Janela = 90

/**
 * Peso abre a tela por ser a única medida sem alerta nenhum: para as outras
 * sete, o alerta já avisa quando o número sai da faixa, e o gráfico é a
 * segunda leitura. Para o peso, ele é a única.
 */
export const MEDIDA_PADRAO: MedidaGrafico = 'PESO'

/**
 * Os dois parâmetros vêm da barra de endereço, e portanto de quem usa. Valor
 * que não esteja na lista cai no padrão: `?medida=BANANA` indexaria `undefined`
 * e derrubaria a tela, e `?dias=100000` viraria uma consulta de todo o
 * histórico por uma URL que ninguém ofereceu.
 */
export function medidaDaUrl(bruto: string | undefined): MedidaGrafico {
  const achada = MEDIDAS_GRAFICO.find((medida) => medida === bruto)
  return achada ?? MEDIDA_PADRAO
}

export function janelaDaUrl(bruto: string | undefined): Janela {
  const achada = JANELAS.find((dias) => String(dias) === bruto)
  return achada ?? JANELA_PADRAO
}
