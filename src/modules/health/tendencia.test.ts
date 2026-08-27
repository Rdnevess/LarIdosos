import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  MEDIDAS_GRAFICO,
  faixaDoGrafico,
  montarSerie,
  JANELA_PADRAO,
  MEDIDA_PADRAO,
  janelaDaUrl,
  medidaDaUrl,
  posicaoX,
  posicaoY,
} from './tendencia'
import { FAIXAS_DO_SISTEMA, MEDIDAS_VITAIS } from './faixas'

/** Uma aferição só com o que o teste precisa dizer; o resto vem nulo. */
function afericao(campos: {
  aferidoEm: Date
  pressaoSistolica?: number | null
  peso?: number | null
}) {
  return {
    aferidoEm: campos.aferidoEm,
    pressaoSistolica: campos.pressaoSistolica ?? null,
    pressaoDiastolica: null,
    frequenciaCardiaca: null,
    frequenciaRespiratoria: null,
    temperatura: null,
    saturacaoO2: null,
    glicemia: null,
    peso: campos.peso === undefined || campos.peso === null
      ? null
      : new Prisma.Decimal(campos.peso),
  }
}

describe('montarSerie', () => {
  it('devolve os pontos do mais antigo para o mais recente', () => {
    // O serviço entrega decrescente, porque as telas mostram o recente
    // primeiro. Um gráfico desenhado nessa ordem correria para trás no tempo.
    const serie = montarSerie(
      [
        afericao({ aferidoEm: new Date('2026-08-20T10:00:00Z'), pressaoSistolica: 130 }),
        afericao({ aferidoEm: new Date('2026-08-10T10:00:00Z'), pressaoSistolica: 120 }),
        afericao({ aferidoEm: new Date('2026-08-15T10:00:00Z'), pressaoSistolica: 125 }),
      ],
      'PRESSAO_SISTOLICA',
      { minimo: 90, maximo: 140 }
    )

    expect(serie.pontos.map((p) => p.valor)).toEqual([120, 125, 130])
  })
})

describe('escala', () => {
  it('contém a faixa inteira, mesmo com os pontos todos no meio dela', () => {
    // Sem isto, três aferições entre 120 e 130 dariam um eixo de 120 a 130, e
    // a faixa de 90 a 140 sairia do quadro. Quem olha perderia a única coisa
    // que o gráfico tem a dizer: o quanto ainda falta para sair dela.
    const serie = montarSerie(
      [
        afericao({ aferidoEm: new Date('2026-08-10T10:00:00Z'), pressaoSistolica: 120 }),
        afericao({ aferidoEm: new Date('2026-08-20T10:00:00Z'), pressaoSistolica: 130 }),
      ],
      'PRESSAO_SISTOLICA',
      { minimo: 90, maximo: 140 }
    )

    expect(serie.escala.minimo).toBeLessThanOrEqual(90)
    expect(serie.escala.maximo).toBeGreaterThanOrEqual(140)
  })

  it('sem ponto nenhum e sem faixa, continua um número', () => {
    // `Math.min()` sem argumentos devolve `Infinity`, e `Math.max()` devolve
    // `-Infinity`. Os dois viram `NaN` na conta da posição e saem no atributo
    // do SVG, que não desenha e não reclama. Peso é o caso: não tem faixa, e
    // um residente sem pesagem no período não tem ponto.
    const serie = montarSerie([], 'PESO', null)

    expect(Number.isFinite(serie.escala.minimo)).toBe(true)
    expect(Number.isFinite(serie.escala.maximo)).toBe(true)
  })
})

describe('posicaoY', () => {
  it('inverte o eixo: o maior valor fica no alto do quadro', () => {
    // No SVG o `y` cresce para baixo. Sem a inversão o gráfico sai de cabeça
    // para baixo, e uma pressão que sobe desenharia uma linha que desce.
    const escala = { minimo: 90, maximo: 140 }

    expect(posicaoY(140, escala, 200)).toBe(0)
    expect(posicaoY(90, escala, 200)).toBe(200)
    expect(posicaoY(115, escala, 200)).toBe(100)
  })
})

describe('posicaoY com escala sem amplitude', () => {
  it('um valor só não divide por zero', () => {
    // Uma pesagem só no período, ou duas iguais: mínimo e máximo coincidem e a
    // divisão dá `Infinity` ou `NaN`. O SVG recebe o atributo, não desenha e
    // não reclama — o gráfico some sem ninguém saber por quê.
    const escala = { minimo: 72, maximo: 72 }

    expect(posicaoY(72, escala, 200)).toBe(100)
  })
})

