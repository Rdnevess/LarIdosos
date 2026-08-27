/**
 * As faixas de referência dos sinais vitais, e a comparação que decide se um
 * valor alerta.
 *
 * Módulo **puro**, sem banco: é a regra que decide quem é alertado, e regra
 * assim precisa ser testável sozinha — como `janela-edicao.ts` e `turno.ts`.
 *
 * Estas faixas são de **normalidade**, e não de urgência. A consequência foi
 * aceita ao decidir: quem viver fora delas e não tiver ajuste gera alerta todo
 * dia, e idoso hipertenso em ILPI é a regra. O ajuste por residente existe
 * para isso — ver a §3 da spec.
 */

export type MedidaVital =
  | 'PRESSAO_SISTOLICA'
  | 'PRESSAO_DIASTOLICA'
  | 'FREQUENCIA_CARDIACA'
  | 'FREQUENCIA_RESPIRATORIA'
  | 'TEMPERATURA'
  | 'SATURACAO_O2'
  | 'GLICEMIA'

export type Faixa = { minimo: number | null; maximo: number | null }

/**
 * `peso` fica de fora de propósito: ele só significa alguma coisa como
 * tendência, e um alerta por faixa fixa diria algo que não quer dizer nada.
 */
export const MEDIDAS_VITAIS = [
  'PRESSAO_SISTOLICA',
  'PRESSAO_DIASTOLICA',
  'FREQUENCIA_CARDIACA',
  'FREQUENCIA_RESPIRATORIA',
  'TEMPERATURA',
  'SATURACAO_O2',
  'GLICEMIA',
] as const satisfies readonly MedidaVital[]

/**
 * O campo de `SinalVital` que cada medida lê.
 *
 * Tipado contra as chaves do modelo, e não como `string`: um campo renomeado no
 * schema quebra o typecheck aqui, em vez de virar uma medida que nunca alerta
 * porque a propriedade não existe.
 */
export const CAMPO_DA_MEDIDA = {
  PRESSAO_SISTOLICA: 'pressaoSistolica',
  PRESSAO_DIASTOLICA: 'pressaoDiastolica',
  FREQUENCIA_CARDIACA: 'frequenciaCardiaca',
  FREQUENCIA_RESPIRATORIA: 'frequenciaRespiratoria',
  TEMPERATURA: 'temperatura',
  SATURACAO_O2: 'saturacaoO2',
  GLICEMIA: 'glicemia',
} as const satisfies Record<MedidaVital, string>

export const ROTULO_MEDIDA: Record<MedidaVital, string> = {
  PRESSAO_SISTOLICA: 'Pressão sistólica',
  PRESSAO_DIASTOLICA: 'Pressão diastólica',
  FREQUENCIA_CARDIACA: 'Frequência cardíaca',
  FREQUENCIA_RESPIRATORIA: 'Frequência respiratória',
  TEMPERATURA: 'Temperatura',
  SATURACAO_O2: 'Saturação de O₂',
  GLICEMIA: 'Glicemia',
}

/**
 * O ponto de partida de quem não tem ajuste.
 *
 * **Estes números são proposta, e esperam a equipe de saúde do Lar** (§3.1 e
 * §11 da spec). Trocá-los é trocar esta tabela; nada mais no desenho depende
 * dos valores.
 */
export const FAIXAS_DO_SISTEMA: Record<MedidaVital, Faixa> = {
  PRESSAO_SISTOLICA: { minimo: 90, maximo: 140 },
  PRESSAO_DIASTOLICA: { minimo: 60, maximo: 90 },
  FREQUENCIA_CARDIACA: { minimo: 50, maximo: 100 },
  FREQUENCIA_RESPIRATORIA: { minimo: 12, maximo: 20 },
  TEMPERATURA: { minimo: 35.5, maximo: 37.8 },
  // Sem máximo: não existe saturação alta demais.
  SATURACAO_O2: { minimo: 92, maximo: null },
  GLICEMIA: { minimo: 70, maximo: 180 },
}

/**
 * As bordas são **inclusivas**: um mínimo de 90 quer dizer "90 está bom".
 * Alertar em 90 tornaria a faixa uma coisa e o texto dela outra.
 */
export function foraDaFaixa(valor: number, faixa: Faixa): boolean {
  if (faixa.minimo !== null && valor < faixa.minimo) return true
  if (faixa.maximo !== null && valor > faixa.maximo) return true
  return false
}

export function faixaVigente(
  medida: MedidaVital,
  ajustes: { medida: MedidaVital; minimo: number | null; maximo: number | null }[]
): Faixa {
  const ajuste = ajustes.find((a) => a.medida === medida)
  if (!ajuste) return FAIXAS_DO_SISTEMA[medida]
  return { minimo: ajuste.minimo, maximo: ajuste.maximo }
}
