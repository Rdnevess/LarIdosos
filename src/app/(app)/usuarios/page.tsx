import type { Papel } from '@prisma/client'
import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { FormularioSimples } from '@/components/formulario-simples'
import { formatarDataHora } from '@/lib/ptbr'
import {
  acaoCriarUsuario,
  acaoAtualizarUsuario,
  acaoDefinirSenha,
  acaoDesativarUsuario,
} from './acoes'

// Tipado contra o enum do Prisma de propósito: um papel novo no schema quebra
// o typecheck aqui, em vez de vazar cru para a tela. Mesmo padrão de
// `ROTULO_VINCULO` em `formulario-funcionario.tsx`.
const ROTULO_PAPEL: Record<Papel, string> = {
  COORDENACAO: 'Coordenação',
  SAUDE: 'Saúde',
  ADMINISTRATIVO: 'Administrativo',
}

// Derivado do rótulo em vez de repetido: os dois formulários desta tela — criar
// e editar — oferecem os mesmos papéis, e duas listas escritas à mão
// divergiriam no dia em que um papel novo entrasse no enum.
const OPCOES_PAPEL = (Object.keys(ROTULO_PAPEL) as Papel[]).map((papel) => ({
  valor: papel,
  rotulo: ROTULO_PAPEL[papel],
}))

export default async function PaginaUsuarios() {
  const ctx = await obterCtx()
  const usuarios = await listarUsuarios(ctx)

  return (
    <section className="space-y-6">
      <h1 className="text-lg font-semibold text-forte">Usuários</h1>

      {/* Região nomeada porque a lista abaixo passou a ter um formulário de
          edição por linha, com os mesmos rótulos "Nome" e "Papel". Sem o nome
          acessível, nem o leitor de tela nem o teste conseguem dizer de qual
          formulário se está falando. */}
      <section aria-labelledby="titulo-novo-usuario" className="rounded border bg-superficie p-4">
        <h2 id="titulo-novo-usuario" className="mb-3 font-medium text-forte">
          Novo usuário
        </h2>
        <FormularioSimples
          acao={acaoCriarUsuario}
          rotuloBotao="Criar usuário"
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
            { nome: 'papel', rotulo: 'Papel', obrigatorio: true, opcoes: OPCOES_PAPEL },
            {
              nome: 'senha',
              rotulo: 'Senha inicial (mínimo 8 caracteres)',
              tipo: 'password',
              obrigatorio: true,
            },
          ]}
        />
      </section>

      <ul className="divide-y rounded border bg-superficie">
        {usuarios.map((usuario) => (
          <li key={usuario.id} className="space-y-2 p-3">
            <div>
              <span className="block font-medium text-forte">
                {usuario.nome} {!usuario.ativo && '(inativo)'}
              </span>
              <span className="block text-sm text-apoio">
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
              <details>
                <summary className="cursor-pointer text-sm text-medio underline">
                  Editar
                </summary>
                <div className="mt-2">
                  <FormularioSimples
                    acao={acaoAtualizarUsuario}
                    ocultos={{ id: usuario.id }}
                    prefixoId={`editar-usuario-${usuario.id}`}
                    rotuloBotao="Salvar usuário"
                    campos={[
                      {
                        nome: 'nome',
                        rotulo: 'Nome',
                        obrigatorio: true,
                        valorInicial: usuario.nome,
                      },
                      // O seletor de papel some na própria linha. Rebaixar a
                      // única conta de coordenação deixaria o sistema sem
                      // ninguém capaz de abrir esta tela, e sem caminho de
                      // volta que não fosse o banco. `atualizarUsuario` recusa
                      // a troca; omitir o campo poupa o erro previsível — e
                      // campo ausente do formulário não vira chave, então o
                      // papel simplesmente não é tocado.
                      ...(usuario.id === ctx.usuarioId
                        ? []
                        : [
                            {
                              nome: 'papel',
                              rotulo: 'Papel',
                              obrigatorio: true,
                              valorInicial: usuario.papel,
                              opcoes: OPCOES_PAPEL,
                            },
                          ]),
                    ]}
                  />
                </div>
              </details>
            )}

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
