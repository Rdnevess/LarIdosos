import type { ConfiguracaoInstituicao } from '@prisma/client'
import { FormularioSimples } from './formulario-simples'
import {
  acaoSalvarInstituicao,
  acaoCriarConta,
  acaoCriarOrigem,
  acaoCriarCategoria,
  acaoCriarFornecedor,
  acaoLancarReceita,
  acaoLancarDespesa,
  acaoCancelarLancamento,
  acaoAbrirPrestacao,
  acaoAjustarSaldoAnterior,
  acaoRegistrarObservacoes,
  acaoFecharPrestacao,
  acaoReabrirPrestacao,
  acaoDefinirContribuicao,
  acaoLancarContribuicao,
} from '@/app/(app)/financeiro/acoes'

/**
 * Os formulários do financeiro.
 *
 * Nenhum deles valida nada: a validação mora no schema do serviço, e duplicá-la
 * aqui garantiria que as duas versões divergissem. O que a tela faz é oferecer
 * as opções certas — conta, origem, categoria, fornecedor vêm de listas, e não
 * de texto livre, porque foi o texto livre da planilha que quebrou o `SUMIF`.
 */

export type Opcao = { valor: string; rotulo: string }

export function FormularioInstituicao({
  atual,
}: {
  atual: ConfiguracaoInstituicao | null
}) {
  return (
    <FormularioSimples
      acao={acaoSalvarInstituicao}
      prefixoId="instituicao"
      rotuloBotao="Salvar dados da instituição"
      campos={[
        {
          nome: 'razaoSocial',
          rotulo: 'Razão social',
          obrigatorio: true,
          valorInicial: atual?.razaoSocial,
        },
        { nome: 'cnpj', rotulo: 'CNPJ', obrigatorio: true, valorInicial: atual?.cnpj },
        {
          nome: 'enderecoCompleto',
          rotulo: 'Endereço completo',
          obrigatorio: true,
          valorInicial: atual?.enderecoCompleto,
        },
        { nome: 'cidade', rotulo: 'Cidade', obrigatorio: true, valorInicial: atual?.cidade },
        { nome: 'uf', rotulo: 'UF', obrigatorio: true, valorInicial: atual?.uf },
        {
          nome: 'orgaoDestinatario',
          rotulo: 'Órgão destinatário',
          obrigatorio: true,
          valorInicial: atual?.orgaoDestinatario,
        },
        {
          nome: 'nomePresidente',
          rotulo: 'Nome do presidente',
          obrigatorio: true,
          valorInicial: atual?.nomePresidente,
        },
        {
          nome: 'nomeTesoureiro',
          rotulo: 'Nome do tesoureiro',
          obrigatorio: true,
          valorInicial: atual?.nomeTesoureiro,
        },
      ]}
    />
  )
}

export function FormularioConta() {
  return (
    <FormularioSimples
      acao={acaoCriarConta}
      prefixoId="conta"
      rotuloBotao="Cadastrar conta"
      campos={[
        { nome: 'banco', rotulo: 'Banco', obrigatorio: true },
        { nome: 'agencia', rotulo: 'Agência', obrigatorio: true },
        { nome: 'numeroConta', rotulo: 'Número da conta', obrigatorio: true },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          obrigatorio: true,
          opcoes: [
            { valor: 'CORRENTE', rotulo: 'Conta corrente' },
            { valor: 'POUPANCA', rotulo: 'Poupança' },
            { valor: 'APLICACAO', rotulo: 'Aplicação' },
          ],
        },
        { nome: 'titular', rotulo: 'Titular', obrigatorio: true },
        { nome: 'saldoInicial', rotulo: 'Saldo inicial', tipo: 'number', obrigatorio: true },
        {
          nome: 'dataSaldoInicial',
          rotulo: 'Data do saldo inicial',
          tipo: 'date',
          obrigatorio: true,
        },
      ]}
    />
  )
}

export function FormularioOrigem() {
  return (
    <FormularioSimples
      acao={acaoCriarOrigem}
      prefixoId="origem"
      rotuloBotao="Cadastrar origem"
      campos={[
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        // Em branco, o serviço usa o próprio nome. É por este campo que a
        // contribuição de um residente sai somada às demais como "Doação".
        { nome: 'rotuloPrestacao', rotulo: 'Rótulo na prestação' },
        {
          nome: 'exigeResidente',
          rotulo: 'Exige informar o residente',
          tipo: 'checkbox',
        },
      ]}
    />
  )
}

export function FormularioCategoria() {
  return (
    <FormularioSimples
      acao={acaoCriarCategoria}
      prefixoId="categoria"
      colunas={1}
      rotuloBotao="Cadastrar categoria"
      campos={[{ nome: 'nome', rotulo: 'Nome', obrigatorio: true }]}
    />
  )
}

