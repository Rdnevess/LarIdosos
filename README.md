# Lar de Idosos

Sistema de gestão para uma ILPI (Instituição de Longa Permanência para
Idosos) de pequeno porte — cerca de 30 residentes, equipe pequena, uma
única VPS. Cobre o núcleo cadastral — residentes, responsáveis, grau de
dependência, anotações de acompanhamento, documentos anexados,
funcionários e a trilha de auditoria que a fiscalização sanitária cobra — e
o **prontuário**: cabeçalho clínico, anotações de saúde por turno, sinais
vitais, exames com controle de pendências, consultas, vacinas e linha do
tempo.

Cada medida aferida tem **gráfico de tendência** — sete delas contra a faixa de
normalidade que gera alerta, e o peso, que não tem faixa: 62 kg não é alarmante
nem tranquilizador sem os 68 kg do mês passado, e a tendência é a única forma de
ele dizer alguma coisa.

Cobre também o **controle de medicação**: esquema medicamentoso, mapa do
turno, registro dose a dose e relatório de aderência.

E o **financeiro**: contas bancárias, lançamentos de receita e despesa,
contribuição do residente e a **prestação de contas mensal no formato que o
órgão conveniador exige** — gerada pelo sistema, em `.xlsx` e em PDF, sem
ninguém copiar número de planilha em planilha.

**O `.xlsx` é o que vai ao órgão; o PDF serve ao arquivo interno e à
assinatura física.** Os dois saem do mesmo documento em memória, onde os
totais são calculados uma única vez — é o que impede os dois de divergirem no
dia em que alguém corrigir um cálculo em só um deles. A planilha sai com
**valores, nunca fórmulas**: as fórmulas do modelo são a parte frágil (soma de
faixa fixa, agrupamento por texto literal, um `XLOOKUP` que já aponta para
`#REF!`), e uma planilha entregue com fórmula pode recalcular errado na máquina
de quem a abrir. Há ainda um **CSV para o contador**, com ponto e vírgula e
BOM, porque o escritório dele importa arquivo e não usa o sistema.

Fechar a prestação **congela** os lançamentos realizados da competência, e é o
que impede um lançamento posterior de mudar, em silêncio, um documento já
protocolado. Reabrir exige motivo, e o motivo sai impresso nas observações do
documento regerado.

Cada despesa guarda o documento fiscal e o comprovante de pagamento em PDF, e
cada prestação guarda o extrato bancário. Os três saem como **apêndice da
exportação em PDF** — na ordem da folha de despesas, e pulados em silêncio
quando faltam.

O prontuário vive em rota própria (`/residentes/[id]/prontuario`), fora do
alcance do papel ADMINISTRATIVO. A área `/pendencias` atravessa todos os
residentes e mostra o que está em aberto: exame solicitado e esquecido é o
problema real numa ILPI, e ninguém o percebe abrindo trinta fichas uma a uma.
A tela `/turno` faz o mesmo pelas doses do plantão em curso.

**As doses previstas são derivadas do esquema, não materializadas.** Só o que
aconteceu é gravado. Uma dose que ninguém marcou aparece como **"sem
registro"**, e nunca como "não administrada" — ela pode ter sido dada e apenas
não anotada, e afirmar o contrário gravaria mentira no prontuário. O percentual
de doses sem registro é, ele próprio, o indicador de qualidade que a
coordenação acompanha.

A interface é inteiramente em português do Brasil. Nenhuma exclusão é
física: registros saem de cena por desligamento ou por `ativo = false`, e
toda escrita deixa rastro na trilha de auditoria dentro da mesma
transação que a gravou.

A trilha registra também o que **não** aconteceu: tentativa de acesso
negada por papel entra como `ACESSO_NEGADO`, com a contagem de tentativas
— é o sinal que a LGPD (art. 11) torna relevante para dado de saúde, e o
único que não vem de uma escrita bem-sucedida.

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

### O layout da prestação de contas

`src/modules/financeiro/layout-prestacao.ts` é **arquivo gerado**. Ele vem do
modelo `.xlsx` que o órgão conveniador aceita, guardado em `docs/convenio/` e
fora do controle de versão. Para regerar:

```bash
npx tsx scripts/extrair-layout-prestacao.ts > src/modules/financeiro/layout-prestacao.ts
```

Só saem de lá faixas de célula, larguras de coluna e rótulos fixos — nenhuma
célula da faixa de dados é copiada, e há teste conferindo que nenhum CPF ou
CNPJ escapou. Se esse teste falhar, o conserto é o critério do script, nunca o
teste.

> **Não edite uma migration já aplicada**, nem para corrigir um comentário.
> O Prisma guarda o checksum do arquivo, e `migrate dev` passa a exigir um
> reset do banco de desenvolvimento antes de gerar qualquer migration nova.
> Já aconteceu uma vez neste repositório
> (`20260820213908_documento_funcionario_fk`, no commit 7486196), e o
> contorno foi escrever a migration seguinte à mão e aplicá-la com
> `prisma migrate deploy`, que não confere checksum de migration já
> aplicada. Comentário errado numa migration se corrige na próxima, ou não
> se corrige.

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
npm run auditoria # npm audit --omit=dev: o que de fato vai para o servidor
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
(`tests/e2e/global-setup.ts`) garante os três usuários-semente (papéis
COORDENACAO, SAUDE e ADMINISTRATIVO) e um residente fixo para o perfil
SAUDE agir sobre ele, já que esse papel não pode cadastrar residente. O
login em si é o projeto `setup` (`tests/e2e/auth.setup.ts`), que roda antes
dos demais por `dependencies` no `playwright.config.ts`: autentica nos três
papéis e guarda cada sessão em disco (`.sessao.json`, `.sessao-saude.json`,
`.sessao-administrativo.json`), para os projetos `autenticado`, `saude` e
`administrativo` reaproveitarem sem logar de novo a cada teste.

O terceiro perfil nasceu com a Fase 2A e pelo mesmo motivo que criou o
segundo: o prontuário inteiro é recusado ao ADMINISTRATIVO, e uma fronteira
que nenhum teste atravessa é uma fronteira que ninguém sabe se existe.

Como a suíte E2E não limpa o banco, os usuários que ela cria pelas telas de
usuários e de auditoria vão se acumulando. Para recolhê-los:

```bash
npm run db:limpar-teste              # confere e lista, sem apagar
npm run db:limpar-teste -- --apagar  # apaga
```

Ele só remove quem casa com o padrão de e-mail descartável
(`<palavra>.<epoch>@lar.local`), nunca os três fixos, e **não toca na trilha de
auditoria** — ela é append-only, e apagar linha dela por causa de faxina seria
apagar justamente o que ela existe para guardar.

`npm run typecheck` antes de cada commit.

## Estrutura

```
src/app/(app)/      telas autenticadas; `acoes.ts` são as Server Actions
src/app/api/        entrega de documento anexado, download da prestação,
                    rotas do NextAuth
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
- **`docs/operacao/dependencias.md`** — o dono do número do `npm audit`: o que
  chega ao servidor, o que fica na máquina de quem desenvolve, os `overrides`
  que fixam transitivas e o preço deles.
- **`docs/operacao/pendencias-*.md`** — o que ficou em aberto ao fechar cada
  fase ou travessia, com o estado de cada item e onde ele se resolve. Nenhum
  impede o uso; estão escritos para não dependerem da memória de ninguém. Hoje
  são sete: as Fases 1, 2A, 2B e 3, a identidade visual, as listas e turnos, e
  o alerta de sinal vital.

**Não considere o sistema pronto para uso real antes de configurar e
testar o backup.**
