import type { VinculoFuncionario } from '@prisma/client'
import type { PropsCampo } from './campo'

export const CAMPOS_FUNCIONARIO: PropsCampo[] = [
  { nome: 'nomeCompleto', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'cpf', rotulo: 'CPF', obrigatorio: true },
  { nome: 'rg', rotulo: 'RG' },
  { nome: 'cargo', rotulo: 'Cargo', obrigatorio: true },
  {
    nome: 'vinculo',
    rotulo: 'Vínculo',
    obrigatorio: true,
    opcoes: [
      { valor: 'CLT', rotulo: 'CLT' },
      { valor: 'VOLUNTARIO', rotulo: 'Voluntário' },
      { valor: 'PRESTADOR', rotulo: 'Prestador de serviço' },
      { valor: 'ESTAGIO', rotulo: 'Estágio' },
    ],
  },
  { nome: 'dataAdmissao', rotulo: 'Data de admissão', tipo: 'date' as const, obrigatorio: true },
  { nome: 'telefone', rotulo: 'Telefone' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' as const },
  { nome: 'conselhoSigla', rotulo: 'Conselho (COREN, CRM, CRN…)' },
  { nome: 'conselhoNumero', rotulo: 'Número do registro' },
  { nome: 'conselhoUf', rotulo: 'UF do conselho' },
  { nome: 'conselhoValidade', rotulo: 'Validade do registro', tipo: 'date' as const },
]

/**
 * Rótulo legível do vínculo empregatício, usado na listagem — a interface
 * nunca mostra o valor cru do enum (`VOLUNTARIO`, `PRESTADOR`, `ESTAGIO`),
 * mesmo problema que a Tarefa 14 precisou corrigir para `VISITA_FAMILIA`.
 * Tipado com o enum do Prisma (não `Record<string, string>`) para que um novo
 * valor de vínculo sem rótulo quebre o `typecheck`, não a tela.
 */
export const ROTULO_VINCULO: Record<VinculoFuncionario, string> = {
  CLT: 'CLT',
  VOLUNTARIO: 'Voluntário',
  PRESTADOR: 'Prestador de serviço',
  ESTAGIO: 'Estágio',
}
