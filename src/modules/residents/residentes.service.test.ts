import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarResidente,
  obterResidente,
  consultarResidentes,
  atualizarResidente,
  desligarResidente,
} from './residentes.service'

const dadosValidos = {
  nomeCompleto: 'Maria das Dores Silva',
  dataNascimento: new Date('1940-03-12'),
  sexo: 'FEMININO' as const,
  cpf: '529.982.247-25',
  dataAdmissao: new Date('2026-01-15'),
  quarto: '3',
  leito: 'A',
}

describe('criarResidente', () => {
  it('cria o residente com status ATIVO e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const residente = await criarResidente(ctx, dadosValidos)

    expect(residente.nomeCompleto).toBe('Maria das Dores Silva')
    expect(residente.status).toBe('ATIVO')
    expect(residente.cpf).toBe('52998224725')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa CPF com dígito verificador inválido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      criarResidente(ctx, { ...dadosValidos, cpf: '529.982.247-26' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita residente sem CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, { ...dadosValidos, cpf: undefined })
    expect(residente.cpf).toBeNull()
  })

  it('recusa CPF já cadastrado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, dadosValidos)
    await expect(criarResidente(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('recusa data de nascimento no futuro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const amanha = new Date(Date.now() + 86_400_000)
    await expect(
      criarResidente(ctx, { ...dadosValidos, dataNascimento: amanha })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega criação para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(criarResidente(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
  })

  it('recusa valor de benefício negativo, com mensagem em português', async () => {
    // Reproduz o achado I1 da re-revisão: sem o errorMap global (@/lib/zodErros),
    // esta mensagem saía em inglês ("Number must be greater than or equal to 0").
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      criarResidente(ctx, { ...dadosValidos, beneficioValor: -5 })
    ).rejects.toThrow('Deve ser maior ou igual a 0')
  })
})

describe('obterResidente', () => {
  it('permite leitura pelos três papéis e audita a visualização', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const residente = await criarResidente(admin, dadosValidos)

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const lido = await obterResidente(ctx, residente.id)
      expect(lido.id).toBe(residente.id)
    }

    const visualizacoes = await prisma.logAuditoria.count({
      where: { entidade: 'Residente', acao: 'VISUALIZAR', entidadeId: residente.id },
    })
    expect(visualizacoes).toBe(3)
  })
})

describe('CPF unico', () => {
  it('recusa mudar o CPF para um que ja e de outro residente', async () => {
    // O caso que faltava: a duplicidade tambem chega pela edicao, e nao so
    // pelo cadastro.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, dadosValidos)
    const outro = await criarResidente(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Joana Ribeiro',
      cpf: '11144477735',
    })

    await expect(
      atualizarResidente(ctx, outro.id, { cpf: dadosValidos.cpf })
    ).rejects.toThrow(ErroValidacao)
  })

  it('deixa salvar mantendo o proprio CPF', async () => {
    // A guarda do caminho comum: reenviar o formulario sem mexer no CPF nao
    // pode ser lido como duplicidade contra o proprio registro.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    const salvo = await atualizarResidente(ctx, residente.id, {
      cpf: dadosValidos.cpf,
      quarto: '7',
    })
    expect(salvo.quarto).toBe('7')
  })
})

describe('consultarResidentes — paginação', () => {
  async function criarVarios(ctx: Awaited<ReturnType<typeof ctxComPapel>>, quantos: number) {
    for (let i = 0; i < quantos; i++) {
      await criarResidente(ctx, {
        ...dadosValidos,
        // Prefixo numérico para que a ordem alfabética seja previsível: sem
        // isso a asserção de "quem está na página 2" dependeria de como o
        // banco ordena nomes iguais.
        nomeCompleto: `Residente ${String(i).padStart(3, '0')}`,
        cpf: undefined,
      })
    }
  }

  it('devolve a primeira página com o tamanho pedido, e o total de todos', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarVarios(ctx, 25)

    const pagina = await consultarResidentes(ctx, { pagina: 1, por: 20 })

    expect(pagina.itens).toHaveLength(20)
    expect(pagina.total).toBe(25)
    expect(pagina.paginas).toBe(2)
  })

  it('a página seguinte continua de onde a anterior parou, sem repetir nem pular', async () => {
    // O risco real de `skip`/`take` não é a contagem, é a ordenação instável:
    // com dois registros empatados no critério de ordem, um pode aparecer em
    // duas páginas enquanto outro não aparece em nenhuma. O desempate por
    // `id` é o que impede isso, e é isto que esta asserção mede — a união das
    // duas páginas tem de ser exatamente o conjunto inteiro.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarVarios(ctx, 25)

    const primeira = await consultarResidentes(ctx, { pagina: 1, por: 20 })
    const segunda = await consultarResidentes(ctx, { pagina: 2, por: 20 })

    expect(segunda.itens).toHaveLength(5)
    const ids = [...primeira.itens, ...segunda.itens].map((r) => r.id)
    expect(new Set(ids).size, 'houve repetição entre as páginas').toBe(25)
  })

  it('o filtro entra na contagem, e não só na fatia', async () => {
    // Uma contagem que ignorasse o filtro mostraria "página 1 de 3" numa
    // busca que cabe inteira na primeira — e ofereceria páginas vazias.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarVarios(ctx, 25)
    await criarResidente(ctx, { ...dadosValidos, nomeCompleto: 'Joaquim Único', cpf: undefined })

    const pagina = await consultarResidentes(ctx, { busca: 'joaquim', pagina: 1, por: 20 })

    expect(pagina.itens).toHaveLength(1)
    expect(pagina.total).toBe(1)
    expect(pagina.paginas).toBe(1)
  })
})

