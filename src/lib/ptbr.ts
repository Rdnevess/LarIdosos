import type { StatusResidente, TipoDocumento } from '@prisma/client'

export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function validarCpf(valor: string): boolean {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const calcularDigito = (ate: number): number => {
    let soma = 0
    let peso = ate + 1
    for (let i = 0; i < ate; i++) {
      soma += Number(cpf[i]) * peso--
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10])
}

export function validarCnpj(valor: string): boolean {
  const cnpj = somenteDigitos(valor)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const calcularDigito = (ate: number): number => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * pesos[i]
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  return calcularDigito(12) === Number(cnpj[12]) && calcularDigito(13) === Number(cnpj[13])
}

export function formatarCpf(valor: string): string {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11) return valor
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data)
}

export function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
    .format(data)
    .replace(',', '')
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(valor)
    .replace(/ /g, ' ')
}

/**
 * Rótulo em português da situação do residente. A tela nunca mostra o valor
 * cru do enum — "FALECIDO" é identificador de código, e quem lê a ficha é a
 * equipe do Lar. Tipado com o enum do Prisma (e não `Record<string, string>`)
 * para que um status novo no schema quebre o `typecheck` aqui, em vez de
 * vazar cru para a tela; mesmo padrão de `ROTULO_VINCULO`, em
 * `src/components/formulario-funcionario.tsx`.
 */
export const ROTULO_STATUS_RESIDENTE: Record<StatusResidente, string> = {
  ATIVO: 'Ativo',
  DESLIGADO: 'Desligado',
  FALECIDO: 'Falecido',
}

/**
 * Rótulo em português do tipo de documento anexado. Tipado com o enum do
 * Prisma pelo mesmo motivo de `ROTULO_STATUS_RESIDENTE`: um tipo novo no
 * schema quebra o `typecheck` aqui em vez de aparecer cru na ficha — e, como
 * `tiposQuePodeAnexar` (`src/modules/residents/documentos.service.ts`) monta o
 * seletor a partir de `Object.values(TipoDocumento)`, um tipo sem rótulo
 * apareceria no seletor de anexo, não só na listagem.
 */
export const ROTULO_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  RG: 'RG',
  CPF: 'CPF',
  CNS: 'Cartão SUS',
  CERTIDAO: 'Certidão',
  LAUDO: 'Laudo',
  PROCURACAO: 'Procuração',
  TERMO_RESPONSABILIDADE: 'Termo de responsabilidade',
  TERMO_LGPD: 'Termo de ciência (LGPD)',
  FOTO: 'Foto',
  EXAME: 'Exame',
  COMPROVANTE_FISCAL: 'Comprovante fiscal',
  CONSELHO_PROFISSIONAL: 'Registro em conselho',
  OUTRO: 'Outro',
}
