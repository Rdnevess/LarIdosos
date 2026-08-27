import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ErroNaoEncontrado } from '@/lib/erros'
import { prisma } from '@/lib/prisma'
import { ROTULO_TURNO } from '@/lib/turno'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { obterGrauVigente } from '@/modules/residents/dependencia.service'
import { obterCabecalhoClinico } from '@/modules/health/cabecalho.service'
import { obterUltimoSinalVital } from '@/modules/health/sinais-vitais.service'
import { montarLinhaDoTempo, type TipoEvento } from '@/modules/health/linha-do-tempo'
import { listarAnotacoesSaude } from '@/modules/health/anotacoes-saude.service'
import { listarSinaisVitais } from '@/modules/health/sinais-vitais.service'
import { listarExames } from '@/modules/health/exames.service'
import { listarConsultas } from '@/modules/health/consultas.service'
import { listarVacinas } from '@/modules/health/vacinas.service'
import { listarMedicacoes, listarMedicacoesAtivas } from '@/modules/health/medicacoes.service'
import { calcularAderencia } from '@/modules/health/aderencia'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import { CabecalhoClinico } from '@/components/cabecalho-clinico'
import { LinhaDoTempo } from '@/components/linha-do-tempo'
import {
  FormularioPrescrever,
  FormularioSuspender,
  FormularioSubstituir,
} from '@/components/formularios-medicacao'
import { RelatorioAderencia } from '@/components/aderencia'
import {
  FormularioAlergia,
  FormularioCondicaoCronica,
  FormularioRestricaoAlimentar,
  FormularioDesativar,
  FormularioAnotacaoSaude,
  FormularioEditarAnotacaoSaude,
  FormularioRetificarAnotacaoSaude,
  FormularioSinalVital,
  FormularioExame,
  FormularioAtualizarExame,
  FormularioConsulta,
  FormularioAtualizarConsulta,
  FormularioVacina,
} from '@/components/formularios-prontuario'
import { formatarData, formatarDataHora } from '@/lib/ptbr'

// RÃ³tulos em pt-BR dos enums do prontuÃ¡rio. A tela nunca mostra o valor cru:
// "INTERCORRENCIA" Ã© identificador de cÃ³digo, e quem lÃª a ficha Ã© a equipe.
const ROTULO_CATEGORIA_SAUDE: Record<string, string> = {
  EVOLUCAO: 'EvoluÃ§Ã£o',
  INTERCORRENCIA: 'IntercorrÃªncia',
  ALIMENTACAO: 'AlimentaÃ§Ã£o',
  SONO: 'Sono',
  HIGIENE: 'Higiene',
  COMPORTAMENTO: 'Comportamento',
  QUEDA: 'Queda',
}

const ROTULO_STATUS_EXAME: Record<string, string> = {
  SOLICITADO: 'solicitado',
  AGENDADO: 'agendado',
  REALIZADO: 'realizado, aguardando resultado',
  RESULTADO_RECEBIDO: 'resultado recebido',
  CANCELADO: 'cancelado',
}

const ROTULO_STATUS_CONSULTA: Record<string, string> = {
  AGENDADA: 'agendada',
  REALIZADA: 'realizada',
  CANCELADA: 'cancelada',
}

