/**
 * Credenciais dos usuários de teste, garantidos pelo `global-setup` (que os
 * grava) e usados pelo `auth.setup` (que faz o login). Ficam num módulo só
 * para os dois não divergirem.
 *
 * O usuário de coordenação é o mesmo de `prisma/seed.ts`. O de saúde existe
 * só para o E2E: metade da interface é condicionada a papel e, até a Tarefa
 * 19, nenhum teste jamais a executou com outro perfil que não a coordenação —
 * foi exatamente aí que o defeito do anexo clínico se escondeu.
 */
export const EMAIL_SEMENTE = 'coordenacao@lar.local'
export const SENHA_SEMENTE = 'trocar-esta-senha-123'

export const EMAIL_SAUDE = 'enfermagem.e2e@lar.local'
export const SENHA_SAUDE = 'senha-de-teste-saude-123'

/**
 * Terceiro perfil, criado na Fase 2A pelo mesmo motivo que criou o segundo: o
 * prontuário inteiro é recusado a este papel, e uma fronteira que nenhum teste
 * atravessa é uma fronteira que ninguém sabe se existe.
 */
export const EMAIL_ADMINISTRATIVO = 'administrativo.e2e@lar.local'
export const SENHA_ADMINISTRATIVO = 'senha-de-teste-admin-123'

/**
 * Residente fixo que o perfil SAUDE usa. Precisa vir pronto do
 * `global-setup`: SAUDE não pode cadastrar residente (`criarResidente` exige
 * COORDENACAO ou ADMINISTRATIVO), então o próprio teste não teria como criar
 * o seu.
 */
export const NOME_RESIDENTE_SAUDE = 'Residente Perfil Saude E2E'
