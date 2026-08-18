import { z } from 'zod'

export const papelSchema = z.enum(['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'])

export const novoUsuarioSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  nome: z.string().trim().min(3, 'Informe o nome completo'),
  papel: papelSchema,
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  funcionarioId: z.string().cuid().optional(),
})

export const atualizacaoUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo').optional(),
  papel: papelSchema.optional(),
  funcionarioId: z.string().cuid().nullable().optional(),
})

export type DadosNovoUsuario = z.infer<typeof novoUsuarioSchema>
export type DadosAtualizacaoUsuario = z.infer<typeof atualizacaoUsuarioSchema>
