import { PrismaClient } from '@prisma/client'
import { EMAIL_DESCARTAVEL, NOME_DESCARTAVEL } from '../src/lib/descartavel'

/**
 * Recolhe do banco de **desenvolvimento** os cadastros descartáveis que as
 * suítes deixam para trás: usuários, residentes e funcionários.
 *
 * Substitui o `limpar-usuarios-de-teste.ts`, que só via usuários. O problema
 * cresceu de lado: em 27/08/2026 o banco tinha 120 usuários e **mil e vinte e
 * sete residentes**, e nada os recolhia. Os padrões que separam lixo de gente
 * moram em `src/lib/descartavel.ts`, com teste próprio.
 *
 * **Por que isto deixou de ser cosmético.** Com mil residentes e vinte por
 * página, um teste que cadastra alguém e o procura na lista não o encontra
 * mais — foi assim que a paginação derrubou seis testes E2E que estavam
 * certos. E um deles teria passado pelo motivo errado: o `toHaveCount(0)` que
 * prova que um funcionário desligado sai do aviso passaria por ausência da
 * página, não por ausência do registro.
 *
 * **Por conferência, não por confiança.** Só apaga quem casa com o padrão
 * descartável e nunca os fixos. Quem fica fora do padrão é **listado**, para
 * alguém olhar, e não apagado. Um cadastro de gente de verdade não tem o
 * carimbo de época no fim do nome.
 *
 * **A trilha de auditoria não é tocada.** Ela é append-only e registra o que
 * aconteceu; apagar linha dela por causa de faxina seria apagar justamente o
 * que ela existe para guardar. Os registros continuam apontando para ids que
 * não existem mais, e isso está certo — o `entidadeId` nunca teve chave
 * estrangeira, e o log já guarda por escrito quem foi o ator.
 *
 * **As tabelas dependentes são descobertas no catálogo do Postgres**, e não
 * escritas à mão. Uma tabela nova que passe a apontar para residente entra
 * sozinha na faxina; uma lista fixa aqui teria envelhecido em silêncio a cada
 * fase nova. A ordem de exclusão sai das próprias chaves estrangeiras entre as
 * dependentes — `administracoes_medicacao` antes de `medicacoes`, `exames` e
 * `consultas` antes de `documentos`.
 *
 * Uso:
 *   npm run db:limpar-teste              confere e lista, sem apagar nada
 *   npm run db:limpar-teste -- --apagar  apaga
 */

const EMAILS_FIXOS = [
  'coordenacao@lar.local',
  'enfermagem.e2e@lar.local',
  'administrativo.e2e@lar.local',
]

/**
 * O residente que o `global-setup` garante para o perfil SAUDE. Não tem
 * carimbo de época, então o padrão já não o alcança — está aqui como segunda
 * trava, porque apagá-lo derrubaria a suíte inteira que ele existe para servir.
 */
const NOMES_FIXOS = ['Residente Perfil Saude E2E']

type Aresta = { filha: string; mae: string }

/**
 * As tabelas que apontam para `mae`, já em ordem segura de exclusão: quem é
 * referenciado por outra dependente vem depois de quem a referencia.
 */
async function dependentesEmOrdem(
  prisma: PrismaClient,
  mae: string
): Promise<{ tabela: string; coluna: string }[]> {
  const filhas = await prisma.$queryRawUnsafe<{ tabela: string; coluna: string }[]>(
    `SELECT DISTINCT tc.table_name AS tabela, kcu.column_name AS coluna
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1`,
    mae
  )

  const nomes = filhas.map((f) => f.tabela)
  const arestas = await prisma.$queryRawUnsafe<Aresta[]>(
    `SELECT DISTINCT tc.table_name AS filha, ccu.table_name AS mae
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = ANY($1) AND tc.table_name = ANY($1)
        AND tc.table_name <> ccu.table_name`,
    nomes
  )

  // Ordenação topológica simples: quem ninguém referencia sai primeiro. Com
  // quatro arestas hoje isto é exagero de forma e economia de manutenção —
  // acertar a ordem à mão a cada tabela nova é o tipo de coisa que se esquece.
  const ordenadas: typeof filhas = []
  const pendentes = [...filhas]
  while (pendentes.length > 0) {
    const livre = pendentes.findIndex(
      (f) => !arestas.some((a) => a.mae === f.tabela && pendentes.some((p) => p.tabela === a.filha))
    )
    if (livre === -1) {
      throw new Error(
        `Ciclo entre as dependentes de ${mae}: ${pendentes.map((p) => p.tabela).join(', ')}`
      )
    }
    ordenadas.push(...pendentes.splice(livre, 1))
  }
  return ordenadas
}

async function apagarComDependentes(
  prisma: PrismaClient,
  mae: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0

  for (const { tabela, coluna } of await dependentesEmOrdem(prisma, mae)) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${tabela}" WHERE "${coluna}" = ANY($1)`,
      ids
    )
  }
  return prisma.$executeRawUnsafe(`DELETE FROM "${mae}" WHERE "id" = ANY($1)`, ids)
}

