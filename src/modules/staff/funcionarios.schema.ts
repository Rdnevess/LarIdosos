import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

export const novoFuncionarioSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  cpf: z
    .string()
    .trim()
    .transform(somenteDigitos)
    .refine(validarCpf, { message: 'CPF inválido' }),
  rg: z.string().trim().optional(),
  cargo: z.string().trim().min(2, 'Informe o cargo'),
  vinculo: z.enum(['CLT', 'VOLUNTARIO', 'PRESTADOR', 'ESTAGIO']),
  dataAdmissao: z.date(),
  telefone: z.string().trim().optional(),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  cep: z.string().trim().optional(),
  conselhoSigla: z.string().trim().optional(),
  conselhoNumero: z.string().trim().optional(),
  conselhoUf: z.string().trim().length(2).toUpperCase().optional(),
  conselhoValidade: z.date().optional(),
})

export const atualizacaoFuncionarioSchema = novoFuncionarioSchema.partial()

export const desligamentoFuncionarioSchema = z.object({
  dataDesligamento: z.date(),
  motivoDesligamento: z.string().trim().min(3, 'Informe o motivo do desligamento'),
})

export type DadosNovoFuncionario = z.input<typeof novoFuncionarioSchema>
export type DadosAtualizacaoFuncionario = z.input<typeof atualizacaoFuncionarioSchema>
export type DadosDesligamentoFuncionario = z.infer<typeof desligamentoFuncionarioSchema>
