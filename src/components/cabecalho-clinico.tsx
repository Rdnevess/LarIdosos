import type { GrauDependencia, Medicacao, SinalVital } from '@prisma/client'
import type { CabecalhoClinico as Dados } from '@/modules/health/cabecalho.service'
import { formatarData, formatarDataHora } from '@/lib/ptbr'

/**
 * O topo do prontuário, sempre visível, sem clique. É a informação que a
 * equipe precisa ver antes de encostar na pessoa — e o motivo de ela não estar
 * dentro de uma seção recolhível como o resto.
 *
 * Cada lista vazia mostra uma frase própria, nunca um bloco em branco: bloco
 * em branco na tela clínica se lê como "não tem", e a diferença entre "não
 * tem" e "ninguém registrou ainda" é grande.
 *
 * O bloco de medicações ativas chegou com a Fase 2B, no espaço que a 2A
 * deixou reservado — e o grid recebeu o sexto item sem rearranjo, como estava
 * previsto.
 */

const ROTULO_TIPO_ALERGIA: Record<string, string> = {
  MEDICAMENTO: 'medicamento',
  ALIMENTO: 'alimento',
  OUTRO: 'outro',
}

function Bloco({
  titulo,
  vazio,
  children,
  temConteudo,
}: {
  titulo: string
  vazio: string
  temConteudo: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apoio">
        {titulo}
      </h3>
      {temConteudo ? children : <p className="text-sm text-apoio">{vazio}</p>}
    </div>
  )
}

/**
 * Junta as medidas presentes numa linha só, omitindo as ausentes. Aferição
 * parcial é o caso normal: quem afere só a pressão não deve ver "— °C" ao
 * lado, que parece medida perdida.
 */
function resumirSinalVital(sinal: SinalVital): string {
  const partes: string[] = []
  if (sinal.pressaoSistolica && sinal.pressaoDiastolica) {
    partes.push(`PA ${sinal.pressaoSistolica}×${sinal.pressaoDiastolica}`)
  }
  if (sinal.frequenciaCardiaca) partes.push(`FC ${sinal.frequenciaCardiaca}`)
  if (sinal.frequenciaRespiratoria) partes.push(`FR ${sinal.frequenciaRespiratoria}`)
  if (sinal.temperatura) partes.push(`${Number(sinal.temperatura).toFixed(1)} °C`.replace('.', ','))
  if (sinal.saturacaoO2) partes.push(`SpO₂ ${sinal.saturacaoO2}%`)
  if (sinal.glicemia) partes.push(`Glicemia ${sinal.glicemia}`)
  if (sinal.peso) partes.push(`${Number(sinal.peso).toFixed(1).replace('.', ',')} kg`)
  return partes.join(' · ')
}

/**
 * Os tres blocos que a secao 7.1 do design chama de **alertas de cuidado**:
 * alergia, condicao cronica e restricao alimentar. Vivem separados porque sao
 * lidos por dois papeis diferentes, em duas telas — e uma copia do markup em
 * cada uma divergiria no dia em que a marcacao da alergia grave mudasse.
 *
 * Devolve um fragmento, e nao uma secao: quem chama e dono da grade.
 */
function BlocosDeCuidado({ dados }: { dados: Dados }) {
  return (
    <>
      <Bloco
        titulo="Alergias"
        vazio="Nenhuma alergia registrada."
        temConteudo={dados.alergias.length > 0}
      >
        <ul className="space-y-1">
          {dados.alergias.map((alergia) => (
            <li
              key={alergia.id}
              className={
                alergia.gravidade === 'GRAVE'
                  ? 'rounded border border-perigo-borda bg-perigo-fundo px-2 py-1 text-sm font-medium text-perigo-forte'
                  : 'text-sm text-forte'
              }
            >
              {alergia.agente}{' '}
              <span className="font-normal text-apoio">
                ({ROTULO_TIPO_ALERGIA[alergia.tipo] ?? alergia.tipo}
                {alergia.reacao ? ` — ${alergia.reacao}` : ''})
              </span>
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo="Condições crônicas"
        vazio="Nenhuma condição crônica registrada."
        temConteudo={dados.condicoes.length > 0}
      >
        <ul className="space-y-1">
          {dados.condicoes.map((condicao) => (
            <li key={condicao.id} className="text-sm text-forte">
              {condicao.descricao}
              {condicao.cid10 && <span className="text-apoio"> ({condicao.cid10})</span>}
              {condicao.dataDiagnostico && (
                <span className="text-apoio">
                  {' '}
                  · desde {formatarData(condicao.dataDiagnostico)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo="Restrições alimentares"
        vazio="Nenhuma restrição alimentar registrada."
        temConteudo={dados.restricoes.length > 0}
      >
        <ul className="space-y-1">
          {dados.restricoes.map((restricao) => (
            <li key={restricao.id} className="text-sm text-forte">
              {restricao.descricao}
            </li>
          ))}
        </ul>
      </Bloco>
    </>
  )
}

/**
 * A porta da ficha do residente, alcancavel tambem pelo ADMINISTRATIVO.
 *
 * O prontuario continua fechado a esse papel: o que se abriu foi o dado de
 * proibicao — quem recebe a entrega de alimento precisa saber da alergia —, e
 * nao a rota. Ver a secao 7.1 do design.
 */
export function AlertasDeCuidado({ dados }: { dados: Dados }) {
  return (
    <section
      aria-label="Alertas de cuidado"
      className="grid gap-4 rounded border bg-superficie p-4 sm:grid-cols-2"
    >
      <BlocosDeCuidado dados={dados} />
    </section>
  )
}

export function CabecalhoClinico({
  grau,
  dados,
  ultimoSinalVital,
  medicacoesAtivas,
}: {
  grau: GrauDependencia | null
  dados: Dados
  ultimoSinalVital: SinalVital | null
  medicacoesAtivas: Medicacao[]
}) {
  return (
    <section
      aria-label="Cabeçalho clínico"
      className="grid gap-4 rounded border bg-superficie p-4 sm:grid-cols-2"
    >
      <Bloco titulo="Grau de dependência" vazio="Não avaliado" temConteudo={grau !== null}>
        <p className="text-sm text-forte">Grau {grau}</p>
      </Bloco>

      <BlocosDeCuidado dados={dados} />

      <Bloco
        titulo="Medicações ativas"
        vazio="Nenhuma medicação ativa."
        temConteudo={medicacoesAtivas.length > 0}
      >
        <ul className="space-y-1">
          {medicacoesAtivas.map((medicacao) => (
            <li key={medicacao.id} className="text-sm text-forte">
              {medicacao.farmaco}{' '}
              <span className="text-apoio">
                {medicacao.dose}
                {medicacao.horarios.length > 0
                  ? ` · ${medicacao.horarios.join(', ')}`
                  : ' · se necessário'}
              </span>
            </li>
          ))}
        </ul>
      </Bloco>

      <div className="sm:col-span-2">
        <Bloco
          titulo="Última aferição"
          vazio="Nenhuma aferição registrada."
          temConteudo={ultimoSinalVital !== null}
        >
          <p className="text-sm text-forte">
            {ultimoSinalVital && resumirSinalVital(ultimoSinalVital)}
            <span className="text-apoio">
              {' '}
              — {ultimoSinalVital && formatarDataHora(ultimoSinalVital.aferidoEm)}
            </span>
          </p>
        </Bloco>
      </div>
    </section>
  )
}
