import { PrismaClient } from '@prisma/client'

/**
 * Remove do banco de **desenvolvimento** os usuários descartáveis que as suítes
 * deixam para trás.
 *
 * A suíte E2E roda contra o banco de desenvolvimento, e não contra um banco
 * efêmero por execução — é o que permite abrir a tela e ver o estado que o
 * teste montou. O preço é que cada rodada deixa usuários novos: as telas de
 * usuários e de auditoria criam contas para exercitar troca de senha, troca de
 * papel e desativação, e nada as recolhe depois.
 *
 * Eles são inofensivos, mas atrapalham: a lista de usuários vira rolagem, e
 * quem abre a tela para conferir alguma coisa precisa procurar o que interessa
 * no meio de dezenas de "Usuário Senha 1787598335547".
 *
 * **Por conferência, não por confiança.** Só apaga quem casa com o padrão de
 * e-mail descartável — `<palavra>.<epoch>@lar.local` — e nunca os três fixos.
 * Uma conta de gente de verdade não tem esse formato, e um e-mail fora do
 * padrão é listado em vez de apagado, para alguém olhar.
 *
 * **A trilha de auditoria não é tocada.** Ela é append-only e registra o que
 * aconteceu; apagar linha dela por causa de faxina seria apagar justamente o
 * que ela existe para guardar. Os registros continuam apontando para ids que
 * não existem mais, e isso está certo — o `entidadeId` nunca teve chave
 * estrangeira, e o log já guarda o e-mail do ator por escrito.
 *
 * Uso:
 *   npm run db:limpar-teste            confere e lista, sem apagar nada
 *   npm run db:limpar-teste -- --apagar  apaga
 */

const FIXOS = [
  'coordenacao@lar.local',
  'enfermagem.e2e@lar.local',
  'administrativo.e2e@lar.local',
]

/** `auditoria.1787598307085@lar.local` e afins. */
const DESCARTAVEL = /^[a-z]+\.\d{10,}@lar\.local$/

async function principal(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script é do banco de desenvolvimento. Recusando em produção.')
  }

  if (!process.env.DATABASE_URL) process.loadEnvFile('.env')

  const apagar = process.argv.includes('--apagar')
  const prisma = new PrismaClient()

  try {
    const todos = await prisma.usuario.findMany({
      select: { id: true, email: true, nome: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    })

    const alvos = todos.filter(
      (usuario) => !FIXOS.includes(usuario.email) && DESCARTAVEL.test(usuario.email)
    )
    const foraDoPadrao = todos.filter(
      (usuario) => !FIXOS.includes(usuario.email) && !DESCARTAVEL.test(usuario.email)
    )

    console.log(`Usuários no banco: ${todos.length}`)
    console.log(`  fixos (preservados):     ${todos.length - alvos.length - foraDoPadrao.length}`)
    console.log(`  descartáveis:            ${alvos.length}`)
    console.log(`  fora do padrão:          ${foraDoPadrao.length}`)

    if (foraDoPadrao.length > 0) {
      console.log('\nEstes não casam com o padrão descartável e ficam onde estão.')
      console.log('Se algum for lixo de teste, apague à mão depois de olhar:')
      for (const usuario of foraDoPadrao) {
        console.log(`  ${usuario.email}  —  ${usuario.nome}`)
      }
    }

    if (alvos.length === 0) {
      console.log('\nNada a limpar.')
      return
    }

    if (!apagar) {
      console.log('\nConferência apenas. Para apagar de verdade:')
      console.log('  npm run db:limpar-teste -- --apagar')
      return
    }

    const ids = alvos.map((usuario) => usuario.id)
    const { count } = await prisma.usuario.deleteMany({ where: { id: { in: ids } } })

    const naTrilha = await prisma.logAuditoria.count({
      where: { entidade: 'Usuario', entidadeId: { in: ids } },
    })

    console.log(`\n${count} usuários removidos.`)
    console.log(
      `${naTrilha} registros da trilha continuam citando esses ids, de propósito: ` +
        'a trilha é append-only e guarda o que aconteceu.'
    )
  } finally {
    await prisma.$disconnect()
  }
}

await principal()
