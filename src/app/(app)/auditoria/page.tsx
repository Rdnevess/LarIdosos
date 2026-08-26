import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AcaoAuditoria } from '@prisma/client'
import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { consultarAuditoria } from '@/modules/audit/auditoria.consulta'
import type { EntidadeAuditada } from '@/modules/audit/auditoria.service'
import { formatarDiff } from '@/modules/audit/auditoria.formatacao'
import { fimDoDia } from '@/lib/periodo'
import { formatarDataHora } from '@/lib/ptbr'
import { Botao } from '@/components/ui/botao'

// Tipado contra o enum do Prisma de propósito: uma ação nova em
// `AcaoAuditoria` sem rótulo aqui quebra o `typecheck`, em vez de vazar o
// valor cru (`LOGIN_FALHA`, `EXPORTAR`...) para a tela — mesmo problema que a
// Tarefa 14 (`VISITA_FAMILIA`) e a Tarefa 15 (`ROTULO_VINCULO`) corrigiram.
const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  CRIAR: 'Criação',
  ATUALIZAR: 'Atualização',
  EXCLUIR: 'Exclusão',
  VISUALIZAR: 'Visualização',
  LOGIN: 'Login',
  LOGIN_FALHA: 'Falha de login',
  LOGOUT: 'Logout',
  EXPORTAR: 'Exportação',
  DOWNLOAD: 'Download',
  ACESSO_NEGADO: 'Acesso negado',
}

// Desde que `entidade` deixou de ser `string` solta e virou `EntidadeAuditada`
// (`auditoria.service.ts`), este mapa é `Record` da união: entidade nova sem
// rótulo quebra o `typecheck`, como já acontecia com `ROTULO_ACAO`. Era o que
// o comentário anterior aqui lamentava não ser possível.
const ROTULO_ENTIDADE: Record<EntidadeAuditada, string> = {
  Residente: 'Residente',
  Responsavel: 'Responsável',
  Documento: 'Documento',
  Anotacao: 'Anotação',
  AvaliacaoDependencia: 'Avaliação de dependência',
  Funcionario: 'Funcionário',
  Usuario: 'Usuário',
  LogAuditoria: 'Trilha de auditoria',
  CondicaoCronica: 'Condição crônica',
  Alergia: 'Alergia',
  RestricaoAlimentar: 'Restrição alimentar',
  AnotacaoSaude: 'Anotação de saúde',
  SinalVital: 'Sinal vital',
  Exame: 'Exame',
  Consulta: 'Consulta',
  Vacina: 'Vacina',
  Medicacao: 'Medicação',
  AdministracaoMedicacao: 'Administração de medicação',
  ConfiguracaoInstituicao: 'Dados da instituição',
  ContaBancaria: 'Conta bancária',
  OrigemReceita: 'Origem de receita',
  CategoriaDespesa: 'Categoria de despesa',
  Fornecedor: 'Fornecedor',
  Lancamento: 'Lançamento',
  PrestacaoContas: 'Prestação de contas',
  ContribuicaoResidente: 'Contribuição do residente',
}

// O banco guarda `String`, então o valor que chega aqui pode ser de uma
// versão anterior do sistema. O resguardo é isso, não uma entidade nova
// esquecida — essa não compila mais.
function rotularEntidade(entidade: string): string {
  return ROTULO_ENTIDADE[entidade as EntidadeAuditada] ?? entidade
}

// `formatarDiff` mora em `auditoria.formatacao.ts` (não aqui): ela traduz
// cada valor dentro do diff (enum, booleano, data ISO), não só o rótulo da
// ação/entidade da linha. Ficou num módulo puro à parte para poder ser
// testada sem carregar esta página inteira.

