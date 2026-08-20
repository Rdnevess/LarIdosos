'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/modules/auth/config'

export async function entrar(_estadoAnterior: string | null, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      senha: formData.get('senha'),
      redirectTo: '/residentes',
    })
    return null
  } catch (erro) {
    if (erro instanceof AuthError) {
      return 'E-mail ou senha incorretos.'
    }
    throw erro
  }
}
