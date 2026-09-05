'use client'

import { useActionState } from 'react'
import type { Residente } from '@prisma/client'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'
import { Botao } from '@/components/ui/botao'
import { useHidratado } from '@/lib/hidratacao'

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
  variante,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  residente?: Residente
  rotuloBotao: string
  /** Repassado ao `Botao`. Sem valor, ele decide sozinho (`primario`) — é o
   *  que preserva o comportamento de todo formulário que não é destrutivo. */
  variante?: 'primario' | 'secundario' | 'perigo'
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)
  const hidratado = useHidratado()

  const valorInicial = (nome: string): string | undefined => {
    const valor = residente?.[nome as keyof Residente]
    if (valor instanceof Date) return valor.toISOString().slice(0, 10)
    return valor == null ? undefined : String(valor)
  }

  return (
    <form action={enviar} className="space-y-4" data-hidratado={hidratado}>
      {/* Sem isto `acaoAtualizarResidente` não sabe quem atualizar: é ela quem
          lê `dados.get('id')`. No cadastro não há residente, e nada é emitido. */}
      {residente && <input type="hidden" name="id" value={residente.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS_RESIDENTE.map((campo) => (
          <Campo key={campo.nome} {...campo} valorInicial={valorInicial(campo.nome)} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-suporte text-perigo">
          {estado.erro}
        </p>
      )}

      {/* A edição não redireciona: sem este aviso o usuário salva e não recebe
          sinal nenhum de que a correção foi gravada. */}
      {estado?.sucesso && (
        <p role="status" className="text-suporte text-sucesso">
          Cadastro salvo.
        </p>
      )}

      <Botao variante={variante} disabled={enviando} className="w-full sm:w-auto">
        {enviando ? 'Salvando…' : rotuloBotao}
      </Botao>
    </form>
  )
}
