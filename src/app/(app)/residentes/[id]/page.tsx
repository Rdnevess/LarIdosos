import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ErroNaoEncontrado } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { listarResponsaveis } from '@/modules/residents/responsaveis.service'
import {
  listarDocumentos,
  tiposQuePodeAnexar,
} from '@/modules/residents/documentos.service'
import { listarAnotacoes } from '@/modules/residents/anotacoes.service'
import {
  obterGrauVigente,
  listarAvaliacoes,
} from '@/modules/residents/dependencia.service'
import {
  formatarData,
  formatarDataHora,
  formatarCpf,
  ROTULO_STATUS_RESIDENTE,
  ROTULO_TIPO_DOCUMENTO,
} from '@/lib/ptbr'
import {
  FormularioAnotacao,
  FormularioResponsavel,
  FormularioEditarResponsavel,
  FormularioRemoverResponsavel,
  FormularioExcluirDocumento,
  FormularioAvaliacao,
} from '@/components/formularios-ficha'
import { FormularioDocumento } from '@/components/formulario-documento'
import {
  FormularioEditarAnotacao,
  FormularioRetificarAnotacao,
} from '@/components/formularios-anotacao'

// A tela nunca mostra o valor cru do enum. "VISITA_FAMILIA" é identificador de
// código; quem lê a ficha é a equipe do Lar, e a interface é toda em pt-BR. O
// `??` adiante deixa o valor cru aparecer se surgir um enum novo — melhor um
// rótulo feio que um campo vazio na ficha.
const ROTULO_CATEGORIA: Record<string, string> = {
  VISITA_FAMILIA: 'Visita da família',
  SOCIAL: 'Social',
  JURIDICO: 'Jurídico',
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
  let residente
  try {
    residente = await obterResidente(ctx, id)
  } catch (erro) {
    // Id inexistente na URL vira 404 em português, e não a tela de exceção.
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  const [grau, responsaveis, documentos, anotacoes, avaliacoes] = await Promise.all([
    obterGrauVigente(ctx, id),
    listarResponsaveis(ctx, id),
    listarDocumentos(ctx, { residenteId: id }),
    listarAnotacoes(ctx, id),
    listarAvaliacoes(ctx, id),
  ])

  const emergencia = responsaveis.filter((r) => r.ehContatoEmergencia)

  // Ids das anotações que já receberam uma retificação. Sem esta marca, quem
  // lê a ficha vê o texto original errado e o texto retificado como dois
  // registros independentes, sem pista de qual substitui qual.
  const retificadas = new Set(
    anotacoes.map((anotacao) => anotacao.retificaAnotacaoId).filter(Boolean)
  )
  const agora = Date.now()

  // Esconder o formulário poupa ao usuário um erro previsível; quem recusa de
  // fato é o serviço, que checa o papel de novo.
  const podeCadastrar = ctx.papel !== 'SAUDE'
  // O prontuário é a fronteira oposta à de `podeCadastrar`: SAUDE alcança,
  // ADMINISTRATIVO não. Esconder poupa o erro previsível; quem barra é
  // `obterCabecalhoClinico`, que recusa o papel no serviço.
  const podeVerProntuario = ctx.papel !== 'ADMINISTRATIVO'
  const podeAvaliar = ctx.papel !== 'ADMINISTRATIVO'

  // O anexo NÃO usa `podeCadastrar`. Era esse o defeito: a condição escondia o
  // formulário do papel SAUDE, justamente o que `papeisQuePodemVer` autoriza a
  // anexar EXAME e LAUDO. A lista vem derivada da própria política de
  // permissão (`tiposQuePodeAnexar`), e a seção só some para quem não pode
  // anexar tipo nenhum.
  const tiposAnexaveis = tiposQuePodeAnexar(ctx.papel)

  return (
    <section className="space-y-4">
      <header className="rounded border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">
            {residente.nomeSocial || residente.nomeCompleto}
          </h1>
          {/* Sem este link não havia tela nenhuma que atribuísse DESLIGADO ou
              FALECIDO — a lista oferecia filtrar por "Falecidos" e nada
              chegava lá. Escondido do papel SAUDE porque `desligarResidente`
              exige COORDENACAO ou ADMINISTRATIVO
              (`src/modules/residents/residentes.service.ts`, linha 145). */}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {podeVerProntuario && (
              <Link
                href={`/residentes/${residente.id}/prontuario`}
                className="whitespace-nowrap text-sm font-medium text-slate-800 underline"
              >
                Prontuário
              </Link>
            )}
          </div>
          {podeCadastrar && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Link
                href={`/residentes/${residente.id}/editar`}
                className="whitespace-nowrap text-sm text-slate-600 underline"
              >
                Editar cadastro
              </Link>
              <Link
                href={`/residentes/${residente.id}/desligar`}
                className="whitespace-nowrap text-sm text-slate-600 underline"
              >
                {residente.status === 'ATIVO'
                  ? 'Registrar saída ou óbito'
                  : 'Ver registro de saída'}
              </Link>
            </div>
          )}
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {/* Só aparece quando não é "Ativo": sem isto, a ficha de quem
              faleceu é visualmente idêntica à de quem está no Lar. */}
          {residente.status !== 'ATIVO' && (
            <div className="flex gap-2 font-medium sm:col-span-2">
              <dt className="text-slate-500">Situação:</dt>
              <dd>
                {ROTULO_STATUS_RESIDENTE[residente.status]}
                {residente.dataSaida && ` em ${formatarData(residente.dataSaida)}`}
              </dd>
            </div>
          )}
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
          {anotacoes.map((anotacao) => {
            // As duas condições são do serviço, repetidas aqui só para não
            // oferecer um botão que sempre falharia: `editarAnotacao` exige
            // autoria e janela aberta, e recusa com `ErroPermissao` /
            // `ErroValidacao` (`src/modules/residents/anotacoes.service.ts`).
            const podeEditar =
              anotacao.criadoPorId === ctx.usuarioId &&
              anotacao.editavelAte.getTime() > agora

            return (
              <li key={anotacao.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm text-slate-500">
                  {formatarDataHora(anotacao.criadoEm)} ·{' '}
                  {ROTULO_CATEGORIA[anotacao.categoria] ?? anotacao.categoria}
                  {anotacao.retificaAnotacaoId && ' · retificação'}
                  {retificadas.has(anotacao.id) && ' · retificada depois'}
                </p>
                <p className="text-slate-800">{anotacao.texto}</p>

                <div className="mt-1 space-y-1">
                  {podeEditar && (
                    <details>
                      <summary className="cursor-pointer text-sm text-slate-600 underline">
                        Editar
                      </summary>
                      <div className="mt-2">
                        <FormularioEditarAnotacao
                          anotacaoId={anotacao.id}
                          residenteId={id}
                          textoAtual={anotacao.texto}
                        />
                      </div>
                    </details>
                  )}
                  {/* Retificar não tem janela nem exigência de autoria: é o
                      caminho que continua aberto depois que a edição fecha. */}
                  <details>
                    <summary className="cursor-pointer text-sm text-slate-600 underline">
                      Retificar
                    </summary>
                    <div className="mt-2">
                      <FormularioRetificarAnotacao
                        anotacaoId={anotacao.id}
                        residenteId={id}
                      />
                    </div>
                  </details>
                </div>
              </li>
            )
          })}
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
                {/* Mostra a exceção, não a regra: quase todo responsável pode
                    visitar, e é a restrição que a recepção precisa enxergar. */}
                {!responsavel.autorizadoVisitar && ' · visitas não autorizadas'}
              </span>

              {/* Mesma condição do cadastro, e pelo mesmo motivo: quem barra é
                  `atualizarResponsavel`/`removerResponsavel`, que exigem
                  COORDENACAO ou ADMINISTRATIVO. Esconder aqui só poupa ao papel
                  SAUDE um erro previsível. */}
              {podeCadastrar && (
                <div className="mt-1 space-y-1">
                  <details>
                    <summary className="cursor-pointer text-sm text-slate-600 underline">
                      Editar
                    </summary>
                    <div className="mt-2">
                      <FormularioEditarResponsavel
                        responsavel={responsavel}
                        residenteId={id}
                      />
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm text-slate-600 underline">
                      Remover
                    </summary>
                    <div className="mt-2">
                      <FormularioRemoverResponsavel
                        responsavelId={responsavel.id}
                        residenteId={id}
                      />
                    </div>
                  </details>
                </div>
              )}
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
                {/* Sem `??`: `ROTULO_TIPO_DOCUMENTO` é `Record<TipoDocumento,
                    string>`, então um tipo sem rótulo não compila — não há
                    caso em tempo de execução para cair num valor cru. */}
                {ROTULO_TIPO_DOCUMENTO[documento.tipo]} —{' '}
                {documento.nomeArquivoOriginal}
              </a>

              <div className="mt-1">
                <details>
                  <summary className="cursor-pointer text-sm text-slate-600 underline">
                    Excluir
                  </summary>
                  <div className="mt-2">
                    <FormularioExcluirDocumento
                      documentoId={documento.id}
                      residenteId={id}
                    />
                  </div>
                </details>
              </div>
            </li>
          ))}
          {documentos.length === 0 && (
            <li className="text-sm text-slate-500">Nenhum documento anexado.</li>
          )}
        </ul>
        {tiposAnexaveis.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <FormularioDocumento residenteId={id} tipos={tiposAnexaveis} />
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
