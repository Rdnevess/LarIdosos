import { redirect } from 'next/navigation'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { FormularioLogin } from './formulario'

export default async function PaginaLogin() {
  const ctx = await obterCtxOuNulo()
  if (ctx) redirect('/residentes')

  return <FormularioLogin />
}