function resumirSinalVital(sinal: {
  pressaoSistolica: number | null
  pressaoDiastolica: number | null
  frequenciaCardiaca: number | null
  temperatura: unknown
  saturacaoO2: number | null
  glicemia: number | null
  peso: unknown
}): string {
  const partes: string[] = []
  if (sinal.pressaoSistolica && sinal.pressaoDiastolica) {
    partes.push(`PA ${sinal.pressaoSistolica}Ã${sinal.pressaoDiastolica}`)
  }
  if (sinal.frequenciaCardiaca) partes.push(`FC ${sinal.frequenciaCardiaca}`)
  if (sinal.temperatura) {
    partes.push(`${Number(sinal.temperatura).toFixed(1).replace('.', ',')} Â°C`)
  }
  if (sinal.saturacaoO2) partes.push(`SpOâ ${sinal.saturacaoO2}%`)
  if (sinal.glicemia) partes.push(`Glicemia ${sinal.glicemia}`)
  if (sinal.peso) partes.push(`${Number(sinal.peso).toFixed(1).replace('.', ',')} kg`)
  return partes.join(' Â· ')
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const { id } = await params
  const { tipo } = await searchParams
  const ctx = await obterCtx()

  let residente
  try {
    residente = await obterResidente(ctx, id)
  } catch (erro) {
    if (erro instanceof ErroNaoEncontrado) notFound()
    throw erro
  }

  const [
    grau,
    dados,
    ultimoSinalVital,
    eventos,
    anotacoes,
    sinais,
    exames,
    consultas,
    vacinas,
    medicacoes,
    medicacoesAtivas,
    aderencia,
  ] = await Promise.all([
    obterGrauVigente(ctx, id),
    obterCabecalhoClinico(ctx, id),
    obterUltimoSinalVital(ctx, id),
    // Tipo desconhecido na URL cai em "todos", e não em erro: query string é
    // coisa que se edita à mão e que sobrevive a um link antigo colado.
    montarLinhaDoTempo(ctx, id, tipo ? { tipos: [tipo as TipoEvento] } : {}),
    listarAnotacoesSaude(ctx, id),
    listarSinaisVitais(ctx, id),
    listarExames(ctx, id),
    listarConsultas(ctx, id),
    listarVacinas(ctx, id),
    listarMedicacoes(ctx, id),
    listarMedicacoesAtivas(ctx, id),
    calcularAderencia(ctx, id, {
      de: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      ate: new Date(),
    }),
  ])

  // Quais anotações já foram retificadas depois — o aviso que impede alguém
  // de agir sobre a versão superada sem perceber que existe uma correção.
  const retificadas = new Set(
    anotacoes.map((a) => a.retificaAnotacaoSaudeId).filter((v): v is string => v !== null)
  )

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
      <header className="cartao p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-secao font-semibold text-forte">Prontuário — {nome}</h1>
            <p className="text-suporte text-apoio">
              Admissão em {formatarData(residente.dataAdmissao)}
            </p>
          </div>
          <Link
            href={`/residentes/${id}`}
            className="shrink-0 whitespace-nowrap text-suporte text-medio underline"
          >
            Ver cadastro
          </Link>
        </div>
      </header>

      {/* O cabeçalho é a leitura; as seções abaixo são a gestão. A lista
          vazia tem frase só no cabeçalho — repeti-la na seção seria a mesma
          sentença duas vezes na mesma tela, e a seção vazia já se explica
          sozinha, com o formulário logo ali. */}
      <CabecalhoClinico
        grau={grau}
        dados={dados}
        ultimoSinalVital={ultimoSinalVital}
        medicacoesAtivas={medicacoesAtivas}
      />

      {/* Os três botões grandes da §9: um toque para o caso comum. O quarto
          que a spec prevê — medicação — chega com a Fase 2B. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <details className="cartao">
          <summary className="cursor-pointer px-2 py-4 text-center font-medium text-forte">
            Evolução
          </summary>
          <div className="border-t p-4">
            <FormularioAnotacaoSaude
              residenteId={id}
              categoriaFixa="EVOLUCAO"
              prefixoId="botao-evolucao"
              rotuloBotao="Registrar evolução"
            />
          </div>
        </details>
        <details className="cartao">
          <summary className="cursor-pointer px-2 py-4 text-center font-medium text-forte">
            Sinais vitais
          </summary>
          <div className="border-t p-4">
            <FormularioSinalVital residenteId={id} />
          </div>
        </details>
        <details className="cartao">
          <summary className="cursor-pointer px-2 py-4 text-center font-medium text-forte">
            Intercorrência
          </summary>
          <div className="border-t p-4">
            <FormularioAnotacaoSaude
              residenteId={id}
              categoriaFixa="INTERCORRENCIA"
              prefixoId="botao-intercorrencia"
              rotuloBotao="Registrar intercorrência"
            />
          </div>
        </details>
        {/* O quarto botão que o design prevê. É um link, e não um formulário:
            registrar dose acontece na tela do turno, onde estão as doses
            previstas de todo mundo. */}
        <Link
          href="/turno"
          className="flex items-center justify-center cartao px-2 py-4 text-center font-medium text-forte"
        >
          Medicação
        </Link>
      </div>

      <LinhaDoTempo eventos={eventos} tipoSelecionado={tipo} residenteId={id} />

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Alergias ({dados.alergias.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.alergias.map((alergia) => (
            <li key={alergia.id} className="text-suporte">
              <span className="font-medium text-forte">{alergia.agente}</span>{' '}
              <span className="text-apoio">
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

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Condições crônicas ({dados.condicoes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.condicoes.map((condicao) => (
            <li key={condicao.id} className="text-suporte">
              <span className="font-medium text-forte">{condicao.descricao}</span>
              {condicao.cid10 && <span className="text-apoio"> — {condicao.cid10}</span>}
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

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Restrições alimentares ({dados.restricoes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {dados.restricoes.map((restricao) => (
            <li key={restricao.id} className="text-suporte">
              <span className="font-medium text-forte">{restricao.descricao}</span>
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

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Anotações de saúde ({anotacoes.length})
        </summary>
        <ul className="mt-3 space-y-3">
          {anotacoes.map((anotacao) => (
            <li key={anotacao.id} className="border-l-2 border-borda-suave pl-3 text-suporte">
              <p className="text-apoio">
                {formatarDataHora(anotacao.ocorridoEm)} ·{' '}
                {ROTULO_CATEGORIA_SAUDE[anotacao.categoria]} · turno:{' '}
                {ROTULO_TURNO[anotacao.turno]}
                {anotacao.retificaAnotacaoSaudeId && ' · retificação'}
                {retificadas.has(anotacao.id) && ' · retificada depois'}
              </p>
              <p className="text-forte">{anotacao.texto}</p>
              {anotacao.conduta && (
                <p className="text-medio">Conduta: {anotacao.conduta}</p>
              )}
              <div className="mt-1 space-y-1">
                {anotacao.criadoPorId === ctx.usuarioId &&
                  anotacao.editavelAte > new Date() && (
                    <details>
                      <summary className="cursor-pointer text-suporte text-medio underline">
                        Editar
                      </summary>
                      <div className="mt-2">
                        <FormularioEditarAnotacaoSaude
                          anotacaoId={anotacao.id}
                          residenteId={id}
                          textoAtual={anotacao.texto}
                        />
                      </div>
                    </details>
                  )}
                <details>
                  <summary className="cursor-pointer text-suporte text-medio underline">
                    Retificar
                  </summary>
                  <div className="mt-2">
                    <FormularioRetificarAnotacaoSaude
                      anotacaoId={anotacao.id}
                      residenteId={id}
                    />
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioAnotacaoSaude
            residenteId={id}
            prefixoId="nova-anotacao-saude"
            rotuloBotao="Registrar anotação"
          />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Sinais vitais ({sinais.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {sinais.map((sinal) => (
            <li key={sinal.id} className="text-suporte">
              <span className="text-apoio">{formatarDataHora(sinal.aferidoEm)}</span>{' '}
              <span className="text-forte">{resumirSinalVital(sinal)}</span>
              {sinal.observacao && (
                <span className="block text-medio">{sinal.observacao}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioSinalVital residenteId={id} />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Exames ({exames.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {exames.map((exame) => (
            <li key={exame.id} className="text-suporte">
              <span className="font-medium text-forte">{exame.tipo}</span>{' '}
              <span className="text-apoio">
                — {ROTULO_STATUS_EXAME[exame.status]}
                {exame.dataSolicitacao
                  ? ` · solicitado em ${formatarData(exame.dataSolicitacao)}`
                  : ''}
              </span>
              {exame.resumoResultado && (
                <span className="block text-medio">{exame.resumoResultado}</span>
              )}
              <FormularioAtualizarExame
                exameId={exame.id}
                residenteId={id}
                statusAtual={exame.status}
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioExame residenteId={id} />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Consultas ({consultas.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {consultas.map((consulta) => (
            <li key={consulta.id} className="text-suporte">
              <span className="font-medium text-forte">{consulta.especialidade}</span>{' '}
              <span className="text-apoio">
                — {ROTULO_STATUS_CONSULTA[consulta.status]} ·{' '}
                {formatarDataHora(consulta.dataHora)}
                {consulta.local ? ` · ${consulta.local}` : ''}
              </span>
              {consulta.conduta && (
                <span className="block text-medio">Conduta: {consulta.conduta}</span>
              )}
              <FormularioAtualizarConsulta
                consultaId={consulta.id}
                residenteId={id}
                statusAtual={consulta.status}
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioConsulta residenteId={id} />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Vacinas ({vacinas.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {vacinas.map((vacina) => (
            <li key={vacina.id} className="text-suporte">
              <span className="font-medium text-forte">{vacina.imunizante}</span>{' '}
              <span className="text-apoio">
                — {vacina.dose} · {formatarData(vacina.dataAplicacao)}
                {vacina.lote ? ` · lote ${vacina.lote}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioVacina residenteId={id} />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Medicações ({medicacoes.length})
        </summary>
        <ul className="mt-3 space-y-3">
          {medicacoes.map((medicacao) => (
            <li key={medicacao.id} className="text-suporte">
              <span className="font-medium text-forte">{medicacao.farmaco}</span>{' '}
              <span className="text-apoio">
                {medicacao.concentracao ? `${medicacao.concentracao} · ` : ''}
                {medicacao.dose} · {medicacao.via.toLowerCase()}
                {medicacao.horarios.length > 0
                  ? ` · ${medicacao.horarios.join(', ')}`
                  : ' · se necessário'}
              </span>
              {medicacao.instrucoes && (
                <span className="block text-medio">{medicacao.instrucoes}</span>
              )}
              {medicacao.ativa ? (
                <FormularioSuspender medicacaoId={medicacao.id} residenteId={id} />
              ) : (
                <>
                  <span className="block text-apoio">
                    Suspensa em {formatarData(medicacao.dataFim ?? medicacao.atualizadoEm)}
                    {medicacao.motivoSuspensao ? ` — ${medicacao.motivoSuspensao}` : ''}
                  </span>
                  {/* Oferecida em destaque logo depois da suspensão: é este o
                      caminho que grava o elo com a anterior, e é o que fecha a
                      lacuna de a medicação ficar sem cobertura entre os dois
                      passos. */}
                  <FormularioSubstituir anterior={medicacao} residenteId={id} />
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t pt-4">
          <FormularioPrescrever residenteId={id} />
        </div>
      </details>

      <details className="cartao p-4">
        <summary className="cursor-pointer font-medium text-forte">
          Aderência (últimos 30 dias)
        </summary>
        <div className="mt-3">
          <RelatorioAderencia aderencia={aderencia} />
        </div>
      </details>
    </section>
  )
}
