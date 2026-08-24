import { PrismaClient, type Papel } from '@prisma/client'
import { hashSenha, verificarSenha } from '../../src/lib/senha'
import {
  EMAIL_SEMENTE,
  SENHA_SEMENTE,
  EMAIL_ADMINISTRATIVO,
  EMAIL_SAUDE,
  SENHA_ADMINISTRATIVO,
  SENHA_SAUDE,
  NOME_RESIDENTE_SAUDE,
} from './credenciais'

/**
 * Deixa o usuário no estado que o `auth.setup` espera: existindo, ativo, com
 * o papel certo e com aquela senha. Conta desativada, papel trocado ou senha
 * diferente derrubariam o login com uma falha que não é do sistema, e sim do
 * estado do banco de desenvolvimento — a suíte E2E roda contra ele, e não
 * contra um banco efêmero por execução.
 */
async function garantirUsuario(
  prisma: PrismaClient,
  dados: { email: string; senha: string; papel: Papel; nome: string }
): Promise<void> {
  const existente = await prisma.usuario.findUnique({ where: { email: dados.email } })

  if (!existente) {
    await prisma.usuario.create({
      data: {
        email: dados.email,
        nome: dados.nome,
        papel: dados.papel,
        senhaHash: await hashSenha(dados.senha),
      },
    })
    return
  }

  const senhaConfere = await verificarSenha(existente.senhaHash, dados.senha)
  if (!existente.ativo || existente.papel !== dados.papel || !senhaConfere) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: {
        ativo: true,
        papel: dados.papel,
        senhaHash: senhaConfere ? existente.senhaHash : await hashSenha(dados.senha),
      },
    })
  }
}

/**
 * Garante os usuários-semente e o residente do perfil SAUDE antes da suíte:
 * sem isto o E2E dependeria de um `npm run db:seed` manual e falharia numa
 * máquina recém-clonada.
 *
 * Roda fora do Next, que é quem normalmente carrega o `.env` — daí a carga
 * explícita. Se `DATABASE_URL` já veio do ambiente, ela vence: o `.env` não
 * pode sequestrar uma execução apontada de propósito para outro banco.
 */
export default async function garantirSementes(): Promise<void> {
  if (!process.env.DATABASE_URL) process.loadEnvFile('.env')

  const prisma = new PrismaClient()

  try {
    await garantirUsuario(prisma, {
      email: EMAIL_SEMENTE,
      senha: SENHA_SEMENTE,
      papel: 'COORDENACAO',
      nome: 'Coordenação',
    })

    await garantirUsuario(prisma, {
      email: EMAIL_SAUDE,
      senha: SENHA_SAUDE,
      papel: 'SAUDE',
      nome: 'Enfermagem (E2E)',
    })

    await garantirUsuario(prisma, {
      email: EMAIL_ADMINISTRATIVO,
      senha: SENHA_ADMINISTRATIVO,
      papel: 'ADMINISTRATIVO',
      nome: 'Administrativo (E2E)',
    })

    // O perfil SAUDE não pode cadastrar residente, então o residente sobre o
    // qual ele age precisa já existir. `findFirst` pelo nome, e não `upsert`:
    // `nomeCompleto` não é único no schema, e não deve ser.
    const existente = await prisma.residente.findFirst({
      where: { nomeCompleto: NOME_RESIDENTE_SAUDE },
    })

    if (!existente) {
      await prisma.residente.create({
        data: {
          nomeCompleto: NOME_RESIDENTE_SAUDE,
          dataNascimento: new Date('1938-05-20'),
          sexo: 'FEMININO',
          dataAdmissao: new Date('2026-01-05'),
          quarto: '12',
        },
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}
