import { formatarData, ROTULO_TIPO_DOCUMENTO } from '@/lib/ptbr'

/**
 * Rótulos dos valores que aparecem dentro do diff de auditoria. Sem isto, o
 * desligamento de um residente — um dos registros mais consultados da
 * trilha — mostraria "status: ATIVO → DESLIGADO", e a desativação de um
 * usuário mostraria "ativo: true → false" em inglês. Valores repetidos entre
 * enums diferentes (`OUTRO`, por exemplo) têm o mesmo rótulo em todos, então
 * reunir tudo numa única tabela não gera ambiguidade: nenhum enum do schema
 * usa o mesmo nome para dois significados distintos.
 */
export const ROTULO_VALOR: Record<string, string> = {
  COORDENACAO: 'Coordenação',
  SAUDE: 'Saúde',
  ADMINISTRATIVO: 'Administrativo',
  FEMININO: 'Feminino',
  MASCULINO: 'Masculino',
  ATIVO: 'Ativo',
  DESLIGADO: 'Desligado',
  FALECIDO: 'Falecido',
  APOSENTADORIA: 'Aposentadoria',
  BPC: 'BPC',
  PENSAO: 'Pensão',
  NENHUM: 'Nenhum',
  CLT: 'CLT',
  VOLUNTARIO: 'Voluntário',
  PRESTADOR: 'Prestador de serviço',
  ESTAGIO: 'Estágio',
  COMPORTAMENTO: 'Comportamento',
  VISITA_FAMILIA: 'Visita da família',
  OCORRENCIA: 'Ocorrência',
  SOCIAL: 'Social',
  JURIDICO: 'Jurídico',
  // TipoDocumento: `anexarDocumento` grava `tipo` no diff a cada anexo, então
  // sem estes a trilha mostraria "Tipo: — → TERMO_RESPONSABILIDADE". Reusa
  // `ROTULO_TIPO_DOCUMENTO` (`src/lib/ptbr.ts`), que é `Record<TipoDocumento,
  // string>`: um tipo novo no enum sem rótulo lá já quebra o typecheck, então
  // esta tabela duplicada herda a mesma proteção em vez de ficar descoberta.
  // Inclui `OUTRO: 'Outro'` — o mesmo rótulo que os outros enums usam para o
  // valor, então não há entrada duplicada acima para ele.
  ...ROTULO_TIPO_DOCUMENTO,
}

const ISO_DATA = /^\d{4}-\d{2}-\d{2}T/

/**
 * Formata um único lado (`de` ou `para`) de uma entrada de diff.
 * `null`/`undefined`/string vazia viram travessão, booleano vira "sim"/"não"
 * (nunca `true`/`false` cru), valor de enum conhecido ganha rótulo em
 * português, data ISO (é assim que `Date` viaja no JSON do diff) é formatada
 * no padrão brasileiro, e qualquer outro valor é exibido como está.
 */
export function formatarValorDiff(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'string') {
    if (ROTULO_VALOR[valor]) return ROTULO_VALOR[valor]
    // Datas viajam para o JSON como ISO; mostrar o carimbo cru na trilha é
    // ilegível para quem consulta.
    if (ISO_DATA.test(valor)) return formatarData(new Date(valor))
    return valor
  }
  return String(valor)
}

// `nomeCompleto` vira "Nome completo". Os campos são nomeados em português,
// só em camelCase — separar já os torna legíveis, sem exigir um dicionário
// de dezenas de entradas que envelheceria a cada campo novo do schema. As
// siglas são a exceção: sem este mapa, `cpf`/`cns`/`rg`/`ip`/`uf` sairiam
// "Cpf", "Cns", "Rg", "Ip", "Uf" — capitalização de palavra comum, não sigla.
const SIGLAS: Record<string, string> = {
  cpf: 'CPF',
  cns: 'CNS',
  rg: 'RG',
  ip: 'IP',
  uf: 'UF',
}

export function rotularCampo(campo: string): string {
  if (SIGLAS[campo]) return SIGLAS[campo]
  const separado = campo.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return separado.charAt(0).toUpperCase() + separado.slice(1)
}

export function formatarDiff(diff: unknown): string {
  if (!diff || typeof diff !== 'object') return '—'
  const entradas = Object.entries(diff as Record<string, { de: unknown; para: unknown }>)
  if (entradas.length === 0) return '—'
  return entradas
    .map(
      ([campo, { de, para }]) =>
        `${rotularCampo(campo)}: ${formatarValorDiff(de)} → ${formatarValorDiff(para)}`
    )
    .join(' · ')
}