describe('faixaDoGrafico', () => {
  it('peso não tem faixa', () => {
    // Peso é a medida que só significa alguma coisa como tendência — é o que
    // o item 4 das pendências do alerta registra. Devolver faixa para ele
    // seria o primeiro passo para peso voltar a alertar por faixa fixa.
    expect(faixaDoGrafico('PESO', [])).toBeNull()
  })

  it('as demais usam a faixa vigente do residente', () => {
    // Sem ajuste é a do sistema; com ajuste é a dele. Quem decide é
    // `faixaVigente`, e o gráfico não pode ter uma segunda opinião: a faixa
    // desenhada precisa ser a mesma que alerta.
    expect(faixaDoGrafico('PRESSAO_SISTOLICA', [])).toEqual(
      FAIXAS_DO_SISTEMA.PRESSAO_SISTOLICA
    )
    expect(
      faixaDoGrafico('PRESSAO_SISTOLICA', [
        { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
      ])
    ).toEqual({ minimo: 110, maximo: 160 })
  })
})

describe('MEDIDAS_GRAFICO', () => {
  it('tem as sete que alertam mais o peso, e o alerta continua com sete', () => {
    // A guarda da decisão: o gráfico é um superconjunto do alerta. Se alguém
    // acrescentar PESO a MEDIDAS_VITAIS para "aproveitar", peso passa a
    // alertar por faixa fixa — que é justamente o que ficou decidido não fazer.
    expect(MEDIDAS_GRAFICO).toHaveLength(MEDIDAS_VITAIS.length + 1)
    expect(MEDIDAS_GRAFICO).toContain('PESO')
    expect(MEDIDAS_VITAIS as readonly string[]).not.toContain('PESO')
  })
})

describe('posicaoX', () => {
  it('põe cada ponto na data em que foi aferido, e não em passo igual', () => {
    // Espaçar os pontos por igual seria mentir sobre o tempo: três pesagens em
    // três dias e depois um vão de dois meses desenhariam a mesma inclinação
    // de quatro pesagens semanais.
    // Janela de dez dias em trezentas unidades: cada dia vale trinta.
    const inicio = new Date('2026-08-01T00:00:00Z')
    const fim = new Date('2026-08-11T00:00:00Z')

    expect(posicaoX(inicio, inicio, fim, 300)).toBe(0)
    expect(posicaoX(fim, inicio, fim, 300)).toBe(300)
    expect(posicaoX(new Date('2026-08-03T00:00:00Z'), inicio, fim, 300)).toBe(60)
    expect(posicaoX(new Date('2026-08-10T00:00:00Z'), inicio, fim, 300)).toBe(270)
  })

  it('janela sem duração não divide por zero', () => {
    const instante = new Date('2026-08-01T00:00:00Z')
    expect(posicaoX(instante, instante, instante, 300)).toBe(150)
  })
})

describe('leitura dos parâmetros da URL', () => {
  it('medida desconhecida cai no padrão em vez de estourar', () => {
    // O parâmetro vem da barra de endereço, então é entrada de quem usa: um
    // `?medida=BANANA` não pode derrubar a tela nem indexar `undefined`.
    expect(medidaDaUrl('BANANA')).toBe(MEDIDA_PADRAO)
    expect(medidaDaUrl(undefined)).toBe(MEDIDA_PADRAO)
    expect(medidaDaUrl('TEMPERATURA')).toBe('TEMPERATURA')
  })

  it('janela fora das três ofertadas cai no padrão', () => {
    // Sem isto, `?dias=100000` viraria uma consulta de todo o histórico por
    // uma URL que ninguém ofereceu.
    expect(janelaDaUrl('100000')).toBe(JANELA_PADRAO)
    expect(janelaDaUrl('abacaxi')).toBe(JANELA_PADRAO)
    expect(janelaDaUrl(undefined)).toBe(JANELA_PADRAO)
    expect(janelaDaUrl('30')).toBe(30)
  })
})

describe('conversão do Decimal', () => {
  it('peso vem como Decimal do banco e vira número', () => {
    // `temperatura` e `peso` são `Decimal` no schema. Um `Decimal` sobrevive
    // à comparação e à aritmética sem reclamar, dando resultado errado calado
    // — é o mesmo motivo do `Number(...)` em `alertas-vitais.ts`.
    const serie = montarSerie(
      [afericao({ aferidoEm: new Date('2026-08-10T10:00:00Z'), peso: 72.5 })],
      'PESO',
      null
    )

    expect(serie.pontos[0].valor).toBe(72.5)
    expect(typeof serie.pontos[0].valor).toBe('number')
  })
})
