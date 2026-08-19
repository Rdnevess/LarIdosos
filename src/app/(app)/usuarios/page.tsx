import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { FormularioSimples } from '@/components/formulario-simples'
import { formatarDataHora } from '@/lib/ptbr'
import { acaoCriarUsuario, acaoDefinirSenha, acaoDesativarUsuario } from './acoes'

const ROTULO_PAPEL = {
  COORDENACAO: 'Coordenação',
  SAUDE: 'Saúde',
  ADMINISTRATIVO: 'Administrativo',
} as const

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
              A própria conta não exibe os botões de desativar e trocar senha:
              `desativarUsuario` já recusa a auto-desativação (`ErroValidacao`
              na camada de serviço), mas esconder aqui evita o erro previsível
              em vez de deixar quem está logado descobrir clicando.
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
