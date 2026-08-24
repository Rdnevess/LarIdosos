import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ErroNaoEncontrado } from '@/lib/erros'
import { prisma } from '@/lib/prisma'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { obterGrauVigente } from '@/modules/residents/dependencia.service'
import { obterCabecalhoClinico } from '@/modules/health/cabecalho.service'
import { obterUltimoSinalVital } from '@/modules/health/sinais-vitais.service'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { CabecalhoClinico } from '@/components/cabecalho-clinico'
import {
  FormularioAlergia,
  FormularioCondicaoCronica,
  FormularioRestricaoAlimentar,
  FormularioDesativar,
} from '@/components/formularios-prontuario'
import { formatarData } from '@/lib/ptbr'

/**
 * O prontuário mora numa rota própria, e não em mais seis seções da ficha,
 * porque a fronteira de permissão da §7 do design vira aqui uma rota inteira
 * em vez de uma dúzia de condições espalhadas.
 *
 * **Não há nenhuma condição de papel nesta página.** Quem barra é
 * `obterCabecalhoClinico`, que exige COORDENACAO ou SAUDE: um ADMINISTRATIVO
 * que digite a URL recebe `ErroPermissao`, cai na fronteira de erro de
 * `(app)/error.tsx`, e a tentativa entra na trilha como `ACESSO_NEGADO` pelo
 * mecanismo de `exigirPapel`.
 */
export default async function PaginaProntuario({
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
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  const [grau, dados, ultimoSinalVital] = await Promise.all([
    obterGrauVigente(ctx, id),
    obterCabecalhoClinico(ctx, id),
    obterUltimoSinalVital(ctx, id),
  ])

  // Prontuário é dado pessoal sensível (LGPD, art. 11), e esta tela mostra
  // conteúdo clínico, não metadado — a dispensa que vale para
  // `listarDocumentos` não se aplica aqui. Uma linha por abertura, como
  // `obterResidente` já faz para a ficha.
  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'AnotacaoSaude',
    residenteId: id,
  })

  const nome = residente.nomeSocial || residente.nomeCompleto

  return (
    <section className="space-y-4">
      <header className="rounded border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Prontuário — {nome}</h1>
            <p className="text-sm text-slate-500">
              Admissão em {formatarData(residente.dataAdmissao)}
            </p>
          </div>
          <Link
            href={`/residentes/${id}`}
            className="shrink-0 whitespace-nowrap text-sm text-slate-600 underline"
          >
            Ver cadastro
          </Link>
        </div>
      </header>

      {/* O cabeçalho é a leitura; as seções abaixo são a gestão. A lista
          vazia tem frase só no cabeçalho — repeti-la na seção seria a mesma
          sentença duas vezes na mesma tela, e a seção vazia já se explica
          sozinha, com o formulário logo ali. */}
      <CabecalhoClinico grau={grau} dados={dados} ultimoSinalVital={ultimoSinalVital} />

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Alergias ({dados.alergias.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.alergias.map((alergia) => (
            <li key={alergia.id} className="text-sm">
              <span className="font-medium text-slate-800">{alergia.agente}</span>{' '}
              <span className="text-slate-500">
                — {alergia.gravidade.toLowerCase()}
                {alergia.reacao ? ` · ${alergia.reacao}` : ''}
              </span>
              <FormularioDesativar
                acao="alergia"
                registroId={alergia.id}
                residenteId={id}
                rotulo="Retirar alergia"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioAlergia residenteId={id} />
        </div>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Condições crônicas ({dados.condicoes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.condicoes.map((condicao) => (
            <li key={condicao.id} className="text-sm">
              <span className="font-medium text-slate-800">{condicao.descricao}</span>
              {condicao.cid10 && <span className="text-slate-500"> — {condicao.cid10}</span>}
              <FormularioDesativar
                acao="condicao"
                registroId={condicao.id}
                residenteId={id}
                rotulo="Retirar condição"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioCondicaoCronica residenteId={id} />
        </div>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Restrições alimentares ({dados.restricoes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.restricoes.map((restricao) => (
            <li key={restricao.id} className="text-sm">
              <span className="font-medium text-slate-800">{restricao.descricao}</span>
              <FormularioDesativar
                acao="restricao"
                registroId={restricao.id}
                residenteId={id}
                rotulo="Retirar restrição"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioRestricaoAlimentar residenteId={id} />
        </div>
      </details>
    </section>
  )
}