describe('consultarResidentes', () => {
  it('acha o nome acentuado por quem digita sem acento', async () => {
    // Quem usa o sistema digita no celular, em pe no corredor, e nao para
    // para achar o acento. `mode: 'insensitive'` do Prisma resolve
    // maiuscula/minuscula e nao toca em acento: hoje 'jose' nao acha 'Jose'
    // escrito com acento, e o nome do residente e o campo mais buscado do
    // sistema.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, {
      ...dadosValidos,
      nomeCompleto: 'José Antônio Conceição',
      cpf: undefined,
    })

    expect((await consultarResidentes(ctx, { busca: 'jose' })).itens).toHaveLength(1)
    expect((await consultarResidentes(ctx, { busca: 'antonio' })).itens).toHaveLength(1)
    expect((await consultarResidentes(ctx, { busca: 'conceicao' })).itens).toHaveLength(1)
  })

  it('acha o nome sem acento por quem digita com acento', async () => {
    // O caminho inverso: o nome foi cadastrado sem acento — acontece o tempo
    // todo — e quem procura escreve certo.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Jose Antonio Conceicao',
      cpf: undefined,
    })

    expect((await consultarResidentes(ctx, { busca: 'José' })).itens).toHaveLength(1)
    expect((await consultarResidentes(ctx, { busca: 'Conceição' })).itens).toHaveLength(1)
  })

  it('filtra por status e busca por nome sem diferenciar maiúsculas', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const maria = await criarResidente(ctx, dadosValidos)
    await criarResidente(ctx, {
      ...dadosValidos,
      nomeCompleto: 'João Pereira',
      cpf: undefined,
    })
    await desligarResidente(ctx, maria.id, {
      status: 'DESLIGADO',
      dataSaida: new Date('2026-06-01'),
      motivoSaida: 'Retorno à família',
    })

    const ativos = await consultarResidentes(ctx, { status: 'ATIVO' })
    expect(ativos.itens.map((r) => r.nomeCompleto)).toEqual(['João Pereira'])

    const busca = await consultarResidentes(ctx, { busca: 'maria das' })
    expect(busca.itens).toHaveLength(1)
  })

  it('não devolve dado sensível na listagem', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarResidente(ctx, dadosValidos)

    const [residente] = (await consultarResidentes(ctx, {})).itens

    expect(residente).not.toHaveProperty('cpf')
    expect(residente).not.toHaveProperty('rg')
    expect(residente).not.toHaveProperty('cns')
    expect(residente).not.toHaveProperty('beneficioValor')
    expect(residente).not.toHaveProperty('planoSaude')
    expect(residente.nomeCompleto).toBe('Maria das Dores Silva')
  })
})

describe('atualizarResidente', () => {
  it('audita apenas os campos alterados', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    await atualizarResidente(ctx, residente.id, { quarto: '5', leito: 'A' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({ quarto: { de: '3', para: '5' } })
  })

  it('apaga o campo quando recebe null e registra a limpeza na auditoria', async () => {
    // A outra ponta da limpeza pela tela: o conversor manda `null`, e é aqui
    // que ele precisa virar coluna vazia. Com `.optional()` sozinho, o Zod
    // recusava `null` e a limpeza morria na validação, antes do banco.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, { ...dadosValidos, religiao: 'Católica' })

    const atualizado = await atualizarResidente(ctx, residente.id, { religiao: null })

    expect(atualizado.religiao).toBeNull()

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'ATUALIZAR', entidadeId: residente.id },
    })
    expect(log.diff).toEqual({ religiao: { de: 'Católica', para: null } })
  })

  it('nega atualização para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      atualizarResidente(ctx, residente.id, { quarto: '5' })
    ).rejects.toThrow(ErroPermissao)
  })

  it('registra no diff a alteração de beneficioValor (Decimal) corretamente', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, {
      ...dadosValidos,
      cpf: undefined,
      beneficioTipo: 'BPC',
      beneficioValor: 1518,
    })

    await atualizarResidente(ctx, residente.id, { beneficioValor: 2000.5 })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Residente', acao: 'ATUALIZAR', entidadeId: residente.id },
      orderBy: { criadoEm: 'desc' },
    })

    const diff = log.diff as { beneficioValor?: { de: unknown; para: unknown } } | null
    expect(diff?.beneficioValor).toBeDefined()
    expect(Number(diff?.beneficioValor?.de)).toBe(1518)
    expect(Number(diff?.beneficioValor?.para)).toBe(2000.5)
  })
})

describe('desligarResidente', () => {
  it('registra saída sem apagar o registro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    const desligado = await desligarResidente(ctx, residente.id, {
      status: 'FALECIDO',
      dataSaida: new Date('2026-07-20'),
      motivoSaida: 'Óbito por causas naturais',
    })

    expect(desligado.status).toBe('FALECIDO')
    expect(await prisma.residente.count()).toBe(1)
  })

  it('recusa desligar quem já está desligado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)
    const saida = {
      status: 'DESLIGADO' as const,
      dataSaida: new Date('2026-07-20'),
      motivoSaida: 'Transferência',
    }

    await desligarResidente(ctx, residente.id, saida)
    await expect(desligarResidente(ctx, residente.id, saida)).rejects.toThrow(ErroValidacao)
  })

  it('recusa data de saída anterior à admissão', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(ctx, dadosValidos)

    await expect(
      desligarResidente(ctx, residente.id, {
        status: 'DESLIGADO',
        dataSaida: new Date('2025-01-01'),
        motivoSaida: 'Transferência',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega desligamento para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      desligarResidente(ctx, residente.id, {
        status: 'DESLIGADO',
        dataSaida: new Date('2026-07-20'),
        motivoSaida: 'Transferência',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})
