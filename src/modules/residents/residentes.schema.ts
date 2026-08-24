import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

const cpfOpcional = z
  .string()
  .trim()
  .nullish()
  // `== null` cobre ausente (`undefined`) e limpo (`null`) preservando qual
  // era: o primeiro some em `semIndefinidos`, o segundo grava `null`. Sem
  // isto o transform devolveria `undefined` nos dois casos e apagar o CPF
  // pela tela não teria efeito nenhum.
  .transform((valor) => {
    if (valor == null) return valor
    const digitos = somenteDigitos(valor)
    return digitos === '' ? null : digitos
  })
  .refine((valor) => valor == null || validarCpf(valor), {
    message: 'CPF inválido',
  })

const dataNoPassado = (mensagem: string) =>
  z.date().refine((data) => data.getTime() <= Date.now(), { message: mensagem })

export const novoResidenteSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  nomeSocial: z.string().trim().nullish(),
  dataNascimento: dataNoPassado('A data de nascimento não pode estar no futuro'),
  sexo: z.enum(['FEMININO', 'MASCULINO', 'OUTRO']),
  estadoCivil: z.string().trim().nullish(),
  naturalidade: z.string().trim().nullish(),
  nacionalidade: z.string().trim().default('Brasileira'),
  religiao: z.string().trim().nullish(),
  escolaridade: z.string().trim().nullish(),
  cpf: cpfOpcional,
  rg: z.string().trim().nullish(),
  orgaoEmissorRg: z.string().trim().nullish(),
  cns: z.string().trim().nullish(),
  dataAdmissao: dataNoPassado('A data de admissão não pode estar no futuro'),
  origemAdmissao: z.string().trim().nullish(),
  motivoAdmissao: z.string().trim().nullish(),
  quarto: z.string().trim().nullish(),
  leito: z.string().trim().nullish(),
  planoSaude: z.string().trim().nullish(),
  numeroPlanoSaude: z.string().trim().nullish(),
  beneficioTipo: z.enum(['APOSENTADORIA', 'BPC', 'PENSAO', 'NENHUM']).nullish(),
  beneficioNumero: z.string().trim().nullish(),
  beneficioValor: z.number().nonnegative().nullish(),
})

export const atualizacaoResidenteSchema = novoResidenteSchema.partial()

export const desligamentoSchema = z.object({
  // `errorMap` porque a mensagem padrão do Zod para enum sai em inglês
  // ("Invalid enum value. Expected 'DESLIGADO' | 'FALECIDO'…") e chegaria à
  // tela pelo `executarAcao`. Valor fora dos dois é recusado — não é aceito
  // em silêncio nem convertido para um padrão.
  status: z.enum(['DESLIGADO', 'FALECIDO'], {
    errorMap: () => ({ message: 'Informe se o residente foi desligado ou faleceu' }),
  }),
  dataSaida: z.date(),
  motivoSaida: z.string().trim().min(3, 'Informe o motivo da saída'),
  observacaoSaida: z.string().trim().nullish(),
})

export type DadosNovoResidente = z.input<typeof novoResidenteSchema>
export type DadosAtualizacaoResidente = z.input<typeof atualizacaoResidenteSchema>
export type DadosDesligamento = z.infer<typeof desligamentoSchema>
