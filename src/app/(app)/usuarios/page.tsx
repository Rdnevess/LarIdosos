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
              As duas omissões desta linha têm força diferente, e por isso
              deixaram de ser uma condição só.

              **Desativar** continua escondido para a própria conta porque o
              serviço recusa o auto-alvo: `desativarUsuario` lança
              `ErroValidacao` quando `id === ctx.usuarioId`
              (`src/modules/auth/usuarios.service.ts`, linha 138). Esconder o
              botão só poupa um erro previsível — quem barra é o serviço.

              **Definir senha** passa a aparecer também para a própria conta.
              Escondê-la era o que travava o Passo 10 da implantação
              (`docs/operacao/implantacao.md`): com uma única coordenação — a
              situação garantida logo depois do deploy — não havia ninguém
              para trocar a senha dela, e o sistema seguia com a senha que
              veio em texto plano do `.env.producao`.

              O campo "Sua senha atual" é a senha de **quem troca**, não a do
              alvo: `definirSenha` a confere com Argon2 contra o próprio `ctx`
              (`src/modules/auth/usuarios.service.ts`). É o que impede que uma
              tela deixada aberta na mesa da coordenação — a sessão é um JWT de
              12 horas sem timeout de inatividade — valha poder de trocar a
              senha de qualquer conta.
            */}
            {usuario.ativo && (
              <div className="flex flex-wrap gap-2">
                <FormularioSimples
                  acao={acaoDefinirSenha}
                  ocultos={{ id: usuario.id }}
                  colunas={1}
                  // Sem prefixo, os campos `senha` de todas as linhas (e o do
                  // formulário de criação, acima) dividiriam o mesmo `id`.
                  prefixoId={`usuario-${usuario.id}`}
                  rotuloBotao="Definir nova senha"
                  // O aviso é a única pista que o usuário tem: `obterCtx`
                  // recusa qualquer token emitido antes de `senhaAlteradaEm`
                  // (`src/modules/auth/sessao.ts`, linhas 25-27), então a
                  // sessão em curso morre no instante da troca. Correto — e
                  // desconcertante sem aviso. `acaoDefinirSenha` encerra a
                  // sessão explicitamente e leva ao login (ver `acoes.ts`).
                  aviso={
                    usuario.id === ctx.usuarioId
                      ? 'Trocar a própria senha encerra esta sessão: você será levado à tela de login para entrar de novo com a senha nova.'
                      : undefined
                  }
                  campos={[
                    {
                      nome: 'senhaAtual',
                      rotulo: 'Sua senha atual',
                      tipo: 'password',
                      obrigatorio: true,
                    },
                    { nome: 'senha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true },
                  ]}
                />
                {usuario.id !== ctx.usuarioId && (
                  <FormularioSimples
                    acao={acaoDesativarUsuario}
                    ocultos={{ id: usuario.id }}
                    colunas={1}
                    prefixoId={`usuario-${usuario.id}`}
                    rotuloBotao="Desativar acesso"
                    campos={[]}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
