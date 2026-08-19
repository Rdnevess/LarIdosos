import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { listarResponsaveis } from '@/modules/residents/responsaveis.service'
import { listarDocumentos } from '@/modules/residents/documentos.service'
import { listarAnotacoes } from '@/modules/residents/anotacoes.service'
import {
  obterGrauVigente,
  listarAvaliacoes,
} from '@/modules/residents/dependencia.service'
import { formatarData, formatarDataHora, formatarCpf } from '@/lib/ptbr'
import {
  FormularioAnotacao,
  FormularioResponsavel,
  FormularioAvaliacao,
} from '@/components/formularios-ficha'
import { FormularioDocumento } from '@/components/formulario-documento'

// A tela nunca mostra o valor cru do enum. "VISITA_FAMILIA" é identificador de
// código; quem lê a ficha é a equipe do Lar, e a interface é toda em pt-BR. O
// `??` adiante deixa o valor cru aparecer se surgir um enum novo — melhor um
// rótulo feio que um campo vazio na ficha.
const ROTULO_CATEGORIA: Record<string, string> = {
  COMPORTAMENTO: 'Comportamento',
  VISITA_FAMILIA: 'Visita da família',
  OCORRENCIA: 'Ocorrência',
  SOCIAL: 'Social',
  JURIDICO: 'Jurídico',
  OUTRO: 'Outro',
}

const ROTULO_TIPO_DOCUMENTO: Record<string, string> = {
  RG: 'RG',
  CPF: 'CPF',
  CNS: 'Cartão SUS',
  CERTIDAO: 'Certidão',
  LAUDO: 'Laudo',
  PROCURACAO: 'Procuração',
  TERMO_RESPONSABILIDADE: 'Termo de responsabilidade',
  TERMO_LGPD: 'Termo de ciência (LGPD)',
  FOTO: 'Foto',
  EXAME: 'Exame',
  COMPROVANTE_FISCAL: 'Comprovante fiscal',
  CONSELHO_PROFISSIONAL: 'Registro em conselho',
  OUTRO: 'Outro',
}

export default async function FichaResidente({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()

  // `obterResidente` primeiro, e sozinho: é ele quem audita a abertura da
  // ficha, e é sob esse rastro que o grau de dependência aparece — o próprio
  // `obterGrauVigente` não audita.
  const residente = await obterResidente(ctx, id)
  const [grau, responsaveis, documentos, anotacoes, avaliacoes] = await Promise.all([
    obterGrauVigente(ctx, id),
    listarResponsaveis(ctx, id),
    listarDocumentos(ctx, { residenteId: id }),
    listarAnotacoes(ctx, id),
    listarAvaliacoes(ctx, id),
  ])

  const emergencia = responsaveis.filter((r) => r.ehContatoEmergencia)

  // Esconder o formulário poupa ao usuário um erro previsível; quem recusa de
  // fato é o serviço, que checa o papel de novo.
  const podeCadastrar = ctx.papel !== 'SAUDE'
  const podeAvaliar = ctx.papel !== 'ADMINISTRATIVO'

  return (
    <section className="space-y-4">
      <header className="rounded border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">
            {residente.nomeSocial || residente.nomeCompleto}
          </h1>
          {podeCadastrar && (
            <Link
              href={`/residentes/${residente.id}/editar`}
              className="whitespace-nowrap text-sm text-slate-600 underline"
            >
              Editar cadastro
            </Link>
          )}
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500">Nascimento:</dt>
            <dd>{formatarData(residente.dataNascimento)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Quarto/leito:</dt>
            <dd>{residente.quarto ?? '—'} / {residente.leito ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">CPF:</dt>
            <dd>{residente.cpf ? formatarCpf(residente.cpf) : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Grau de dependência:</dt>
            <dd className="font-medium">{grau ?? 'não avaliado'}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-slate-500">Emergência:</dt>
            <dd>
              {emergencia.length > 0
                ? emergencia.map((r) => `${r.nome} (${r.telefonePrincipal})`).join(' · ')
                : '—'}
            </dd>
          </div>
        </dl>
      </header>

      <details open className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Anotações ({anotacoes.length})
        </summary>
        <ul className="mt-3 space-y-3">
          {anotacoes.map((anotacao) => (
            <li key={anotacao.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm text-slate-500">
                {formatarDataHora(anotacao.criadoEm)} ·{' '}
                {ROTULO_CATEGORIA[anotacao.categoria] ?? anotacao.categoria}
                {anotacao.retificaAnotacaoId && ' · retificação'}
              </p>
              <p className="text-slate-800">{anotacao.texto}</p>
            </li>
          ))}
          {anotacoes.length === 0 && (
            <li className="text-sm text-slate-500">Nenhuma anotação registrada.</li>
          )}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioAnotacao residenteId={id} />
        </div>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Responsáveis ({responsaveis.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {responsaveis.map((responsavel) => (
            <li key={responsavel.id} className="text-sm">
              <span className="font-medium text-slate-800">{responsavel.nome}</span>{' '}
              <span className="text-slate-500">
                — {responsavel.parentesco} · {responsavel.telefonePrincipal}
                {responsavel.ehResponsavelLegal && ' · responsável legal'}
              </span>
            </li>
          ))}
          {responsaveis.length === 0 && (
            <li className="text-sm text-slate-500">Nenhum responsável cadastrado.</li>
          )}
        </ul>
        {podeCadastrar && (
          <div className="mt-4 border-t pt-4">
            <FormularioResponsavel residenteId={id} />
          </div>
        )}
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Documentos ({documentos.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {documentos.map((documento) => (
            <li key={documento.id} className="text-sm">
              <a
                href={`/api/documentos/${documento.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-800 underline"
              >
                {ROTULO_TIPO_DOCUMENTO[documento.tipo] ?? documento.tipo} —{' '}
                {documento.nomeArquivoOriginal}
              </a>
            </li>
          ))}
          {documentos.length === 0 && (
            <li className="text-sm text-slate-500">Nenhum documento anexado.</li>
          )}
        </ul>
        {podeCadastrar && (
          <div className="mt-4 border-t pt-4">
            <FormularioDocumento residenteId={id} />
          </div>
        )}
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Grau de dependência ({avaliacoes.length} avaliações)
        </summary>
        <ul className="mt-3 space-y-2">
          {avaliacoes.map((avaliacao) => (
            <li key={avaliacao.id} className="text-sm">
              <span className="font-medium">Grau {avaliacao.grau}</span>{' '}
              <span className="text-slate-500">
                em {formatarData(avaliacao.dataAvaliacao)} por {avaliacao.avaliadorNome}
              </span>
            </li>
          ))}
          {avaliacoes.length === 0 && (
            <li className="text-sm text-slate-500">Nenhuma avaliação registrada.</li>
          )}
        </ul>
        {podeAvaliar && (
          <div className="mt-4 border-t pt-4">
            <FormularioAvaliacao residenteId={id} />
          </div>
        )}
      </details>
    </section>
  )
}
