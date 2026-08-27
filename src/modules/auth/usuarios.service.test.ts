import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { verificarSenha } from '@/lib/senha'
import {
  criarUsuarioDeTeste,
  ctxDe,
  ctxComPapel,
  SENHA_DE_TESTE,
} from '@/../tests/helpers/fabricas'
import {
  criarUsuario,
  listarUsuarios,
  consultarUsuarios,
  atualizarUsuario,
  definirSenha,
  desativarUsuario,
} from './usuarios.service'

const dadosValidos = {
  email: 'novo@lar.local',
  nome: 'Nova Pessoa',
  papel: 'SAUDE' as const,
  senha: 'senha-inicial-123',
}

describe('criarUsuario', () => {
  it('cria o usuário e registra auditoria', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    const criado = await criarUsuario(ctx, dadosValidos)

    expect(criado.email).toBe('novo@lar.local')
    expect(criado.papel).toBe('SAUDE')
    expect(criado).not.toHaveProperty('senhaHash')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Usuario', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(criado.id)
  })

  it('normaliza o e-mail para minúsculas e sem espaços', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const criado = await criarUsuario(ctx, { ...dadosValidos, email: '  NOVO@Lar.Local ' })
    expect(criado.email).toBe('novo@lar.local')
  })

  it('recusa e-mail já cadastrado', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, dadosValidos)

    await expect(criarUsuario(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('recusa senha com menos de 8 caracteres', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await expect(
      criarUsuario(ctx, { ...dadosValidos, senha: '1234567' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nunca grava a senha em texto puro', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const criado = await criarUsuario(ctx, dadosValidos)

    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: criado.id } })
    expect(registro.senhaHash).not.toContain('senha-inicial-123')
    expect(await verificarSenha(registro.senhaHash, 'senha-inicial-123')).toBe(true)
  })

  it('nega para SAUDE e para ADMINISTRATIVO', async () => {
    for (const papel of ['SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      await expect(criarUsuario(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
    }
  })
})

