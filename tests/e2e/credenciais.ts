/**
 * Credenciais do usuário-semente, as mesmas de `prisma/seed.ts`. Ficam num
 * módulo só para o `global-setup` (que grava o usuário) e o `auth.setup`
 * (que faz o login) não divergirem.
 */
export const EMAIL_SEMENTE = 'coordenacao@lar.local'
export const SENHA_SEMENTE = 'trocar-esta-senha-123'
