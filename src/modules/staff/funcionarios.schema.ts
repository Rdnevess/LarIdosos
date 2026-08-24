import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

export const novoFuncionarioSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  cpf: z
    .string()
    .trim()
    .transform(somenteDigitos)
    .refine(validarCpf, { message: 'CPF inválido' }),
  rg: z.string().trim().nullish(),
  cargo: z.string().trim().min(2, 'Informe o cargo'),
  vinculo: z.enum(['CLT', 'VOLUNTARIO', 'PRESTADOR', 'ESTAGIO']),
  dataAdmissao: z.date(),
  telefone: z.string().trim().nullish(),
  email: z.string().trim().email('E-mail inválido').nullish().or(z.literal('')),
  logradouro: z.string().trim().nullish(),
  numero: z.string().trim().nullish(),
  bairro: z.string().trim().nullish(),
  cidade: z.string().trim().nullish(),
  uf: z.string().trim().length(2).toUpperCase().nullish(),
  cep: z.string().trim().nullish(),
  conselhoSigla: z.string().trim().nullish(),
  conselhoNumero: z.string().trim().nullish(),
  conselhoUf: z.string().trim().length(2).toUpperCase().nullish(),
  conselhoValidade: z.date().nullish(),
})

export const atualizacaoFuncionarioSchema = novoFuncionarioSchema.partial()

export const desligamentoFuncionarioSchema = z.object({
  dataDesligamento: z.date(),
  motivoDesligamento: z.string().trim().min(3, 'Informe o motivo do desligamento'),
})

export type DadosNovoFuncionario = z.input<typeof novoFuncionarioSchema>
export type DadosAtualizacaoFuncionario = z.input<typeof atualizacaoFuncionarioSchema>
export type DadosDesligamentoFuncionario = z.infer<typeof desligamentoFuncionarioSchema>
