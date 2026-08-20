'use client'

import { useActionState } from 'react'
import type { Residente } from '@prisma/client'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'

export const CAMPOS_RESIDENTE: PropsCampo[] = [
  { nome: 'nomeCompleto', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'nomeSocial', rotulo: 'Nome social' },
  { nome: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'date' as const, obrigatorio: true },
  {
    nome: 'sexo',
    rotulo: 'Sexo',
    obrigatorio: true,
    opcoes: [
      { valor: 'FEMININO', rotulo: 'Feminino' },
      { valor: 'MASCULINO', rotulo: 'Masculino' },
      { valor: 'OUTRO', rotulo: 'Outro' },
    ],
  },
  { nome: 'estadoCivil', rotulo: 'Estado civil' },
  { nome: 'naturalidade', rotulo: 'Naturalidade' },
  { nome: 'nacionalidade', rotulo: 'Nacionalidade' },
  { nome: 'religiao', rotulo: 'Religião' },
  { nome: 'escolaridade', rotulo: 'Escolaridade' },
  { nome: 'cpf', rotulo: 'CPF' },
  { nome: 'rg', rotulo: 'RG' },
  { nome: 'orgaoEmissorRg', rotulo: 'Órgão emissor do RG' },
  { nome: 'cns', rotulo: 'Cartão SUS (CNS)' },
  { nome: 'dataAdmissao', rotulo: 'Data de admissão', tipo: 'date' as const, obrigatorio: true },
  { nome: 'origemAdmissao', rotulo: 'Origem da admissão' },
  { nome: 'motivoAdmissao', rotulo: 'Motivo da admissão' },
  { nome: 'quarto', rotulo: 'Quarto' },
  { nome: 'leito', rotulo: 'Leito' },
  { nome: 'planoSaude', rotulo: 'Plano de saúde' },
  { nome: 'numeroPlanoSaude', rotulo: 'Número do plano' },
  {
    nome: 'beneficioTipo',
    rotulo: 'Tipo de benefício',
    opcoes: [
      { valor: 'APOSENTADORIA', rotulo: 'Aposentadoria' },
      { valor: 'BPC', rotulo: 'BPC' },
      { valor: 'PENSAO', rotulo: 'Pensão' },
      { valor: 'NENHUM', rotulo: 'Nenhum' },
    ],
  },
  { nome: 'beneficioNumero', rotulo: 'Número do benefício' },
  { nome: 'beneficioValor', rotulo: 'Valor do benefício (R$)', tipo: 'number' as const },
]

export function FormularioResidente({
  acao,
  residente,
  rotuloBotao,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  residente?: Residente
  rotuloBotao: string
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)

  const valorInicial = (nome: string): string | undefined => {
    const valor = residente?.[nome as keyof Residente]
    if (valor instanceof Date) return valor.toISOString().slice(0, 10)
    return valor == null ? undefined : String(valor)
  }

  return (
    <form action={enviar} className="space-y-4">
      {/* Sem isto `acaoAtualizarResidente` não sabe quem atualizar: é ela quem
          lê `dados.get('id')`. No cadastro não há residente, e nada é emitido. */}
      {residente && <input type="hidden" name="id" value={residente.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS_RESIDENTE.map((campo) => (
          <Campo key={campo.nome} {...campo} valorInicial={valorInicial(campo.nome)} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      {/* A edição não redireciona: sem este aviso o usuário salva e não recebe
          sinal nenhum de que a correção foi gravada. */}
      {estado?.sucesso && (
        <p role="status" className="text-sm text-green-700">
          Cadastro salvo.
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60 sm:w-auto"
      >
        {enviando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}