// `Number('abc')` é `NaN`, e `?pagina=` é digitável à mão na barra de
// endereço. Sem este resguardo, uma página inválida chegaria a
// `consultarAuditoria` como `NaN` e faria o `skip` do Prisma quebrar em vez
// de simplesmente cair na primeira página.
function numeroPagina(valor: string | undefined): number {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : 1
}

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{
    entidade?: string
    usuarioId?: string
    de?: string
    ate?: string
    pagina?: string
  }>
}) {
  const filtros = await searchParams
  const ctx = await obterCtx()
  const pagina = numeroPagina(filtros.pagina)

  const [usuarios, resultado] = await Promise.all([
    listarUsuarios(ctx),
    consultarAuditoria(ctx, {
      entidade: filtros.entidade || undefined,
      usuarioId: filtros.usuarioId || undefined,
      de: filtros.de ? new Date(`${filtros.de}T00:00:00`) : undefined,
      ate: filtros.ate ? fimDoDia(filtros.ate) : undefined,
      pagina,
    }),
  ])

  const parametros = (novaPagina: number) => {
    const busca = new URLSearchParams()
    for (const [chave, valor] of Object.entries(filtros)) {
      if (valor && chave !== 'pagina') busca.set(chave, valor)
    }
    busca.set('pagina', String(novaPagina))
    return `?${busca.toString()}`
  }

  // O excesso só é detectável depois da consulta, porque é ela quem sabe
  // quantas páginas existem. Sem isto, pedir a página 9999 de 12 mostrava o
  // cabeçalho dizendo exatamente isso, com a lista vazia embaixo — o que
  // parece trilha sem registro, e é a conclusão errada para quem audita.
  //
  // `paginas > 0` evita o laço quando não há registro nenhum: aí a página 1
  // vazia é a resposta certa.
  if (resultado.paginas > 0 && pagina > resultado.paginas) {
    redirect(`/auditoria${parametros(resultado.paginas)}`)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-forte">Trilha de auditoria</h1>

      <form className="grid gap-2 sm:grid-cols-5">
        <select
          name="entidade"
          defaultValue={filtros.entidade ?? ''}
          aria-label="Entidade"
          className="rounded border border-borda px-3 py-2 text-base"
        >
          <option value="">Todas as entidades</option>
          {Object.entries(ROTULO_ENTIDADE).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>

        <select
          name="usuarioId"
          defaultValue={filtros.usuarioId ?? ''}
          aria-label="Usuário"
          className="rounded border border-borda px-3 py-2 text-base"
        >
          <option value="">Todos os usuários</option>
          {usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.nome}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="de"
          defaultValue={filtros.de}
          aria-label="De"
          className="rounded border border-borda px-3 py-2 text-base"
        />
        <input
          type="date"
          name="ate"
          defaultValue={filtros.ate}
          aria-label="Até"
          className="rounded border border-borda px-3 py-2 text-base"
        />

        <Botao variante="secundario">Filtrar</Botao>
      </form>

      <p className="text-sm text-apoio">
        {resultado.total} registro(s) · página {pagina} de {resultado.paginas}
      </p>

      <div className="overflow-x-auto cartao">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-suave">
            <tr>
              <th className="p-2">Data/hora</th>
              <th className="p-2">Usuário</th>
              <th className="p-2">Ação</th>
              <th className="p-2">Entidade</th>
              <th className="p-2">Alteração</th>
            </tr>
          </thead>
          <tbody>
            {resultado.registros.map((registro) => (
              <tr key={registro.id} className="border-b last:border-0">
                <td className="whitespace-nowrap p-2">{formatarDataHora(registro.criadoEm)}</td>
                <td className="p-2">{registro.usuarioEmail}</td>
                <td className="p-2">{ROTULO_ACAO[registro.acao]}</td>
                <td className="p-2">
                  {rotularEntidade(registro.entidade)}
                  {registro.entidadeId && (
                    <span className="block text-xs text-apoio">{registro.entidadeId}</span>
                  )}
                </td>
                <td className="p-2 text-medio">{formatarDiff(registro.diff)}</td>
              </tr>
            ))}
            {resultado.registros.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-apoio">
                  Nenhum registro no filtro selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        {pagina > 1 && (
          <Link
            href={parametros(pagina - 1)}
            className="min-h-11 inline-flex items-center rounded border px-3 py-2 text-sm"
          >
            Anterior
          </Link>
        )}
        {pagina < resultado.paginas && (
          <Link
            href={parametros(pagina + 1)}
            className="min-h-11 inline-flex items-center rounded border px-3 py-2 text-sm"
          >
            Próxima
          </Link>
        )}
      </div>
    </section>
  )
}