describe('listarUsuarios', () => {
  it('lista sem expor o hash da senha', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, dadosValidos)

    const lista = await listarUsuarios(ctx)

    expect(lista.length).toBeGreaterThan(0)
    for (const usuario of lista) {
      expect(usuario).not.toHaveProperty('senhaHash')
    }
  })

  it('nega para papel não autorizado', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarUsuarios(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarUsuario', () => {
  it('registra no diff apenas os campos alterados', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await atualizarUsuario(ctx, alvo.id, { nome: 'Nome Corrigido', papel: 'SAUDE' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Usuario', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({ nome: { de: 'Nova Pessoa', para: 'Nome Corrigido' } })
  })

  it('recusa trocar o proprio papel, que trancaria a coordenacao fora da tela', async () => {
    // `desativarUsuario` ja recusa o auto-alvo, e aqui a consequencia e pior:
    // a unica conta de coordenacao — a situacao garantida logo depois da
    // implantacao — que se rebaixasse a SAUDE deixaria o sistema sem ninguem
    // capaz de abrir /usuarios, e sem caminho de volta pela tela.
    const ctx = await ctxComPapel('COORDENACAO')

    await expect(
      atualizarUsuario(ctx, ctx.usuarioId, { papel: 'SAUDE' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita o proprio papel reenviado sem mudanca, junto do nome corrigido', async () => {
    // O formulario de edicao manda todos os campos, sempre. Se a recusa
    // olhasse so para a presenca do campo, corrigir o proprio nome seria
    // impossivel — a recusa e da MUDANCA de papel, nao do campo.
    const ctx = await ctxComPapel('COORDENACAO')

    const atualizado = await atualizarUsuario(ctx, ctx.usuarioId, {
      nome: 'Nome Corrigido',
      papel: 'COORDENACAO',
    })

    expect(atualizado.nome).toBe('Nome Corrigido')
    expect(atualizado.papel).toBe('COORDENACAO')
  })

  it('nega para papel não autorizado', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      atualizarUsuario(ctx, alvo.id, { nome: 'Tentativa' })
    ).rejects.toThrow(ErroPermissao)
  })

  it('nunca inclui senhaHash no diff da auditoria', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456', SENHA_DE_TESTE)

    const logs = await prisma.logAuditoria.findMany({ where: { entidadeId: alvo.id } })
    for (const log of logs) {
      expect(JSON.stringify(log.diff ?? {})).not.toContain('senhaHash')
      expect(JSON.stringify(log.diff ?? {})).not.toContain('outra-senha-forte-456')
    }
  })
})

describe('definirSenha', () => {
  it('troca a senha e atualiza senhaAlteradaEm', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })

    await new Promise((r) => setTimeout(r, 5))
    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456', SENHA_DE_TESTE)

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(await verificarSenha(depois.senhaHash, 'outra-senha-forte-456')).toBe(true)
    expect(depois.senhaAlteradaEm.getTime()).toBeGreaterThan(antes.senhaAlteradaEm.getTime())
  })

  it('nega para papel não autorizado', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(admin, dadosValidos)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      definirSenha(ctx, alvo.id, 'outra-senha-forte-456', SENHA_DE_TESTE)
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa quem nao sabe a propria senha, e deixa a do alvo intacta', async () => {
    // Uma sessao dura 12 horas sem timeout de inatividade. Sem esta
    // conferencia, quem senta na mesa da coordenacao com a tela aberta define
    // a senha de qualquer conta — inclusive uma do papel SAUDE, que enxerga
    // evolucao clinica e laudo de grau de dependencia.
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await expect(
      definirSenha(ctx, alvo.id, 'outra-senha-forte-456', 'chute-errado')
    ).rejects.toThrow(ErroValidacao)

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(await verificarSenha(depois.senhaHash, dadosValidos.senha)).toBe(true)
  })

  it('confere a senha de quem troca, nao a do alvo', async () => {
    // O alvo foi criado com `dadosValidos.senha`, e passa-la aqui tem de
    // falhar: se a conferencia olhasse para a conta alvo, saber a senha
    // inicial dela — que aparece em texto plano na tela de criacao — bastaria
    // para troca-la.
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await expect(
      definirSenha(ctx, alvo.id, 'outra-senha-forte-456', dadosValidos.senha)
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('desativarUsuario', () => {
  it('marca como inativo sem apagar o registro', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await desativarUsuario(ctx, alvo.id)

    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(registro.ativo).toBe(false)
  })

  it('impede o usuário de desativar a si mesmo', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'COORDENACAO' })
    const ctx = ctxDe(usuario)

    await expect(desativarUsuario(ctx, usuario.id)).rejects.toThrow(ErroValidacao)
  })

  it('registra na auditoria o estado anterior real, não um valor presumido', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await desativarUsuario(ctx, alvo.id)
    await desativarUsuario(ctx, alvo.id)

    const logs = await prisma.logAuditoria.findMany({
      where: { entidade: 'Usuario', entidadeId: alvo.id, acao: 'ATUALIZAR' },
      orderBy: { criadoEm: 'asc' },
    })

    expect(logs[0].diff).toEqual({ ativo: { de: true, para: false } })
    expect(logs[1].diff).toEqual({ ativo: { de: false, para: false } })
  })

  it('nega para papel não autorizado', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(desativarUsuario(ctx, alvo.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('consultarUsuarios', () => {
  it('acha o nome acentuado por quem digita sem acento, e o contrário', async () => {
    // Mesma regra dos residentes e funcionários: a coluna `busca` é gerada
    // pelo banco sem acento, e o termo passa pela mesma normalização. Sem
    // isso, procurar "conceicao" não acharia "Conceição" — e o sistema teria
    // duas respostas diferentes para "como se procura um nome aqui".
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, { ...dadosValidos, nome: 'Maria Conceição', email: 'mc@lar.local' })
    await criarUsuario(ctx, { ...dadosValidos, nome: 'Joao Antonio', email: 'ja@lar.local' })

    expect((await consultarUsuarios(ctx, { nome: 'conceicao' })).itens).toHaveLength(1)
    expect((await consultarUsuarios(ctx, { nome: 'João' })).itens).toHaveLength(1)
  })

  it('acha também pelo e-mail, que é como a coordenação identifica a conta', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, { ...dadosValidos, nome: 'Ana Paula', email: 'ana.paula@lar.local' })

    expect((await consultarUsuarios(ctx, { nome: 'ana.paula@' })).itens).toHaveLength(1)
  })

  it('filtra por papel', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, { ...dadosValidos, papel: 'SAUDE', email: 's@lar.local' })
    await criarUsuario(ctx, { ...dadosValidos, papel: 'ADMINISTRATIVO', email: 'a@lar.local' })

    const saude = await consultarUsuarios(ctx, { papel: 'SAUDE' })
    expect(saude.itens.every((u) => u.papel === 'SAUDE')).toBe(true)
    expect(saude.itens.map((u) => u.email)).toContain('s@lar.local')
    expect(saude.itens.map((u) => u.email)).not.toContain('a@lar.local')
  })

  it('combina nome e papel, em vez de escolher um dos dois', async () => {
    // O caso que um `OR` acidental deixaria passar: com os dois filtros, quem
    // bate só no nome não pode entrar.
    const ctx = await ctxComPapel('COORDENACAO')
    await criarUsuario(ctx, { ...dadosValidos, nome: 'Rita Souza', papel: 'SAUDE', email: 'rs@lar.local' })
    await criarUsuario(ctx, { ...dadosValidos, nome: 'Rita Alves', papel: 'ADMINISTRATIVO', email: 'ra@lar.local' })

    const achados = await consultarUsuarios(ctx, { nome: 'rita', papel: 'SAUDE' })

    expect(achados.itens.map((u) => u.email)).toEqual(['rs@lar.local'])
    expect(achados.total).toBe(1)
  })

  it('pagina, e conta com o filtro aplicado', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    for (let i = 0; i < 22; i++) {
      await criarUsuario(ctx, {
        ...dadosValidos,
        nome: `Pessoa ${String(i).padStart(3, '0')}`,
        email: `p${i}@lar.local`,
        papel: 'SAUDE',
      })
    }

    const primeira = await consultarUsuarios(ctx, { papel: 'SAUDE', pagina: 1, por: 20 })
    const segunda = await consultarUsuarios(ctx, { papel: 'SAUDE', pagina: 2, por: 20 })

    expect(primeira.itens).toHaveLength(20)
    expect(primeira.total).toBe(22)
    expect(primeira.paginas).toBe(2)
    expect(segunda.itens).toHaveLength(2)
    const ids = [...primeira.itens, ...segunda.itens].map((u) => u.id)
    expect(new Set(ids).size, 'houve repetição entre as páginas').toBe(22)
  })

  it('nega a leitura a quem não é coordenação', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(consultarUsuarios(ctx, {})).rejects.toThrow(ErroPermissao)
  })
})
