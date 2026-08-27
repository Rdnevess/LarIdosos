import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { listarFaixas } from '@/modules/health/faixas.service'
import { FAIXAS_DO_SISTEMA, MEDIDAS_VITAIS, ROTULO_MEDIDA } from '@/modules/health/faixas'
import { FormularioFaixas } from '@/components/formulario-faixas'

/**
 * As faixas de referência de um residente.
 *
 * Sem condição de papel aqui: `listarFaixas` exige COORDENACAO ou SAUDE, e um
 * ADMINISTRATIVO que digite a URL recebe `ErroPermissao`, cai na fronteira de
 * erro e deixa linha `ACESSO_NEGADO` na trilha. É o mesmo padrão do prontuário.
 */
export default async function PaginaFaixas({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()
  const [residente, ajustes] = await Promise.all([
    obterResidente(ctx, id),
    listarFaixas(ctx, id),
  ])

  const linhas = MEDIDAS_VITAIS.map((medida) => {
    const ajuste = ajustes.find((a) => a.medida === medida)
    return {
      medida,
      rotulo: ROTULO_MEDIDA[medida],
      sistema: FAIXAS_DO_SISTEMA[medida],
      minimo: ajuste?.minimo ?? null,
      maximo: ajuste?.maximo ?? null,
    }
  })

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-secao font-semibold text-forte">
          Faixas de referência — {residente.nomeSocial || residente.nomeCompleto}
        </h1>
        <p className="text-suporte text-apoio">
          Deixe em branco para usar a faixa do sistema, mostrada em cinza no campo.
          Ajustar a faixa de quem vive fora dela por condição crônica é o que
          impede o alerta diário que ninguém lê.
        </p>
      </div>

      <FormularioFaixas residenteId={id} linhas={linhas} />

      <Link href={`/residentes/${id}/prontuario`} className="text-suporte underline">
        Voltar ao prontuário
      </Link>
    </section>
  )
}