export function FormularioFornecedor() {
  return (
    <FormularioSimples
      acao={acaoCriarFornecedor}
      prefixoId="fornecedor"
      rotuloBotao="Cadastrar fornecedor"
      campos={[
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        {
          nome: 'tipoDocumento',
          rotulo: 'Tipo de documento',
          obrigatorio: true,
          opcoes: [
            { valor: 'CNPJ', rotulo: 'CNPJ' },
            { valor: 'CPF', rotulo: 'CPF' },
          ],
        },
        { nome: 'documento', rotulo: 'Documento', obrigatorio: true },
        { nome: 'telefone', rotulo: 'Telefone' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
      ]}
    />
  )
}

export function FormularioReceita({
  contas,
  origens,
  residentes,
}: {
  contas: Opcao[]
  origens: Opcao[]
  residentes: Opcao[]
}) {
  return (
    <FormularioSimples
      acao={acaoLancarReceita}
      prefixoId="receita"
      rotuloBotao="Lançar receita"
      campos={[
        { nome: 'contaBancariaId', rotulo: 'Conta bancária', obrigatorio: true, opcoes: contas },
        { nome: 'origemReceitaId', rotulo: 'Origem', obrigatorio: true, opcoes: origens },
        { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
        { nome: 'valor', rotulo: 'Valor', tipo: 'number', obrigatorio: true },
        { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true },
        // Só para as origens marcadas como "exige residente"; o serviço recusa
        // quando falta, e ignora quando sobra.
        { nome: 'residenteId', rotulo: 'Residente (se for contribuição)', opcoes: residentes },
        { nome: 'pagadorNome', rotulo: 'Nome do pagador' },
        { nome: 'observacao', rotulo: 'Observação' },
      ]}
    />
  )
}

export function FormularioDespesa({
  contas,
  fornecedores,
  categorias,
}: {
  contas: Opcao[]
  fornecedores: Opcao[]
  categorias: Opcao[]
}) {
  return (
    <FormularioSimples
      acao={acaoLancarDespesa}
      prefixoId="despesa"
      rotuloBotao="Lançar despesa"
      campos={[
        { nome: 'contaBancariaId', rotulo: 'Conta bancária', obrigatorio: true, opcoes: contas },
        { nome: 'fornecedorId', rotulo: 'Fornecedor', obrigatorio: true, opcoes: fornecedores },
        {
          nome: 'categoriaDespesaId',
          rotulo: 'Categoria',
          obrigatorio: true,
          opcoes: categorias,
        },
        {
          nome: 'formaPagamento',
          rotulo: 'Forma de pagamento',
          obrigatorio: true,
          opcoes: [
            { valor: 'PIX', rotulo: 'PIX' },
            { valor: 'TED', rotulo: 'TED' },
            { valor: 'CHEQUE', rotulo: 'Cheque' },
            { valor: 'DEBITO', rotulo: 'Débito em conta' },
            { valor: 'OUTRO', rotulo: 'Outro' },
          ],
        },
        { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
        { nome: 'valor', rotulo: 'Valor', tipo: 'number', obrigatorio: true },
        { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true },
        { nome: 'numeroDocumentoFiscal', rotulo: 'Número do documento fiscal' },
        { nome: 'observacao', rotulo: 'Observação' },
      ]}
    />
  )
}

export function FormularioCancelarLancamento({ id }: { id: string }) {
  return (
    <FormularioSimples
      acao={acaoCancelarLancamento}
      ocultos={{ id }}
      prefixoId={`cancelar-${id}`}
      colunas={1}
      rotuloBotao="Cancelar lançamento"
      variante="perigo"
      aviso="O lançamento não é apagado: fica registrado como cancelado, com o motivo. Um lançamento apagado é um buraco no extrato que ninguém explica depois."
      campos={[{ nome: 'motivo', rotulo: 'Motivo do cancelamento', obrigatorio: true }]}
    />
  )
}

const MESES: Opcao[] = [
  { valor: '1', rotulo: 'Janeiro' },
  { valor: '2', rotulo: 'Fevereiro' },
  { valor: '3', rotulo: 'Março' },
  { valor: '4', rotulo: 'Abril' },
  { valor: '5', rotulo: 'Maio' },
  { valor: '6', rotulo: 'Junho' },
  { valor: '7', rotulo: 'Julho' },
  { valor: '8', rotulo: 'Agosto' },
  { valor: '9', rotulo: 'Setembro' },
  { valor: '10', rotulo: 'Outubro' },
  { valor: '11', rotulo: 'Novembro' },
  { valor: '12', rotulo: 'Dezembro' },
]

export function FormularioAbrirPrestacao({ contas }: { contas: Opcao[] }) {
  const agora = new Date()

  return (
    <FormularioSimples
      acao={acaoAbrirPrestacao}
      prefixoId="abrir-prestacao"
      rotuloBotao="Abrir prestação"
      campos={[
        { nome: 'contaBancariaId', rotulo: 'Conta bancária', obrigatorio: true, opcoes: contas },
        {
          nome: 'anoCompetencia',
          rotulo: 'Ano',
          tipo: 'number',
          obrigatorio: true,
          valorInicial: String(agora.getFullYear()),
        },
        { nome: 'mesCompetencia', rotulo: 'Mês', obrigatorio: true, opcoes: MESES },
      ]}
    />
  )
}

export function FormularioAjustarSaldo({
  id,
  saldoDerivado,
}: {
  id: string
  saldoDerivado: number
}) {
  return (
    <FormularioSimples
      acao={acaoAjustarSaldoAnterior}
      ocultos={{ id }}
      prefixoId={`ajuste-${id}`}
      rotuloBotao="Ajustar saldo anterior"
      aviso="O valor derivado continua guardado, e a divergência fica na trilha com o seu nome. A justificativa sai nas observações do documento entregue ao órgão."
      campos={[
        {
          nome: 'valor',
          rotulo: 'Saldo anterior correto',
          tipo: 'number',
          obrigatorio: true,
          valorInicial: String(saldoDerivado),
        },
        { nome: 'justificativa', rotulo: 'Justificativa', obrigatorio: true },
      ]}
    />
  )
}

export function FormularioObservacoes({
  id,
  atual,
}: {
  id: string
  atual: string
}) {
  return (
    <FormularioSimples
      acao={acaoRegistrarObservacoes}
      ocultos={{ id }}
      prefixoId={`obs-${id}`}
      colunas={1}
      rotuloBotao="Salvar observações"
      campos={[
        {
          nome: 'observacoes',
          rotulo: 'Observações do mês',
          valorInicial: atual,
        },
      ]}
    />
  )
}

export function FormularioFecharPrestacao({ id }: { id: string }) {
  return (
    <FormularioSimples
      acao={acaoFecharPrestacao}
      ocultos={{ id }}
      prefixoId={`fechar-${id}`}
      colunas={1}
      rotuloBotao="Fechar prestação"
      aviso="Fechar congela os lançamentos realizados da competência: eles deixam de aceitar cancelamento, e o documento entregue ao órgão para de mudar sozinho."
      campos={[]}
    />
  )
}

export function FormularioReabrirPrestacao({ id }: { id: string }) {
  return (
    <FormularioSimples
      acao={acaoReabrirPrestacao}
      ocultos={{ id }}
      prefixoId={`reabrir-${id}`}
      colunas={1}
      rotuloBotao="Reabrir prestação"
      aviso="O documento pode sair diferente do que já foi protocolado. A reabertura fica na trilha e o motivo sai impresso nas observações do documento regerado."
      campos={[{ nome: 'motivo', rotulo: 'Motivo da reabertura', obrigatorio: true }]}
    />
  )
}

export function FormularioContribuicao({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoDefinirContribuicao}
      ocultos={{ residenteId }}
      prefixoId={`contribuicao-${residenteId}`}
      rotuloBotao="Definir contribuição"
      aviso="A contribuição do idoso não pode passar de 70% do benefício (art. 35, §2º da Lei 10.741/2003). Definir uma nova encerra a anterior, preservando o histórico."
      campos={[
        {
          nome: 'percentual',
          rotulo: 'Percentual do benefício (%)',
          tipo: 'number',
          obrigatorio: true,
          valorInicial: '70',
        },
        {
          nome: 'valorBaseBeneficio',
          rotulo: 'Valor do benefício',
          tipo: 'number',
          obrigatorio: true,
        },
        { nome: 'vigenciaInicio', rotulo: 'Vigente a partir de', tipo: 'date', obrigatorio: true },
        { nome: 'observacao', rotulo: 'Observação' },
      ]}
    />
  )
}

export function FormularioLancarContribuicao({
  residenteId,
  residenteNome,
  valor,
  contaBancariaId,
  origemReceitaId,
  ano,
  mes,
}: {
  residenteId: string
  residenteNome: string
  valor: number
  contaBancariaId: string
  origemReceitaId: string
  ano: number
  mes: number
}) {
  // Dia 1 da competência: é o mês que define a contribuição, e não o dia em
  // que alguém abriu a tela. Sem isso, lançar em setembro a contribuição de
  // agosto a jogaria para fora da competência.
  const data = `${ano}-${String(mes).padStart(2, '0')}-01`

  return (
    <FormularioSimples
      acao={acaoLancarContribuicao}
      ocultos={{
        residenteId,
        contaBancariaId,
        origemReceitaId,
        valor: String(valor),
        data,
        descricao: `Contribuição de ${residenteNome} — ${String(mes).padStart(2, '0')}/${ano}`,
      }}
      prefixoId={`contrib-${residenteId}`}
      colunas={1}
      rotuloBotao="Lançar contribuição"
      campos={[]}
    />
  )
}
