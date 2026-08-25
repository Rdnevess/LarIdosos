import { redirect } from 'next/navigation'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { destinoSeguro } from '@/lib/destino'
import { FormularioLogin } from './formulario'

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>
}) {
  const { proximo } = await searchParams
  // `destinoSeguro` decide, e não o valor cru: ele vem da barra de endereço.
  const destino = destinoSeguro(proximo)

  // Quem já tem sessão e cai aqui por um link também merece ir para onde o link
  // apontava, e não para o padrão.
  const ctx = await obterCtxOuNulo()
  if (ctx) redirect(destino)

  return <FormularioLogin destino={destino} />
}
