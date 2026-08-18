import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

const cpfOpcional = z
  .string()
  .trim()
  .optional()
  .transform((valor) => (valor ? somenteDigitos(valor) : undefined))
  .refine((valor) => valor === undefined || validarCpf(valor), {
    message: 'CPF inválido',
  })

const dataNoPassado = (mensagem: string) =>
  z.date().refine((data) => data.getTime() <= Date.now(), { message: mensagem })

export const novoResidenteSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  nomeSocial: z.string().trim().optional(),
  dataNascimento: dataNoPassado('A data de nascimento não pode estar no futuro'),
  sexo: z.enum(['FEMININO', 'MASCULINO', 'OUTRO']),
  estadoCivil: z.string().trim().optional(),
  naturalidade: z.string().trim().optional(),
  nacionalidade: z.string().trim().default('Brasileira'),
  religiao: z.string().trim().optional(),
  escolaridade: z.string().trim().optional(),
  cpf: cpfOpcional,
  rg: z.string().trim().optional(),
  orgaoEmissorRg: z.string().trim().optional(),
  cns: z.string().trim().optional(),
  dataAdmissao: dataNoPassado('A data de admissão não pode estar no futuro'),
  origemAdmissao: z.string().trim().optional(),
  motivoAdmissao: z.string().trim().optional(),
  quarto: z.string().trim().optional(),
  leito: z.string().trim().optional(),
  planoSaude: z.string().trim().optional(),
  numeroPlanoSaude: z.string().trim().optional(),
  beneficioTipo: z.enum(['APOSENTADORIA', 'BPC', 'PENSAO', 'NENHUM']).optional(),
  beneficioNumero: z.string().trim().optional(),
  beneficioValor: z.number().nonnegative().optional(),
})

export const atualizacaoResidenteSchema = novoResidenteSchema.partial()

export const desligamentoSchema = z.object({
  status: z.enum(['DESLIGADO', 'FALECIDO']),
  dataSaida: z.date(),
  motivoSaida: z.string().trim().min(3, 'Informe o motivo da saída'),
  observacaoSaida: z.string().trim().optional(),
})

export type DadosNovoResidente = z.input<typeof novoResidenteSchema>
export type DadosAtualizacaoResidente = z.input<typeof atualizacaoResidenteSchema>
export type DadosDesligamento = z.infer<typeof desligamentoSchema>
