import type { Papel } from '@prisma/client'
import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { FormularioSimples } from '@/components/formulario-simples'
import { formatarDataHora } from '@/lib/ptbr'
import { acaoCriarUsuario, acaoDefinirSenha, acaoDesativarUsuario } from './acoes'

// Tipado contra o enum do Prisma de propósito: um papel novo no schema quebra
// o typecheck aqui, em vez de vazar cru para a tela. Mesmo padrão de
// `ROTULO_VINCULO` em `formulario-funcionario.tsx`.
const ROTULO_PAPEL: Record<Papel, string> = {
  COORDENACAO: 'Coordenação',
  SAUDE: 'Saúde',
  ADMINISTRATIVO: 'Administrativo',
}

export default async function PaginaUsuarios() {
  const ctx = await obterCtx()
  const usuarios = await listarUsuarios(ctx)

  return (
    <section className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Usuários</h1>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-800">Novo usuário</h2>
        <FormularioSimples
          acao={acaoCriarUsuario}
          rotuloBotao="Criar usuário"
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
            {
              nome: 'papel',
              rotulo: 'Papel',
              obrigatorio: true,
              opcoes: [
                { valor: 'COORDENACAO', rotulo: 'Coordenação' },
                { valor: 'SAUDE', rotulo: 'Saúde' },
                { valor: 'ADMINISTRATIVO', rotulo: 'Administrativo' },
              ],
            },
            {
              nome: 'senha',
              rotulo: 'Senha inicial (mínimo 8 caracteres)',
              tipo: 'password',
              obrigatorio: true,
            },
          ]}
        />
      </div>

      <ul className="divide-y rounded border bg-white">
        {usuarios.map((usuario) => (
          <li key={usuario.id} className="space-y-2 p-3">
            <div>
              <span className="block font-medium text-slate-800">
                {usuario.nome} {!usuario.ativo && '(inativo)'}
              </span>
              <span className="block text-sm text-slate-500">
                {usuario.email} · {ROTULO_PAPEL[usuario.papel]} · último acesso:{' '}
                {usuario.ultimoAcessoEm ? formatarDataHora(usuario.ultimoAcessoEm) : 'nunca'}
              </span>
            </div>

            {/*
              A própria conta não exibe os botões de desativar e trocar senha.
              As duas omissões têm força diferente: `desativarUsuario` recusa
              o auto-alvo no serviço (Tarefa 6, `ErroValidacao`), então
              esconder o botão só evita um erro previsível. `definirSenha`
              não tem essa guarda — ela é omitida da tela por decisão de
              interface, não por barreira do serviço.

              Isso é deliberado: com uma única coordenação, uma guarda de
              auto-alvo deixaria a pessoa sem como trocar a própria senha. O
              caminho correto — uma tela "alterar minha senha" que exija a
              senha atual — fica registrado para uma fase futura. Até lá,
              quem controla a sessão da coordenação consegue trocar a senha
              dela sem conhecer a anterior.
            */}
            {usuario.ativo && usuario.id !== ctx.usuarioId && (
              <div className="flex flex-wrap gap-2">
                <FormularioSimples
                  acao={acaoDefinirSenha}
                  ocultos={{ id: usuario.id }}
                  colunas={1}
                  rotuloBotao="Definir nova senha"
                  campos={[
                    { nome: 'senha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true },
                  ]}
                />
                <FormularioSimples
                  acao={acaoDesativarUsuario}
                  ocultos={{ id: usuario.id }}
                  colunas={1}
                  rotuloBotao="Desativar acesso"
                  campos={[]}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
