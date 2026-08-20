# Lar de Idosos

Sistema de gestão para uma ILPI (Instituição de Longa Permanência para
Idosos) de pequeno porte — cerca de 30 residentes, equipe pequena, uma
única VPS. Cobre o núcleo cadastral: residentes, responsáveis, grau de
dependência, anotações de acompanhamento, documentos anexados,
funcionários e a trilha de auditoria que a fiscalização sanitária cobra.

A interface é inteiramente em português do Brasil. Nenhuma exclusão é
física: registros saem de cena por desligamento ou por `ativo = false`, e
toda escrita deixa rastro na trilha de auditoria dentro da mesma
transação que a gravou.

**Pilha:** Next.js 15 (App Router, Server Actions), React 19, Prisma,
PostgreSQL 18, NextAuth v5 com credenciais e Argon2, Tailwind CSS 4.

## Pré-requisitos

- **Node 24 LTS** (o `package.json` exige `>=24`)
- **PostgreSQL 18** acessível localmente — dois bancos: um de
  desenvolvimento e um de teste, porque a suíte apaga todas as tabelas
  antes de cada teste
- **npm 11+** (vem com o Node 24)

Para rodar o Postgres em container, há um `docker-compose.dev.yml` no
repositório: só os bancos, não a aplicação. Ele sobe dois — `db` na porta
5432 (desenvolvimento, com volume) e `db_test` na 5433 (teste, em
`tmpfs`, some ao parar o container).

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Subindo em desenvolvimento

```bash
npm install
```

### O gate do `npm approve-scripts`

O npm 11 **não executa scripts de instalação de dependências** sem
aprovação explícita. Sem eles, o `npm install` termina sem erro e o
projeto quebra depois: o motor do Prisma não é baixado e o client não é
gerado, então a primeira consulta ao banco falha.

O `package.json` já traz o campo `allowScripts` com os pacotes
aprovados (`prisma`, `@prisma/client`, `@prisma/engines`, `esbuild`,
`sharp`, `unrs-resolver`), então numa instalação normal nada é preciso.
Se o `npm install` avisar que há scripts pendentes de aprovação — por
exemplo depois de acrescentar uma dependência nova:

```bash
npm approve-scripts            # mostra e permite aprovar os pendentes
npm approve-scripts <pacote>   # aprova um específico
```

Confirme que deu certo com `npx prisma -v`: ele precisa responder sem
reclamar de motor ausente.

### Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://usuario:senha@localhost:5432/lar_dev?schema=public` |
| `AUTH_SECRET` | Qualquer string aleatória: `openssl rand -base64 32` |
| `UPLOADS_DIR` | `./data/uploads` |

Repita num `.env.test`, apontando `DATABASE_URL` para **outro banco**
(`lar_test`) e `UPLOADS_DIR` para `./data/uploads-test`. A suíte trunca
todas as tabelas antes de cada teste: apontá-la para o banco de
desenvolvimento apaga o que estiver lá.

### Banco e usuário inicial

```bash
npm run db:migrate   # aplica as migrations no banco de desenvolvimento
npm run db:seed      # cria o usuário de coordenação
```

O seed lê `SEED_ADMIN_EMAIL` e `SEED_ADMIN_SENHA` do ambiente, caindo em
`coordenacao@lar.local` / `trocar-esta-senha-123` quando não estão
definidos. É idempotente por omissão: se já existe usuário com aquele
e-mail, ele não faz nada — não recria, não redefine a senha.

### Servidor

```bash
npm run dev
```

Abre em http://localhost:3000. Entre com as credenciais do seed.

## Rodando os testes

```bash
npm test          # unidade e integração (Vitest, contra Postgres de verdade)
npm run test:e2e  # ponta a ponta (Playwright, sobe o `npm run dev` sozinho)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
```

Sobre `npm test`: ele aplica as migrations no banco de teste antes de
rodar (`db:migrate:test`) e executa os arquivos **em série**
(`fileParallelism: false`), porque cada teste começa truncando todas as
tabelas — arquivos em paralelo apagariam os dados uns dos outros. Não são
testes com banco simulado: as consultas, as transações e a auditoria
dentro delas rodam contra um Postgres real.

Sobre `npm run test:e2e`: a suíte usa o **banco de desenvolvimento**, não
o de teste, e não o limpa. Ela cria os próprios registros com nomes
carimbados pelo relógio para não colidir entre execuções. O `globalSetup`
(`tests/e2e/global-setup.ts`) garante os dois usuários-semente (papéis
COORDENACAO e SAUDE) e um residente fixo para o perfil SAUDE agir sobre
ele, já que esse papel não pode cadastrar residente. O login em si é o
projeto `setup` (`tests/e2e/auth.setup.ts`), que roda antes dos demais por
`dependencies` no `playwright.config.ts`: autentica nos dois papéis e
guarda cada sessão em disco (`.sessao.json`, `.sessao-saude.json`), para
os projetos `autenticado` e `saude` reaproveitarem sem logar de novo a
cada teste.

`npm run typecheck` antes de cada commit.

## Estrutura

```
src/app/(app)/      telas autenticadas; `acoes.ts` são as Server Actions
src/app/api/        entrega de documento anexado, rotas do NextAuth
src/components/     formulários e campos compartilhados
src/lib/            contexto, erros, senha, conversão de FormData, pt-BR
src/modules/        regras de negócio, uma pasta por área
prisma/             schema, migrations e seed
tests/e2e/          Playwright
docs/operacao/      implantação e backup
```

A autorização vive nos serviços de `src/modules/`, nunca só na tela.
Cada função de serviço exportada checa o papel — em geral logo na
primeira linha, com `exigirPapel`; nos casos em que a permissão depende
do próprio registro (documentos, por exemplo), depois de carregá-lo, com
`papeisQuePodemVer`. O projeto exige, para cada uma delas, um teste de
negação provando que um papel sem permissão recebe `ErroPermissao`. As
telas escondem botões apenas para poupar ao usuário um erro previsível —
quem recusa é sempre o serviço.

## Operação

O sistema roda numa VPS própria, com Docker e volumes nomeados — não em
plataforma serverless. Os documentos anexados ficam num volume
(`lar_uploads`), não num bucket, e o banco em `lar_pgdata`.

- **`docs/operacao/implantacao.md`** — implantação do zero na VPS
  (DNS, firewall, Docker, HTTPS pelo Caddy), atualização, rotação de log
  e os problemas comuns.
- **`docs/operacao/backup.md`** — backup criptografado, envio para
  armazenamento remoto, alerta de falha e o procedimento de restauração.

**Não considere o sistema pronto para uso real antes de configurar e
testar o backup.**
