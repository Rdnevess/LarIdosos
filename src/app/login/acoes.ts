'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/modules/auth/config'
import { destinoSeguro } from '@/lib/destino'

export async function entrar(_estadoAnterior: string | null, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      senha: formData.get('senha'),
      // Validado de novo aqui, e não confiado do campo oculto: o formulário
      // é postável à mão, e `destinoSeguro` é barato.
      redirectTo: destinoSeguro(formData.get('destino')?.toString()),
    })
    return null
  } catch (erro) {
    if (erro instanceof AuthError) {
      return 'E-mail ou senha incorretos.'
    }
    throw erro
  }
}
