import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { ErroNaoEncontrado } from '@/lib/erros'
import { FormularioSimples } from '@/components/formulario-simples'
import { formatarData, ROTULO_STATUS_RESIDENTE } from '@/lib/ptbr'
import { acaoDesligarResidente } from '../../acoes'
import { Cartao } from '@/components/ui/cartao'

export default async function PaginaDesligarResidente({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()

  let residente
  try {
    residente = await obterResidente(ctx, id)
  } catch (erro) {
    // Id inexistente na URL vira 404 em português, e não a tela de exceção.
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  const nome = residente.nomeSocial || residente.nomeCompleto

  // `obterResidente` aceita os três papéis, então esta tela abriria para
  // SAUDE. Quem barra de verdade é `desligarResidente`, que exige COORDENACAO
  // ou ADMINISTRATIVO (`src/modules/residents/residentes.service.ts`, linha
  // 145); aqui só evitamos oferecer um formulário que sempre falharia.
  if (ctx.papel === 'SAUDE') {
    return (
      <section className="space-y-4">
        <h1 className="text-secao font-semibold text-forte">{nome}</h1>
        <p className="cartao p-4 text-suporte text-medio">
          O registro de desligamento ou óbito é feito pela coordenação ou pela
          equipe administrativa. Fale com a coordenação.
        </p>
        <Link href={`/residentes/${id}`} className="text-suporte text-medio underline">
          Voltar à ficha
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h1 className="text-secao font-semibold text-forte">
        Desligamento de {nome}
      </h1>

      {residente.status === 'ATIVO' ? (
        <Cartao>
          <p className="mb-3 text-suporte text-apoio">
            O cadastro é preservado; o residente deixa de aparecer na lista de
            ativos e passa a ser encontrado pelo filtro de situação. Registre
            aqui também o falecimento.
          </p>
          <FormularioSimples
            acao={acaoDesligarResidente}
            ocultos={{ id: residente.id }}
            rotuloBotao="Registrar saída"
            variante="perigo"
            campos={[
              {
                nome: 'status',
                rotulo: 'Situação',
                obrigatorio: true,
                opcoes: [
                  { valor: 'DESLIGADO', rotulo: ROTULO_STATUS_RESIDENTE.DESLIGADO },
                  { valor: 'FALECIDO', rotulo: ROTULO_STATUS_RESIDENTE.FALECIDO },
                ],
              },
              { nome: 'dataSaida', rotulo: 'Data da saída', tipo: 'date', obrigatorio: true },
              { nome: 'motivoSaida', rotulo: 'Motivo da saída', obrigatorio: true },
              { nome: 'observacaoSaida', rotulo: 'Observação' },
            ]}
          />
        </Cartao>
      ) : (
        <dl className="space-y-1 rounded border bg-suave p-4 text-suporte text-firme">
          <div className="flex gap-2">
            <dt className="text-apoio">Situação:</dt>
            <dd>{ROTULO_STATUS_RESIDENTE[residente.status]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-apoio">Data da saída:</dt>
            <dd>{residente.dataSaida ? formatarData(residente.dataSaida) : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-apoio">Motivo:</dt>
            <dd>{residente.motivoSaida ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-apoio">Observação:</dt>
            <dd>{residente.observacaoSaida ?? '—'}</dd>
          </div>
        </dl>
      )}

      <Link href={`/residentes/${id}`} className="text-suporte text-medio underline">
        Voltar à ficha
      </Link>
    </section>
  )
}