function relatar(
  rotulo: string,
  total: number,
  alvos: { rotulo: string }[],
  foraDoPadrao: { rotulo: string }[]
): void {
  console.log(`\n${rotulo}: ${total}`)
  console.log(`  fixos (preservados):  ${total - alvos.length - foraDoPadrao.length}`)
  console.log(`  descartáveis:         ${alvos.length}`)
  console.log(`  fora do padrão:       ${foraDoPadrao.length}`)

  if (foraDoPadrao.length > 0) {
    console.log('  Estes não casam com o padrão descartável e ficam onde estão:')
    for (const item of foraDoPadrao.slice(0, 20)) console.log(`    ${item.rotulo}`)
    if (foraDoPadrao.length > 20) console.log(`    … e mais ${foraDoPadrao.length - 20}`)
  }
}

async function principal(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script é do banco de desenvolvimento. Recusando em produção.')
  }

  if (!process.env.DATABASE_URL) process.loadEnvFile('.env')

  const apagar = process.argv.includes('--apagar')
  const prisma = new PrismaClient()

  try {
    const usuarios = await prisma.usuario.findMany({ select: { id: true, email: true, nome: true } })
    const residentes = await prisma.residente.findMany({ select: { id: true, nomeCompleto: true } })
    const funcionarios = await prisma.funcionario.findMany({
      select: { id: true, nomeCompleto: true },
    })

    const usuariosAlvo = usuarios.filter(
      (u) => !EMAILS_FIXOS.includes(u.email) && EMAIL_DESCARTAVEL.test(u.email)
    )
    const usuariosFora = usuarios.filter(
      (u) => !EMAILS_FIXOS.includes(u.email) && !EMAIL_DESCARTAVEL.test(u.email)
    )
    const residentesAlvo = residentes.filter(
      (r) => !NOMES_FIXOS.includes(r.nomeCompleto) && NOME_DESCARTAVEL.test(r.nomeCompleto)
    )
    const residentesFora = residentes.filter(
      (r) => !NOMES_FIXOS.includes(r.nomeCompleto) && !NOME_DESCARTAVEL.test(r.nomeCompleto)
    )
    const funcionariosAlvo = funcionarios.filter((f) => NOME_DESCARTAVEL.test(f.nomeCompleto))
    const funcionariosFora = funcionarios.filter((f) => !NOME_DESCARTAVEL.test(f.nomeCompleto))

    relatar(
      'Usuários',
      usuarios.length,
      usuariosAlvo.map((u) => ({ rotulo: `${u.email} — ${u.nome}` })),
      usuariosFora.map((u) => ({ rotulo: `${u.email} — ${u.nome}` }))
    )
    relatar(
      'Residentes',
      residentes.length,
      residentesAlvo.map((r) => ({ rotulo: r.nomeCompleto })),
      residentesFora.map((r) => ({ rotulo: r.nomeCompleto }))
    )
    relatar(
      'Funcionários',
      funcionarios.length,
      funcionariosAlvo.map((f) => ({ rotulo: f.nomeCompleto })),
      funcionariosFora.map((f) => ({ rotulo: f.nomeCompleto }))
    )

    const total = usuariosAlvo.length + residentesAlvo.length + funcionariosAlvo.length
    if (total === 0) {
      console.log('\nNada a limpar.')
      return
    }

    if (!apagar) {
      console.log(`\nConferência apenas — ${total} cadastros seriam removidos.`)
      console.log('Para apagar de verdade:  npm run db:limpar-teste -- --apagar')
      return
    }

    // Funcionários antes de residentes só por clareza do relatório: as duas
    // faxinas são independentes, e `documentos` é dependente das duas.
    const nFuncionarios = await apagarComDependentes(
      prisma,
      'funcionarios',
      funcionariosAlvo.map((f) => f.id)
    )
    const nResidentes = await apagarComDependentes(
      prisma,
      'residentes',
      residentesAlvo.map((r) => r.id)
    )
    const nUsuarios = await apagarComDependentes(
      prisma,
      'usuarios',
      usuariosAlvo.map((u) => u.id)
    )

    console.log(
      `\nRemovidos: ${nUsuarios} usuários, ${nResidentes} residentes, ${nFuncionarios} funcionários.`
    )
    console.log(
      'A trilha de auditoria continua citando esses ids, de propósito: ela é ' +
        'append-only e guarda o que aconteceu.'
    )
    console.log(
      'Os arquivos de documentos anexados continuam no volume de uploads — o ' +
        'registro saiu, o arquivo não. Numa faxina de banco de desenvolvimento ' +
        'isso é preferível a apagar arquivo por dedução.'
    )
  } finally {
    await prisma.$disconnect()
  }
}

await principal()
