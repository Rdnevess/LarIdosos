import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import {
  obterConfiguracaoInstituicao,
  listarContasBancarias,
} from '@/modules/financeiro/instituicao.service'
import {
  listarOrigensReceita,
  listarCategoriasDespesa,
  listarFornecedores,
} from '@/modules/financeiro/cadastros.service'
import { formatarMoeda } from '@/lib/ptbr'
import {
  FormularioInstituicao,
  FormularioConta,
  FormularioOrigem,
  FormularioCategoria,
  FormularioFornecedor,
} from '@/components/formularios-financeiro'

/**
 * O que precisa existir antes de qualquer lançamento.
 *
 * Sem condição de papel aqui: os serviços exigem COORDENACAO ou ADMINISTRATIVO,
 * e quem digitar a URL com outro papel cai na fronteira de erro e deixa
 * `ACESSO_NEGADO` na trilha.
 */

const TIPO_CONTA: Record<string, string> = {
  CORRENTE: 'Conta corrente',
  POUPANCA: 'Poupança',
  APLICACAO: 'Aplicação',
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <details className="rounded border bg-white p-4">
      <summary className="cursor-pointer font-medium text-slate-800">
        <h2 className="inline">{titulo}</h2>
      </summary>
      {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  )
}

export default async function PaginaCadastrosFinanceiro() {
  const ctx = await obterCtx()

  const [instituicao, contas, origens, categorias, fornecedores] = await Promise.all([
    obterConfiguracaoInstituicao(ctx),
    listarContasBancarias(ctx),
    listarOrigensReceita(ctx),
    listarCategoriasDespesa(ctx),
    listarFornecedores(ctx),
  ])

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Cadastros do financeiro</h1>
        <p className="text-sm text-slate-500">
          O que precisa existir antes de lançar.{' '}
          <Link href="/financeiro" className="underline">
            Ir para os lançamentos
          </Link>
          .
        </p>
      </div>

      <Secao
        titulo="Dados da instituição"
        descricao="Alimentam a capa, o ofício, os rodapés de assinatura e a declaração de encerramento da prestação de contas. Registro único: salvar de novo atualiza o que já existe."
      >
        <FormularioInstituicao atual={instituicao} />
      </Secao>

      <Secao
        titulo="Contas bancárias"
        descricao="Cada lançamento pertence a uma conta, e cada prestação cobre uma conta num mês."
      >
        <ul className="divide-y text-sm">
          {contas.map((conta) => (
            <li key={conta.id} className="py-2">
              <span className="font-medium text-slate-800">
                {conta.banco} — ag. {conta.agencia} — {conta.numeroConta}
              </span>
              <span className="block text-slate-500">
                {TIPO_CONTA[conta.tipo]} · {conta.titular} · saldo inicial{' '}
                {formatarMoeda(Number(conta.saldoInicial))}
              </span>
            </li>
          ))}
          {contas.length === 0 && (
            <li className="py-2 text-slate-500">Nenhuma conta cadastrada.</li>
          )}
        </ul>
        <FormularioConta />
      </Secao>

      <Secao
        titulo="Origens de receita"
        descricao="De onde o dinheiro vem. O rótulo da prestação é o que agrupa na conciliação — é por ele que a contribuição de um residente sai somada às demais como “Doação”, sem o nome dele."
      >
        <ul className="divide-y text-sm">
          {origens.map((origem) => (
            <li key={origem.id} className="py-2">
              <span className="font-medium text-slate-800">{origem.nome}</span>
              <span className="block text-slate-500">
                Na prestação: {origem.rotuloPrestacao}
                {origem.exigeResidente && ' · exige informar o residente'}
              </span>
            </li>
          ))}
          {origens.length === 0 && (
            <li className="py-2 text-slate-500">Nenhuma origem cadastrada.</li>
          )}
        </ul>
        <FormularioOrigem />
      </Secao>

      <Secao titulo="Categorias de despesa" descricao="Em que o dinheiro é gasto.">
        <ul className="divide-y text-sm">
          {categorias.map((categoria) => (
            <li key={categoria.id} className="py-2 text-slate-800">
              {categoria.nome}
            </li>
          ))}
          {categorias.length === 0 && (
            <li className="py-2 text-slate-500">Nenhuma categoria cadastrada.</li>
          )}
        </ul>
        <FormularioCategoria />
      </Secao>

      <Secao
        titulo="Fornecedores"
        descricao="Para quem se paga. O documento é conferido conforme o tipo — este cadastro é o que substitui o XLOOKUP quebrado da planilha."
      >
        <ul className="divide-y text-sm">
          {fornecedores.map((fornecedor) => (
            <li key={fornecedor.id} className="py-2">
              <span className="font-medium text-slate-800">{fornecedor.nome}</span>
              <span className="block text-slate-500">
                {fornecedor.tipoDocumento}: {fornecedor.documento}
                {fornecedor.telefone && ` · ${fornecedor.telefone}`}
              </span>
            </li>
          ))}
          {fornecedores.length === 0 && (
            <li className="py-2 text-slate-500">Nenhum fornecedor cadastrado.</li>
          )}
        </ul>
        <FormularioFornecedor />
      </Secao>
    </section>
  )
}
