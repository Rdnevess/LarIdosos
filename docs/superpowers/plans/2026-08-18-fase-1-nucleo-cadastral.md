# Fase 1 — Núcleo Cadastral: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o núcleo cadastral do sistema do Lar de Idosos — autenticação com três papéis, cadastro de residentes com histórico de grau de dependência, responsáveis, documentos anexos, anotações gerais, cadastro de funcionários e trilha de auditoria — implantável em VPS com backup verificado.

**Architecture:** Monolito Next.js 15 (App Router) com camada de serviço separada das Server Actions. Toda regra de negócio e toda verificação de permissão vivem em funções `(ctx, dados)` testáveis sem HTTP; as Server Actions apenas autenticam, validam com Zod e delegam. Persistência em PostgreSQL via Prisma. Arquivos em volume local, servidos só por rota autenticada.

**Tech Stack:** Next.js 15, TypeScript, React Server Components, Prisma 6, PostgreSQL 18, Auth.js v5 (NextAuth), Zod 3, Tailwind CSS + shadcn/ui, Vitest 2 (contra Postgres real), Playwright, Docker Compose + Caddy.

**Spec:** `docs/superpowers/specs/2026-08-18-lar-idosos-design.md`

## Global Constraints

- **Node.js 24 LTS**; PostgreSQL **18**.
- **Interface inteira em pt-BR.** Nenhum texto de interface em inglês. Datas em `dd/mm/aaaa`, moeda em `R$ 0.000,00`.
- **Nomes de domínio em português** (`Residente`, `Funcionario`, `criarResidente`). Nomes de framework permanecem como o framework exige.
- **Exclusão é sempre lógica** (spec R1). Nenhum serviço executa `delete` em entidade de domínio.
- **Permissão verificada na camada de serviço** (spec R11), nunca apenas na interface. Cada recusa tem teste.
- **Chaves primárias em CUID** (`@default(cuid())`), expostas nas URLs. Nenhum inteiro sequencial em rota.
- **Toda escrita gera registro em `LogAuditoria`**; leitura de dado sensível também (spec R12).
- **Testes rodam contra PostgreSQL real**, nunca SQLite.
- TDD obrigatório: o teste é escrito e falha antes da implementação.
- **Antes de cada commit, rode `npm run typecheck` além dos testes.** O Vitest transpila com esbuild, que remove as anotações de tipo sem verificá-las: uma suíte inteiramente verde convive com código que não compila, e o `next build` só descobre isso muito depois, quando achar a origem já custa caro.
- Commits em português, no imperativo ("Adiciona serviço de residentes").

---

## Estrutura de arquivos

```
prisma/
  schema.prisma                     modelo de dados único
  migrations/                       migrations versionadas
  seed.ts                           usuário inicial de coordenação
src/
  lib/
    prisma.ts                       singleton do PrismaClient
    senha.ts                        hash e verificação (Argon2id)
    ptbr.ts                         validação de CPF/CNPJ, formatação
    erros.ts                        ErroPermissao, ErroValidacao, ErroNaoEncontrado
    contexto.ts                     tipo Ctx e exigirPapel
    arquivos.ts                     gravação e leitura no volume de uploads
  modules/
    auth/
      config.ts                     configuração do Auth.js
      sessao.ts                     obterCtx() a partir da sessão
      usuarios.service.ts           CRUD de usuários
      usuarios.schema.ts            schemas Zod
    audit/
      auditoria.service.ts          registrarAuditoria, calcularDiff
      auditoria.consulta.ts         consulta paginada da trilha
    residents/
      residentes.service.ts         CRUD de residentes
      residentes.schema.ts
      dependencia.service.ts        avaliações e grau vigente
      responsaveis.service.ts
      documentos.service.ts         anexos de residente e funcionário
      anotacoes.service.ts          anotações gerais
    staff/
      funcionarios.service.ts
      funcionarios.schema.ts
  app/
    login/page.tsx
    (app)/
      layout.tsx                    layout autenticado com navegação por papel
      residentes/                   lista, ficha, formulário
      funcionarios/
      usuarios/
      auditoria/
    api/
      auth/[...nextauth]/route.ts
      documentos/[id]/route.ts      download autenticado
tests/
  helpers/banco.ts                  limpeza entre testes
  helpers/setup.ts                  hooks globais do Vitest
  helpers/fabricas.ts               construtores de dados de teste
  e2e/                              Playwright
scripts/
  backup.sh
  restaurar.sh
docker-compose.dev.yml              bancos de desenvolvimento e teste
docker-compose.yml                  produção: app + db + caddy
Dockerfile
Caddyfile
```

Um arquivo de serviço por agregado, não por camada técnica: o que muda junto fica junto. Serviços não importam nada de `app/` — a dependência é sempre de fora para dentro.

---

### Task 1: Fundação do projeto e ambiente de teste

Entrega o esqueleto executável: projeto Next.js, banco em container, Prisma migrado e um teste que grava e lê no PostgreSQL real.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env`, `.env.test`, `.env.example`
- Create: `docker-compose.dev.yml`
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Create: `vitest.config.ts`
- Create: `tests/helpers/banco.ts`, `tests/helpers/setup.ts`
- Test: `tests/fundacao.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `prisma` (instância `PrismaClient` de `src/lib/prisma.ts`); modelo `Usuario` e enum `Papel`; helper de teste `limparBanco(): Promise<void>`

- [ ] **Step 1: Criar o projeto Next.js**

```bash
cd D:/Dev/LarIdosos
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --yes
```

**Use `@15`, não `@latest`.** Todo o código deste plano é escrito para as APIs do Next 15, Prisma 6, Zod 3 e Vitest 2. Uma tentativa anterior com `@latest` trouxe Next 16 / Prisma 7 / Zod 4 / Vitest 4, e o Prisma 7 rejeitou o `schema.prisma` deste plano de saída (`P1012`: `datasource url` deixou de ser suportado).

O diretório **não está vazio** — já contém `.git/`, `.gitignore` e `docs/`. O `--yes` evita que o comando fique preso em prompt interativo. Depois de rodar, confirme com `git status` que `docs/` continua intacto e que o `.gitignore` versionado não foi substituído pelo padrão do Next; se foi, restaure-o com `git checkout .gitignore` e acrescente ao final as linhas que o Next precisa (`.next/`, `next-env.d.ts`).

- [ ] **Step 2: Instalar dependências**

```bash
npm install @prisma/client@^6 zod@^3 @node-rs/argon2@^2 next-auth@beta
npm install -D prisma@^6 vitest@^2 vite-tsconfig-paths@^5 dotenv-cli @playwright/test tsx
```

Depois de instalar, **fixe a versão exata do `next-auth`** no `package.json` (troque `^5.0.0-beta.NN` por `5.0.0-beta.NN`, sem o acento circunflexo) e rode `npm install` de novo. É a única dependência ainda em beta do projeto: deixá-la com faixa aberta significa que um `npm install` daqui a três meses pode trazer uma API diferente para o módulo de autenticação, sem ninguém pedir.

Confira com `npm ls next prisma zod vitest` que as versões maiores são 15, 6, 3 e 2 antes de seguir. O `vite-tsconfig-paths` fica em `^5` por compatibilidade com o Vitest 2 — o Step 10 não precisa instalá-lo de novo.

- [ ] **Step 3: Preparar os bancos de desenvolvimento e de teste**

Dois caminhos, conforme a máquina. **Nesta máquina o caminho é o A** — não há Docker instalado, e há um PostgreSQL 18 nativo rodando como serviço (`postgresql-x64-18`).

**Caminho A — PostgreSQL nativo (esta máquina).** Os bancos `lar_dev` e `lar_test`, e o usuário `lar` dono de ambos, já foram criados pelo controlador antes desta tarefa. Confirme que existem e que você consegue conectar:

```bash
PGPASSWORD=<senha do usuário lar> "/c/Program Files/PostgreSQL/18/bin/psql.exe" \
  -U lar -h localhost -p 5432 -d lar_dev -c "select current_database(), current_user;"
```

Esperado: uma linha com `lar_dev | lar`. Repita com `-d lar_test`. Se algum banco faltar, **pare e reporte NEEDS_CONTEXT** — criar banco exige credencial de superusuário, que você não tem.

**Caminho B — Docker (outras máquinas).** Crie `docker-compose.dev.yml` e suba os dois containers. O arquivo fica versionado de qualquer forma, para quem clonar o projeto em uma máquina com Docker:

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: lar
      POSTGRES_PASSWORD: lar
      POSTGRES_DB: lar_dev
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data

  db_test:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: lar
      POSTGRES_PASSWORD: lar
      POSTGRES_DB: lar_test
    ports: ["5433:5432"]
    tmpfs:
      - /var/lib/postgresql/data

volumes:
  pgdata:
```

O banco de teste usa `tmpfs`: fica em memória, some ao parar o container e roda mais rápido. Não há dado de teste que valha persistir.

```bash
docker compose -f docker-compose.dev.yml up -d
```

No caminho B as portas são 5432 (dev) e 5433 (teste); no caminho A ambos os bancos vivem no mesmo servidor na porta 5432, separados por nome. É por isso que o `.env` e o `.env.test` do próximo passo diferem no **nome do banco**, e não apenas na porta.

- [ ] **Step 4: Configurar variáveis de ambiente**

**Caminho A (esta máquina)** — o controlador já escreveu `.env` e `.env.test` com a senha real do usuário `lar`. Confira que existem e que apontam para `lar_dev` e `lar_test` respectivamente, ambos na porta 5432. Não sobrescreva esses arquivos.

Formato do `.env`:

```
DATABASE_URL="postgresql://lar:<senha>@localhost:5432/lar_dev?schema=public"
AUTH_SECRET="troque-por-um-valor-aleatorio-em-producao"
UPLOADS_DIR="./data/uploads"
```

Formato do `.env.test`:

```
DATABASE_URL="postgresql://lar:<senha>@localhost:5432/lar_test?schema=public"
AUTH_SECRET="segredo-de-teste"
UPLOADS_DIR="./data/uploads-test"
```

**Caminho B (Docker)** — mesmos arquivos, com `lar:lar` como credencial e o banco de teste na porta 5433.

`.env.example` recebe as mesmas chaves com valores vazios — é o que vai para o git. `.env` e `.env.test` já estão cobertos pelo `.gitignore`.

- [ ] **Step 5: Definir o schema inicial do Prisma**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Papel {
  COORDENACAO
  SAUDE
  ADMINISTRATIVO
}

model Usuario {
  id             String    @id @default(cuid())
  email          String    @unique
  senhaHash      String
  nome           String
  papel          Papel
  ativo          Boolean   @default(true)
  funcionarioId  String?   @unique
  ultimoAcessoEm DateTime?
  senhaAlteradaEm DateTime @default(now())
  criadoEm       DateTime  @default(now())
  atualizadoEm   DateTime  @updatedAt
  criadoPorId    String?

  @@map("usuarios")
}
```

- [ ] **Step 6: Criar o singleton do Prisma**

`src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

O singleton existe porque o hot reload do Next.js recria módulos a cada alteração; sem ele, o pool de conexões cresce até o Postgres recusar novas conexões.

- [ ] **Step 7: Adicionar os scripts ao `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:migrate": "prisma migrate dev",
    "db:migrate:test": "dotenv -e .env.test -- prisma migrate deploy",
    "typecheck": "tsc --noEmit",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "test": "npm run db:migrate:test && dotenv -e .env.test -- vitest run",
    "test:watch": "dotenv -e .env.test -- vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 8: Aplicar a migration inicial**

```bash
npm run db:migrate -- --name inicial
npm run db:migrate:test
```

Esperado: a tabela `usuarios` existe nos dois bancos.

- [ ] **Step 9: Escrever os helpers de teste**

`tests/helpers/banco.ts`:

```typescript
import { prisma } from '@/lib/prisma'

export { prisma }

export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `

  if (tabelas.length === 0) return

  const lista = tabelas.map((t) => `"public"."${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`
  )
}
```

`tests/helpers/setup.ts`:

```typescript
import { beforeEach, afterAll } from 'vitest'
import { limparBanco, prisma } from './banco'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

- [ ] **Step 10: Configurar o Vitest**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/setup.ts'],
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
```

```bash
npm install -D vite-tsconfig-paths
```

`fileParallelism: false` é obrigatório: os arquivos de teste compartilham um único banco e o `TRUNCATE` de um apagaria os dados de outro rodando em paralelo.

- [ ] **Step 11: Escrever o teste de fundação (deve falhar)**

`tests/fundacao.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from './helpers/banco'

describe('fundação', () => {
  it('conecta ao PostgreSQL e persiste um usuário', async () => {
    const criado = await prisma.usuario.create({
      data: {
        email: 'coordenacao@lar.local',
        senhaHash: 'hash-fake',
        nome: 'Coordenação',
        papel: 'COORDENACAO',
      },
    })

    const lido = await prisma.usuario.findUnique({ where: { id: criado.id } })

    expect(lido?.email).toBe('coordenacao@lar.local')
    expect(lido?.ativo).toBe(true)
    expect(lido?.id).toMatch(/^c[a-z0-9]{20,}$/)
  })

  it('limpa o banco entre os testes', async () => {
    const total = await prisma.usuario.count()
    expect(total).toBe(0)
  })
})
```

O segundo teste é o que prova que o `limparBanco` funciona — sem ele, o primeiro teste passaria mesmo com isolamento quebrado, e os testes seguintes falhariam de forma confusa.

- [ ] **Step 12: Rodar o teste**

Run: `npm test`
Expected: PASS nos dois testes. Se o `docker compose` não estiver de pé, falha com erro de conexão — suba os containers antes.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Adiciona fundação do projeto com Next.js, Prisma e testes contra Postgres"
```

---

### Task 2: Utilitários de localização pt-BR

Validação de CPF e CNPJ com dígito verificador e formatação brasileira. Usado por residentes (Task 8), funcionários (Task 13) e, na Fase 3, pelo financeiro.

**Files:**
- Create: `src/lib/ptbr.ts`
- Test: `src/lib/ptbr.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `validarCpf(valor: string): boolean`, `validarCnpj(valor: string): boolean`, `somenteDigitos(valor: string): string`, `formatarCpf(valor: string): string`, `formatarData(data: Date): string` (campos `@db.Date`, formata em UTC), `formatarDataHora(data: Date): string` (instantes, formata em America/Sao_Paulo), `formatarMoeda(valor: number): string`

- [ ] **Step 1: Escrever os testes (devem falhar)**

`src/lib/ptbr.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  validarCpf,
  validarCnpj,
  somenteDigitos,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarMoeda,
} from './ptbr'

describe('validarCpf', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true)
    expect(validarCpf('52998224725')).toBe(true)
  })

  it('rejeita CPF com dígito verificador errado', () => {
    expect(validarCpf('529.982.247-26')).toBe(false)
  })

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCpf('111.111.111-11')).toBe(false)
    expect(validarCpf('00000000000')).toBe(false)
  })

  it('rejeita CPF com tamanho errado', () => {
    expect(validarCpf('1234567890')).toBe(false)
    expect(validarCpf('')).toBe(false)
  })
})

describe('validarCnpj', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('rejeita CNPJ inválido', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false)
    expect(validarCnpj('11111111111111')).toBe(false)
  })
})

describe('formatação', () => {
  it('formata CPF com máscara', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
  })

  it('remove tudo que não é dígito', () => {
    expect(somenteDigitos('529.982.247-25')).toBe('52998224725')
  })

  it('formata data pura no padrão brasileiro', () => {
    expect(formatarData(new Date('2026-08-18T00:00:00Z'))).toBe('18/08/2026')
    expect(formatarData(new Date('2026-01-01T00:00:00Z'))).toBe('01/01/2026')
  })

  it('formata data pura sem depender do fuso do processo', () => {
    const tzOriginal = process.env.TZ
    try {
      process.env.TZ = 'UTC'
      expect(formatarData(new Date('2026-08-18T00:00:00Z'))).toBe('18/08/2026')
      process.env.TZ = 'Pacific/Kiritimati'
      expect(formatarData(new Date('2026-08-18T00:00:00Z'))).toBe('18/08/2026')
    } finally {
      process.env.TZ = tzOriginal
    }
  })

  it('formata data e hora no fuso de São Paulo', () => {
    expect(formatarDataHora(new Date('2026-08-18T14:30:00Z'))).toBe('18/08/2026 11:30')
  })

  it('formata moeda em real', () => {
    expect(formatarMoeda(1234.5)).toBe('R$ 1.234,50')
    expect(formatarMoeda(0)).toBe('R$ 0,00')
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `npm test -- src/lib/ptbr.test.ts`
Expected: FAIL — `Failed to resolve import "./ptbr"`

- [ ] **Step 3: Implementar**

`src/lib/ptbr.ts`:

```typescript
export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function validarCpf(valor: string): boolean {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const calcularDigito = (ate: number): number => {
    let soma = 0
    let peso = ate + 1
    for (let i = 0; i < ate; i++) {
      soma += Number(cpf[i]) * peso--
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10])
}

export function validarCnpj(valor: string): boolean {
  const cnpj = somenteDigitos(valor)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const calcularDigito = (ate: number): number => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * pesos[i]
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  return calcularDigito(12) === Number(cnpj[12]) && calcularDigito(13) === Number(cnpj[13])
}

export function formatarCpf(valor: string): string {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11) return valor
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data)
}

export function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
    .format(data)
    .replace(',', '')
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(valor)
    .replace(/\u00A0/g, ' ')
}
```

O `replace` no fim de `formatarMoeda` troca o espaço não-quebrável que o `Intl` insere por um espaço comum — sem isso a comparação no teste falha por um caractere invisível, que é das coisas mais frustrantes de depurar.

**As duas funções de data são distintas de propósito, e usar a errada corrompe o dado exibido:**

- `formatarData` serve aos campos `@db.Date` (`dataNascimento`, `dataAdmissao`, `dataAvaliacao`, `dataCompetencia`…). O Prisma devolve esses campos como **meia-noite UTC**. Formatá-los em `America/Sao_Paulo` mostraria 21h do dia anterior — ou seja, **toda data de nascimento e admissão apareceria um dia antes**. Por isso ela formata em `UTC`.
- `formatarDataHora` serve aos campos de instante real (`criadoEm`, `aferidoEm`, `registradoEm`, `ocorridoEm`). Esses são momentos no tempo e devem ser exibidos no fuso de quem lê — `America/Sao_Paulo`.

Regra prática para as tarefas seguintes: **se o campo é `@db.Date`, use `formatarData`; se é `DateTime` de acontecimento, use `formatarDataHora`.**

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- src/lib/ptbr.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ptbr.ts src/lib/ptbr.test.ts
git commit -m "Adiciona validação de CPF/CNPJ e formatação pt-BR"
```

---

### Task 3: Hash de senha com Argon2id

**Files:**
- Create: `src/lib/senha.ts`
- Test: `src/lib/senha.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `hashSenha(senha: string): Promise<string>`, `verificarSenha(hashArmazenado: string, senha: string): Promise<boolean>`

- [ ] **Step 1: Escrever os testes (devem falhar)**

`src/lib/senha.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { hashSenha, verificarSenha } from './senha'

describe('senha', () => {
  it('gera um hash diferente da senha original', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(hash).not.toBe('senha-forte-123')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('usa os parâmetros recomendados pela OWASP', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(hash).toContain('m=19456,t=2,p=1')
  })

  it('gera hashes diferentes para a mesma senha', async () => {
    const a = await hashSenha('senha-forte-123')
    const b = await hashSenha('senha-forte-123')
    expect(a).not.toBe(b)
  })

  it('verifica a senha correta', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(await verificarSenha(hash, 'senha-forte-123')).toBe(true)
  })

  it('recusa a senha errada', async () => {
    const hash = await hashSenha('senha-forte-123')
    expect(await verificarSenha(hash, 'senha-errada')).toBe(false)
  })

  it('retorna falso para hash malformado em vez de lançar', async () => {
    expect(await verificarSenha('nao-e-um-hash', 'qualquer')).toBe(false)
  })
})
```

O último teste importa: um hash corrompido no banco não pode derrubar a tela de login com erro 500 — deve simplesmente recusar o acesso.

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test -- src/lib/senha.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/lib/senha.ts`:

```typescript
import { hash, verify } from '@node-rs/argon2'

// Parâmetros recomendados pela OWASP para Argon2id: 19 MiB, 2 iterações,
// paralelismo 1. O algoritmo não é passado explicitamente porque
// `Algorithm.Argon2id` é um const enum de ambiente, inacessível como valor
// sob `isolatedModules` (exigido pelo Next). O padrão da biblioteca já é
// Argon2id, e o teste do prefixo `$argon2id$` trava isso contra regressão.
const OPCOES = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export async function hashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES)
}

export async function verificarSenha(
  hashArmazenado: string,
  senha: string
): Promise<boolean> {
  try {
    // Sem OPCOES: a string PHC do hash carrega os próprios parâmetros, e a
    // verificação usa os dela. Passá-los aqui sugeriria, falsamente, que
    // alterar OPCOES invalidaria hashes já gravados.
    return await verify(hashArmazenado, senha)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- src/lib/senha.test.ts`
Expected: PASS em todos os cinco.

- [ ] **Step 5: Commit**

```bash
git add src/lib/senha.ts src/lib/senha.test.ts
git commit -m "Adiciona hash de senha com Argon2id"
```

---

### Task 4: Contexto de execução, erros de domínio e verificação de papel

O contrato que todo serviço do sistema usa. Pequeno, mas é a peça que sustenta a regra R11 da spec.

**Files:**
- Create: `src/lib/erros.ts`
- Create: `src/lib/contexto.ts`
- Test: `src/lib/contexto.test.ts`

**Interfaces:**
- Consumes: enum `Papel` (Task 1)
- Produces:
  - `type Ctx = { usuarioId: string; email: string; papel: Papel; ip?: string; userAgent?: string }`
  - `exigirPapel(ctx: Ctx, ...papeis: Papel[]): void` — lança `ErroPermissao`
  - `class ErroPermissao extends Error`, `class ErroValidacao extends Error`, `class ErroNaoEncontrado extends Error`

- [ ] **Step 1: Escrever os testes (devem falhar)**

`src/lib/contexto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { exigirPapel, type Ctx } from './contexto'
import { ErroPermissao } from './erros'

function ctxCom(papel: Ctx['papel']): Ctx {
  return { usuarioId: 'usr_1', email: 'teste@lar.local', papel }
}

describe('exigirPapel', () => {
  it('permite quando o papel está na lista', () => {
    expect(() => exigirPapel(ctxCom('COORDENACAO'), 'COORDENACAO')).not.toThrow()
    expect(() =>
      exigirPapel(ctxCom('SAUDE'), 'COORDENACAO', 'SAUDE')
    ).not.toThrow()
  })

  it('lança ErroPermissao quando o papel não está na lista', () => {
    expect(() => exigirPapel(ctxCom('SAUDE'), 'ADMINISTRATIVO')).toThrow(
      ErroPermissao
    )
  })

  it('lança ErroPermissao quando nenhum papel é informado', () => {
    expect(() => exigirPapel(ctxCom('COORDENACAO'))).toThrow(ErroPermissao)
  })

  it('não vaza dados internos na mensagem de erro', () => {
    try {
      exigirPapel(ctxCom('SAUDE'), 'ADMINISTRATIVO')
    } catch (erro) {
      expect((erro as Error).message).toBe('Acesso negado')
    }
  })
})
```

O teste da lista vazia cobre um erro de digitação plausível — `exigirPapel(ctx)` sem argumentos deve negar, nunca liberar. Um `includes` sobre lista vazia já retorna `false`, mas o teste trava o comportamento contra uma refatoração futura.

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test -- src/lib/contexto.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar os erros de domínio**

`src/lib/erros.ts`:

```typescript
export class ErroPermissao extends Error {
  constructor(mensagem = 'Acesso negado') {
    super(mensagem)
    this.name = 'ErroPermissao'
  }
}

export class ErroValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroValidacao'
  }
}

export class ErroNaoEncontrado extends Error {
  constructor(mensagem = 'Registro não encontrado') {
    super(mensagem)
    this.name = 'ErroNaoEncontrado'
  }
}
```

- [ ] **Step 4: Implementar o contexto**

`src/lib/contexto.ts`:

```typescript
import type { Papel } from '@prisma/client'
import { ErroPermissao } from './erros'

export type Ctx = {
  usuarioId: string
  email: string
  papel: Papel
  ip?: string
  userAgent?: string
}

export function exigirPapel(ctx: Ctx, ...papeis: Papel[]): void {
  if (!papeis.includes(ctx.papel)) {
    throw new ErroPermissao()
  }
}
```

A mensagem é sempre "Acesso negado", sem detalhar qual papel seria necessário. Mensagem de erro específica demais entrega ao atacante o mapa das permissões do sistema.

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/lib/contexto.test.ts`
Expected: PASS nos quatro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/erros.ts src/lib/contexto.ts src/lib/contexto.test.ts
git commit -m "Adiciona contexto de execução, erros de domínio e verificação de papel"
```

---
### Task 5: Trilha de auditoria

Transversal e por isso vem cedo: todo serviço a partir daqui registra o que fez.

**Files:**
- Modify: `prisma/schema.prisma` (adicionar `AcaoAuditoria` e `LogAuditoria`)
- Create: `src/modules/audit/auditoria.service.ts`
- Test: `src/modules/audit/auditoria.service.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `Ctx` (Task 4)
- Produces:
  - `registrarAuditoria(cliente: ClientePrisma, ctx: Ctx, dados: DadosAuditoria): Promise<void>`
  - `calcularDiff(antes: Record<string, unknown>, depois: Record<string, unknown>): Diff | null`
  - `type ClientePrisma = PrismaClient | Prisma.TransactionClient`
  - `type DadosAuditoria = { acao: AcaoAuditoria; entidade: string; entidadeId?: string; residenteId?: string; diff?: Diff | null }`
  - `type Diff = Record<string, { de: unknown; para: unknown }>`

- [ ] **Step 1: Adicionar o modelo ao schema**

Em `prisma/schema.prisma`:

```prisma
enum AcaoAuditoria {
  CRIAR
  ATUALIZAR
  EXCLUIR
  VISUALIZAR
  LOGIN
  LOGIN_FALHA
  LOGOUT
  EXPORTAR
  DOWNLOAD
}

model LogAuditoria {
  id           String        @id @default(cuid())
  usuarioId    String?
  usuarioEmail String
  acao         AcaoAuditoria
  entidade     String
  entidadeId   String?
  residenteId  String?
  diff         Json?
  ip           String?
  userAgent    String?
  criadoEm     DateTime      @default(now())

  @@index([entidade, entidadeId])
  @@index([usuarioId, criadoEm])
  @@index([residenteId, criadoEm])
  @@index([criadoEm])
  @@map("logs_auditoria")
}
```

`usuarioEmail` é cópia, não relação: se a conta for desativada ou o e-mail mudar, o log precisa continuar dizendo quem era no momento do ato.

```bash
npm run db:migrate -- --name auditoria
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/audit/auditoria.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import type { Ctx } from '@/lib/contexto'
import * as auditoria from './auditoria.service'
import { registrarAuditoria, calcularDiff } from './auditoria.service'

const ctx: Ctx = {
  usuarioId: 'usr_1',
  email: 'coordenacao@lar.local',
  papel: 'COORDENACAO',
  ip: '10.0.0.5',
  userAgent: 'teste',
}

describe('registrarAuditoria', () => {
  it('grava a ação com os dados do contexto', async () => {
    await registrarAuditoria(prisma, ctx, {
      acao: 'CRIAR',
      entidade: 'Residente',
      entidadeId: 'res_1',
      residenteId: 'res_1',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow()
    expect(log.usuarioId).toBe('usr_1')
    expect(log.usuarioEmail).toBe('coordenacao@lar.local')
    expect(log.acao).toBe('CRIAR')
    expect(log.entidade).toBe('Residente')
    expect(log.entidadeId).toBe('res_1')
    expect(log.ip).toBe('10.0.0.5')
  })

  it('é desfeita junto com a transação que falha', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarAuditoria(tx, ctx, { acao: 'CRIAR', entidade: 'Residente' })
        throw new Error('falha proposital')
      })
    ).rejects.toThrow('falha proposital')

    expect(await prisma.logAuditoria.count()).toBe(0)
  })
})

describe('calcularDiff', () => {
  it('retorna apenas os campos alterados', () => {
    const diff = calcularDiff(
      { nome: 'Maria', quarto: '3', leito: 'A' },
      { nome: 'Maria Silva', quarto: '3' }
    )
    expect(diff).toEqual({ nome: { de: 'Maria', para: 'Maria Silva' } })
  })

  it('retorna null quando nada mudou', () => {
    expect(calcularDiff({ nome: 'Maria' }, { nome: 'Maria' })).toBeNull()
  })

  it('compara datas por valor, não por referência', () => {
    const antes = { dataAdmissao: new Date('2026-01-10T00:00:00Z') }
    const igual = { dataAdmissao: new Date('2026-01-10T00:00:00Z') }
    const diferente = { dataAdmissao: new Date('2026-02-10T00:00:00Z') }

    expect(calcularDiff(antes, igual)).toBeNull()
    expect(calcularDiff(antes, diferente)).not.toBeNull()
  })

  it('distingue null de string vazia', () => {
    expect(calcularDiff({ rg: null }, { rg: '' })).not.toBeNull()
  })

  it('ignora campos ausentes no objeto de alteração', () => {
    expect(calcularDiff({ nome: 'Maria', cpf: '123' }, { nome: 'Maria' })).toBeNull()
  })
})

describe('superfície do módulo', () => {
  it('não expõe operação de alteração ou exclusão de log', () => {
    expect(Object.keys(auditoria).sort()).toEqual([
      'calcularDiff',
      'registrarAuditoria',
    ])
  })
})
```

O último teste trava a natureza append-only da trilha. Se alguém adicionar um `limparLogsAntigos` no futuro, o teste falha e força a decisão a ser discutida em vez de acontecer por conveniência.

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/audit`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar**

`src/modules/audit/auditoria.service.ts`:

```typescript
import type { AcaoAuditoria, Prisma, PrismaClient } from '@prisma/client'
import type { Ctx } from '@/lib/contexto'

export type ClientePrisma = PrismaClient | Prisma.TransactionClient

export type Diff = Record<string, { de: unknown; para: unknown }>

export type DadosAuditoria = {
  acao: AcaoAuditoria
  entidade: string
  entidadeId?: string
  residenteId?: string
  diff?: Diff | null
}

function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString()
  if (valor === undefined) return null
  return valor
}

export function calcularDiff(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): Diff | null {
  const diff: Diff = {}

  for (const chave of Object.keys(depois)) {
    const de = normalizar(antes[chave])
    const para = normalizar(depois[chave])
    if (JSON.stringify(de) !== JSON.stringify(para)) {
      diff[chave] = { de: antes[chave] ?? null, para: depois[chave] ?? null }
    }
  }

  return Object.keys(diff).length > 0 ? diff : null
}

export async function registrarAuditoria(
  cliente: ClientePrisma,
  ctx: Ctx,
  dados: DadosAuditoria
): Promise<void> {
  await cliente.logAuditoria.create({
    data: {
      usuarioId: ctx.usuarioId,
      usuarioEmail: ctx.email,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      residenteId: dados.residenteId,
      diff: dados.diff ?? undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  })
}
```

`registrarAuditoria` recebe o cliente como parâmetro em vez de importar o singleton: é o que permite chamá-la dentro de uma transação e ter a garantia de que log e alteração vivem ou morrem juntos. Auditoria que sobrevive a um rollback registra um fato que não aconteceu.

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/modules/audit`
Expected: PASS nos oito.

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/modules/audit/
git commit -m "Adiciona trilha de auditoria append-only"
```

---

### Task 6: Serviço de usuários

**Files:**
- Create: `src/lib/validacao.ts`
- Create: `src/modules/auth/usuarios.schema.ts`
- Create: `src/modules/auth/usuarios.service.ts`
- Create: `tests/helpers/fabricas.ts`
- Test: `src/modules/auth/usuarios.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `hashSenha`, `registrarAuditoria`, `calcularDiff`
- Produces:
  - `validar<S extends ZodTypeAny>(schema: S, valor: unknown): z.infer<S>` em `src/lib/validacao.ts` — **usado por todos os serviços seguintes**
  - `criarUsuario(ctx: Ctx, dados: DadosNovoUsuario): Promise<UsuarioPublico>`
  - `listarUsuarios(ctx: Ctx): Promise<UsuarioPublico[]>`
  - `atualizarUsuario(ctx: Ctx, id: string, dados: DadosAtualizacaoUsuario): Promise<UsuarioPublico>`
  - `definirSenha(ctx: Ctx, id: string, novaSenha: string): Promise<void>`
  - `desativarUsuario(ctx: Ctx, id: string): Promise<void>`
  - `type UsuarioPublico = { id, email, nome, papel, ativo, ultimoAcessoEm }` — **nunca inclui `senhaHash`**
- Também produz a fábrica de teste `criarUsuarioDeTeste(overrides?): Promise<Usuario>` em `tests/helpers/fabricas.ts`, usada por todas as tasks seguintes.

- [ ] **Step 1: Escrever a fábrica de teste**

`tests/helpers/fabricas.ts`:

```typescript
import type { Papel, Usuario } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashSenha } from '@/lib/senha'
import type { Ctx } from '@/lib/contexto'

let contador = 0

export async function criarUsuarioDeTeste(
  overrides: Partial<{ email: string; nome: string; papel: Papel; ativo: boolean }> = {}
): Promise<Usuario> {
  contador += 1
  return prisma.usuario.create({
    data: {
      email: overrides.email ?? `usuario${contador}@lar.local`,
      nome: overrides.nome ?? `Usuário ${contador}`,
      papel: overrides.papel ?? 'COORDENACAO',
      ativo: overrides.ativo ?? true,
      senhaHash: await hashSenha('senha-de-teste-123'),
    },
  })
}

export function ctxDe(usuario: Usuario): Ctx {
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    papel: usuario.papel,
    ip: '127.0.0.1',
    userAgent: 'vitest',
  }
}

export async function ctxComPapel(papel: Papel): Promise<Ctx> {
  return ctxDe(await criarUsuarioDeTeste({ papel }))
}
```

- [ ] **Step 2: Escrever os testes do serviço (devem falhar)**

`src/modules/auth/usuarios.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { verificarSenha } from '@/lib/senha'
import { criarUsuarioDeTeste, ctxDe, ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarUsuario,
  listarUsuarios,
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

  it('nunca inclui senhaHash no diff da auditoria', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const alvo = await criarUsuario(ctx, dadosValidos)

    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456')

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
    await definirSenha(ctx, alvo.id, 'outra-senha-forte-456')

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })
    expect(await verificarSenha(depois.senhaHash, 'outra-senha-forte-456')).toBe(true)
    expect(depois.senhaAlteradaEm.getTime()).toBeGreaterThan(antes.senhaAlteradaEm.getTime())
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
})
```

O teste de auto-desativação cobre um cenário real: a coordenação se desativa por engano e o Lar fica sem ninguém capaz de gerir usuários.

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/auth`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Criar o helper de validação compartilhado**

`src/lib/validacao.ts` — usado por este serviço e por todos os seguintes:

```typescript
import type { ZodTypeAny, z } from 'zod'
import { ErroValidacao } from './erros'

export function validar<S extends ZodTypeAny>(schema: S, valor: unknown): z.infer<S> {
  const resultado = schema.safeParse(valor)
  if (!resultado.success) {
    throw new ErroValidacao(resultado.error.issues.map((i) => i.message).join('; '))
  }
  return resultado.data
}
```

Falha de validação vira `ErroValidacao` com todas as mensagens concatenadas, e não uma exceção do Zod vazando para a camada de cima.

- [ ] **Step 5: Escrever os schemas Zod**

`src/modules/auth/usuarios.schema.ts`:

```typescript
import { z } from 'zod'

export const papelSchema = z.enum(['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'])

export const novoUsuarioSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  nome: z.string().trim().min(3, 'Informe o nome completo'),
  papel: papelSchema,
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  funcionarioId: z.string().cuid().optional(),
})

export const atualizacaoUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo').optional(),
  papel: papelSchema.optional(),
  funcionarioId: z.string().cuid().nullable().optional(),
})

export type DadosNovoUsuario = z.infer<typeof novoUsuarioSchema>
export type DadosAtualizacaoUsuario = z.infer<typeof atualizacaoUsuarioSchema>
```

- [ ] **Step 6: Implementar o serviço**

`src/modules/auth/usuarios.service.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { hashSenha } from '@/lib/senha'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoUsuarioSchema,
  atualizacaoUsuarioSchema,
  type DadosNovoUsuario,
  type DadosAtualizacaoUsuario,
} from './usuarios.schema'

const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  nome: true,
  papel: true,
  ativo: true,
  ultimoAcessoEm: true,
} as const

export type UsuarioPublico = {
  id: string
  email: string
  nome: string
  papel: 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO'
  ativo: boolean
  ultimoAcessoEm: Date | null
}

export async function criarUsuario(
  ctx: Ctx,
  dados: DadosNovoUsuario
): Promise<UsuarioPublico> {
  exigirPapel(ctx, 'COORDENACAO')
  const entrada = validar(novoUsuarioSchema, dados)

  const existente = await prisma.usuario.findUnique({ where: { email: entrada.email } })
  if (existente) {
    throw new ErroValidacao('Já existe um usuário com este e-mail')
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.usuario.create({
      data: {
        email: entrada.email,
        nome: entrada.nome,
        papel: entrada.papel,
        funcionarioId: entrada.funcionarioId,
        senhaHash: await hashSenha(entrada.senha),
        criadoPorId: ctx.usuarioId,
      },
      select: CAMPOS_PUBLICOS,
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Usuario',
      entidadeId: criado.id,
      diff: { email: { de: null, para: criado.email }, papel: { de: null, para: criado.papel } },
    })

    return criado
  })
}

export async function listarUsuarios(ctx: Ctx): Promise<UsuarioPublico[]> {
  exigirPapel(ctx, 'COORDENACAO')
  return prisma.usuario.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  })
}

export async function atualizarUsuario(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoUsuario
): Promise<UsuarioPublico> {
  exigirPapel(ctx, 'COORDENACAO')
  const entrada = validar(atualizacaoUsuarioSchema, dados)

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.usuario.update({
      where: { id },
      data: entrada,
      select: CAMPOS_PUBLICOS,
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff,
    })

    return atualizado
  })
}

export async function definirSenha(
  ctx: Ctx,
  id: string,
  novaSenha: string
): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO')
  if (novaSenha.length < 8) {
    throw new ErroValidacao('A senha deve ter ao menos 8 caracteres')
  }

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: { senhaHash: await hashSenha(novaSenha), senhaAlteradaEm: new Date() },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff: { senha: { de: '(oculto)', para: '(alterada)' } },
    })
  })
}

export async function desativarUsuario(ctx: Ctx, id: string): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO')

  if (id === ctx.usuarioId) {
    throw new ErroValidacao('Não é possível desativar o próprio usuário')
  }

  const atual = await prisma.usuario.findUnique({ where: { id } })
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { ativo: false } })
    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      diff: { ativo: { de: true, para: false } },
    })
  })
}
```

Duas decisões que se repetem em todos os serviços seguintes: `select` explícito com os campos públicos (o `senhaHash` nunca sai da camada de dados por acidente) e a auditoria dentro da mesma transação da escrita.

Na auditoria de senha, o diff é textual e não contém nem o hash nem a senha — registra-se que houve troca, não o quê.

- [ ] **Step 7: Rodar os testes**

Run: `npm test -- src/modules/auth`
Expected: PASS em todos.

- [ ] **Step 8: Commit**

```bash
git add src/modules/auth/ src/lib/validacao.ts tests/helpers/fabricas.ts
git commit -m "Adiciona serviço de usuários com auditoria e verificação de papel"
```

---

### Task 7: Autenticação, sessão e tela de login

**Files:**
- Create: `src/modules/auth/config.ts`
- Create: `src/modules/auth/sessao.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/acoes.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `prisma/seed.ts`
- Create: `playwright.config.ts`
- Test: `src/modules/auth/sessao.test.ts`, `tests/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `prisma`, `verificarSenha`, `registrarAuditoria`, `Ctx`
- Produces:
  - `auth`, `handlers`, `signIn`, `signOut` (de `config.ts`)
  - `obterCtx(): Promise<Ctx>` — lança `ErroPermissao` se a sessão for inválida, o usuário estiver inativo ou a senha tiver sido trocada após a emissão do token
  - `obterCtxOuNulo(): Promise<Ctx | null>`

- [ ] **Step 1: Escrever o teste de `obterCtx` (deve falhar)**

`src/modules/auth/sessao.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { criarUsuarioDeTeste } from '@/../tests/helpers/fabricas'

const mockAuth = vi.fn()
const mockHeaders = vi.fn(async () => new Headers({ 'x-forwarded-for': '10.0.0.9' }))

vi.mock('./config', () => ({ auth: () => mockAuth() }))
vi.mock('next/headers', () => ({ headers: () => mockHeaders() }))

const { obterCtx } = await import('./sessao')

beforeEach(() => {
  mockAuth.mockReset()
})

describe('obterCtx', () => {
  it('monta o contexto com o papel lido do banco', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'SAUDE' })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    const ctx = await obterCtx()

    expect(ctx.usuarioId).toBe(usuario.id)
    expect(ctx.papel).toBe('SAUDE')
    expect(ctx.ip).toBe('10.0.0.9')
  })

  it('recusa quando não há sessão', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('recusa usuário desativado mesmo com token válido', async () => {
    const usuario = await criarUsuarioDeTeste()
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('recusa token emitido antes da troca de senha', async () => {
    const usuario = await criarUsuarioDeTeste()
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(usuario.senhaAlteradaEm.getTime() / 1000) - 10,
    })

    await expect(obterCtx()).rejects.toThrow(ErroPermissao)
  })

  it('reflete imediatamente a mudança de papel no banco', async () => {
    const usuario = await criarUsuarioDeTeste({ papel: 'SAUDE' })
    mockAuth.mockResolvedValue({
      user: { id: usuario.id },
      emitidoEm: Math.floor(Date.now() / 1000) + 60,
    })

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { papel: 'ADMINISTRATIVO' },
    })

    const ctx = await obterCtx()
    expect(ctx.papel).toBe('ADMINISTRATIVO')
  })
})
```

Esses cinco testes são a prova da mitigação descrita na §2.4 da spec. Sem eles, a escolha de JWT ficaria com a falha que ela deveria compensar.

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test -- src/modules/auth/sessao.test.ts`
Expected: FAIL — módulo `./sessao` não encontrado.

- [ ] **Step 3: Declarar os tipos da sessão**

`src/types/next-auth.d.ts`:

```typescript
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: { id: string } & DefaultSession['user']
    emitidoEm: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    usuarioId: string
    emitidoEm: number
  }
}
```

- [ ] **Step 4: Configurar o Auth.js**

`src/modules/auth/config.ts`:

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { verificarSenha } from '@/lib/senha'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const DOZE_HORAS = 60 * 60 * 12

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: DOZE_HORAS },
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      async authorize(credenciais) {
        const email = String(credenciais?.email ?? '').trim().toLowerCase()
        const senha = String(credenciais?.senha ?? '')
        if (!email || !senha) return null

        const usuario = await prisma.usuario.findUnique({ where: { email } })
        const ctxFalha = { usuarioId: 'anonimo', email, papel: 'SAUDE' as const }

        if (!usuario || !usuario.ativo) {
          await registrarAuditoria(prisma, ctxFalha, {
            acao: 'LOGIN_FALHA',
            entidade: 'Usuario',
          })
          return null
        }

        if (!(await verificarSenha(usuario.senhaHash, senha))) {
          await registrarAuditoria(prisma, { ...ctxFalha, usuarioId: usuario.id }, {
            acao: 'LOGIN_FALHA',
            entidade: 'Usuario',
            entidadeId: usuario.id,
          })
          return null
        }

        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcessoEm: new Date() },
        })

        await registrarAuditoria(
          prisma,
          { usuarioId: usuario.id, email: usuario.email, papel: usuario.papel },
          { acao: 'LOGIN', entidade: 'Usuario', entidadeId: usuario.id }
        )

        return { id: usuario.id, email: usuario.email, name: usuario.nome }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.usuarioId = user.id
        token.emitidoEm = Math.floor(Date.now() / 1000)
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.usuarioId
      session.emitidoEm = token.emitidoEm
      return session
    },
  },
})
```

O `authorize` devolve `null` — nunca uma mensagem — tanto para e-mail inexistente quanto para senha errada. Distinguir os dois casos na resposta confirma ao atacante quais e-mails existem no sistema.

- [ ] **Step 5: Implementar `obterCtx`**

`src/modules/auth/sessao.ts`:

```typescript
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import type { Ctx } from '@/lib/contexto'
import { auth } from './config'

export async function obterCtx(): Promise<Ctx> {
  const sessao = await auth()
  if (!sessao?.user?.id) {
    throw new ErroPermissao('Sessão inválida')
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sessao.user.id } })
  if (!usuario || !usuario.ativo) {
    throw new ErroPermissao('Sessão inválida')
  }

  const senhaAlteradaEmSegundos = Math.floor(usuario.senhaAlteradaEm.getTime() / 1000)
  if (senhaAlteradaEmSegundos > sessao.emitidoEm) {
    throw new ErroPermissao('Sessão inválida')
  }

  const cabecalhos = await headers()

  return {
    usuarioId: usuario.id,
    email: usuario.email,
    papel: usuario.papel,
    ip: cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: cabecalhos.get('user-agent') ?? undefined,
  }
}

export async function obterCtxOuNulo(): Promise<Ctx | null> {
  try {
    return await obterCtx()
  } catch {
    return null
  }
}
```

O papel vem do banco a cada requisição, não do token: rebaixar alguém de coordenação para saúde tem efeito no próximo clique, sem esperar a expiração.

- [ ] **Step 6: Rodar os testes de sessão**

Run: `npm test -- src/modules/auth/sessao.test.ts`
Expected: PASS nos cinco.

- [ ] **Step 7: Criar a rota do Auth.js e o middleware**

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from '@/modules/auth/config'

export const { GET, POST } = handlers
```

`src/middleware.ts`:

```typescript
import { auth } from '@/modules/auth/config'

export default auth((req) => {
  const autenticado = Boolean(req.auth?.user)
  const ehLogin = req.nextUrl.pathname === '/login'

  if (!autenticado && !ehLogin) {
    const url = new URL('/login', req.nextUrl)
    url.searchParams.set('proximo', req.nextUrl.pathname)
    return Response.redirect(url)
  }

  if (autenticado && ehLogin) {
    return Response.redirect(new URL('/residentes', req.nextUrl))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
```

O middleware é a primeira barreira, não a única: ele bloqueia navegação, e cada serviço bloqueia a operação (spec R11).

- [ ] **Step 8: Criar a tela de login**

`src/app/login/acoes.ts`:

```typescript
'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/modules/auth/config'

export async function entrar(_estadoAnterior: string | null, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      senha: formData.get('senha'),
      redirectTo: '/residentes',
    })
    return null
  } catch (erro) {
    if (erro instanceof AuthError) {
      return 'E-mail ou senha incorretos.'
    }
    throw erro
  }
}
```

`src/app/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { entrar } from './acoes'

export default function PaginaLogin() {
  const [erro, acao, enviando] = useActionState(entrar, null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form action={acao} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Lar de Idosos</h1>
        <p className="text-sm text-slate-500">Entre com suas credenciais</p>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="senha" className="text-sm font-medium text-slate-700">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-slate-800 py-2 text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 9: Criar o seed com o usuário inicial**

`prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import { hashSenha } from '../src/lib/senha'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'coordenacao@lar.local'
  const senha = process.env.SEED_ADMIN_SENHA ?? 'trocar-esta-senha-123'

  const existente = await prisma.usuario.findUnique({ where: { email } })
  if (existente) {
    console.log(`Usuário ${email} já existe; nada a fazer.`)
    return
  }

  await prisma.usuario.create({
    data: {
      email,
      nome: 'Coordenação',
      papel: 'COORDENACAO',
      senhaHash: await hashSenha(senha),
    },
  })

  console.log(`Usuário inicial criado: ${email}`)
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

O seed é idempotente: rodar duas vezes não duplica nem sobrescreve a senha já trocada.

- [ ] **Step 10: Escrever o teste ponta a ponta do login**

`playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', locale: 'pt-BR' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

`tests/e2e/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('recusa credenciais inválidas', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
})

test('entra com credenciais válidas e redireciona', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
})

test('redireciona visitante não autenticado para o login', async ({ page }) => {
  await page.goto('/residentes')
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 11: Rodar tudo**

```bash
npm run db:seed
npx playwright install chromium
npm run test:e2e
```

Expected: os três testes passam. O segundo depende de a rota `/residentes` existir — crie um `src/app/(app)/residentes/page.tsx` provisório com um `<h1>Residentes</h1>` para este teste; a tela real vem na Task 14.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Adiciona autenticação com Auth.js, revogação imediata de sessão e tela de login"
```

---
### Task 8: Cadastro de residentes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/residents/residentes.schema.ts`
- Create: `src/modules/residents/residentes.service.ts`
- Modify: `tests/helpers/fabricas.ts` (adicionar `criarResidenteDeTeste`)
- Test: `src/modules/residents/residentes.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`, `calcularDiff`, `validarCpf`, `somenteDigitos`
- Produces:
  - `criarResidente(ctx, dados: DadosNovoResidente): Promise<Residente>`
  - `obterResidente(ctx, id: string): Promise<Residente>` — audita `VISUALIZAR`
  - `listarResidentes(ctx, filtro?: { busca?: string; status?: StatusResidente }): Promise<Residente[]>`
  - `atualizarResidente(ctx, id, dados: DadosAtualizacaoResidente): Promise<Residente>`
  - `desligarResidente(ctx, id, dados: { status: 'DESLIGADO' | 'FALECIDO'; dataSaida: Date; motivoSaida: string; observacaoSaida?: string }): Promise<Residente>`
  - Fábrica `criarResidenteDeTeste(overrides?): Promise<Residente>`

- [ ] **Step 1: Adicionar os modelos ao schema**

```prisma
enum Sexo {
  FEMININO
  MASCULINO
  OUTRO
}

enum StatusResidente {
  ATIVO
  DESLIGADO
  FALECIDO
}

enum TipoBeneficio {
  APOSENTADORIA
  BPC
  PENSAO
  NENHUM
}

model Residente {
  id               String          @id @default(cuid())
  nomeCompleto     String
  nomeSocial       String?
  dataNascimento   DateTime        @db.Date
  sexo             Sexo
  estadoCivil      String?
  naturalidade     String?
  nacionalidade    String          @default("Brasileira")
  religiao         String?
  escolaridade     String?
  cpf              String?         @unique
  rg               String?
  orgaoEmissorRg   String?
  cns              String?
  dataAdmissao     DateTime        @db.Date
  origemAdmissao   String?
  motivoAdmissao   String?
  quarto           String?
  leito            String?
  planoSaude       String?
  numeroPlanoSaude String?
  beneficioTipo    TipoBeneficio?
  beneficioNumero  String?
  beneficioValor   Decimal?        @db.Decimal(12, 2)
  status           StatusResidente @default(ATIVO)
  dataSaida        DateTime?       @db.Date
  motivoSaida      String?
  observacaoSaida  String?
  criadoEm         DateTime        @default(now())
  atualizadoEm     DateTime        @updatedAt
  criadoPorId      String?

  @@index([status, nomeCompleto])
  @@map("residentes")
}
```

```bash
npm run db:migrate -- --name residentes
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/residents/residentes.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarResidente,
  obterResidente,
  listarResidentes,
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

describe('listarResidentes', () => {
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

    const ativos = await listarResidentes(ctx, { status: 'ATIVO' })
    expect(ativos.map((r) => r.nomeCompleto)).toEqual(['João Pereira'])

    const busca = await listarResidentes(ctx, { busca: 'maria das' })
    expect(busca).toHaveLength(1)
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

  it('nega atualização para o papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidente(admin, dadosValidos)
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      atualizarResidente(ctx, residente.id, { quarto: '5' })
    ).rejects.toThrow(ErroPermissao)
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
})
```

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/residents`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Escrever os schemas Zod**

`src/modules/residents/residentes.schema.ts`:

```typescript
import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

const cpfOpcional = z
  .string()
  .trim()
  .optional()
  .transform((valor) => (valor ? somenteDigitos(valor) : undefined))
  .refine((valor) => valor === undefined || validarCpf(valor), {
    message: 'CPF inválido',
  })

const dataNoPassado = (mensagem: string) =>
  z.date().refine((data) => data.getTime() <= Date.now(), { message: mensagem })

export const novoResidenteSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  nomeSocial: z.string().trim().optional(),
  dataNascimento: dataNoPassado('A data de nascimento não pode estar no futuro'),
  sexo: z.enum(['FEMININO', 'MASCULINO', 'OUTRO']),
  estadoCivil: z.string().trim().optional(),
  naturalidade: z.string().trim().optional(),
  nacionalidade: z.string().trim().default('Brasileira'),
  religiao: z.string().trim().optional(),
  escolaridade: z.string().trim().optional(),
  cpf: cpfOpcional,
  rg: z.string().trim().optional(),
  orgaoEmissorRg: z.string().trim().optional(),
  cns: z.string().trim().optional(),
  dataAdmissao: dataNoPassado('A data de admissão não pode estar no futuro'),
  origemAdmissao: z.string().trim().optional(),
  motivoAdmissao: z.string().trim().optional(),
  quarto: z.string().trim().optional(),
  leito: z.string().trim().optional(),
  planoSaude: z.string().trim().optional(),
  numeroPlanoSaude: z.string().trim().optional(),
  beneficioTipo: z.enum(['APOSENTADORIA', 'BPC', 'PENSAO', 'NENHUM']).optional(),
  beneficioNumero: z.string().trim().optional(),
  beneficioValor: z.number().nonnegative().optional(),
})

export const atualizacaoResidenteSchema = novoResidenteSchema.partial()

export const desligamentoSchema = z.object({
  status: z.enum(['DESLIGADO', 'FALECIDO']),
  dataSaida: z.date(),
  motivoSaida: z.string().trim().min(3, 'Informe o motivo da saída'),
  observacaoSaida: z.string().trim().optional(),
})

export type DadosNovoResidente = z.input<typeof novoResidenteSchema>
export type DadosAtualizacaoResidente = z.input<typeof atualizacaoResidenteSchema>
export type DadosDesligamento = z.infer<typeof desligamentoSchema>
```

- [ ] **Step 5: Implementar o serviço**

`src/modules/residents/residentes.service.ts`:

```typescript
import type { Prisma, Residente, StatusResidente } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoResidenteSchema,
  atualizacaoResidenteSchema,
  desligamentoSchema,
  type DadosNovoResidente,
  type DadosAtualizacaoResidente,
  type DadosDesligamento,
} from './residentes.schema'

async function exigirResidente(id: string): Promise<Residente> {
  const residente = await prisma.residente.findUnique({ where: { id } })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')
  return residente
}

export async function criarResidente(
  ctx: Ctx,
  dados: DadosNovoResidente
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(novoResidenteSchema, dados)

  if (entrada.cpf) {
    const existente = await prisma.residente.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um residente com este CPF')
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.residente.create({
      data: { ...entrada, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Residente',
      entidadeId: criado.id,
      residenteId: criado.id,
      diff: { nomeCompleto: { de: null, para: criado.nomeCompleto } },
    })

    return criado
  })
}

export async function obterResidente(ctx: Ctx, id: string): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const residente = await exigirResidente(id)

  await registrarAuditoria(prisma, ctx, {
    acao: 'VISUALIZAR',
    entidade: 'Residente',
    entidadeId: id,
    residenteId: id,
  })

  return residente
}

export async function listarResidentes(
  ctx: Ctx,
  filtro: { busca?: string; status?: StatusResidente } = {}
): Promise<Residente[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const where: Prisma.ResidenteWhereInput = {}
  if (filtro.status) where.status = filtro.status
  if (filtro.busca?.trim()) {
    where.OR = [
      { nomeCompleto: { contains: filtro.busca.trim(), mode: 'insensitive' } },
      { nomeSocial: { contains: filtro.busca.trim(), mode: 'insensitive' } },
    ]
  }

  return prisma.residente.findMany({ where, orderBy: { nomeCompleto: 'asc' } })
}

export async function atualizarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoResidente
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoResidenteSchema, dados)
  const atual = await exigirResidente(id)

  if (entrada.cpf && entrada.cpf !== atual.cpf) {
    const existente = await prisma.residente.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um residente com este CPF')
  }

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.residente.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Residente',
      entidadeId: id,
      residenteId: id,
      diff,
    })

    return atualizado
  })
}

export async function desligarResidente(
  ctx: Ctx,
  id: string,
  dados: DadosDesligamento
): Promise<Residente> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(desligamentoSchema, dados)
  const atual = await exigirResidente(id)

  if (atual.status !== 'ATIVO') {
    throw new ErroValidacao('Este residente já está desligado')
  }
  if (entrada.dataSaida < atual.dataAdmissao) {
    throw new ErroValidacao('A data de saída não pode ser anterior à admissão')
  }

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.residente.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Residente',
      entidadeId: id,
      residenteId: id,
      diff: { status: { de: atual.status, para: entrada.status } },
    })

    return atualizado
  })
}
```

- [ ] **Step 6: Adicionar a fábrica de teste**

Em `tests/helpers/fabricas.ts`:

```typescript
import type { Residente } from '@prisma/client'

export async function criarResidenteDeTeste(
  overrides: Partial<{ nomeCompleto: string; quarto: string; cpf: string | null }> = {}
): Promise<Residente> {
  contador += 1
  return prisma.residente.create({
    data: {
      nomeCompleto: overrides.nomeCompleto ?? `Residente ${contador}`,
      dataNascimento: new Date('1940-01-01'),
      sexo: 'FEMININO',
      dataAdmissao: new Date('2026-01-01'),
      quarto: overrides.quarto ?? '1',
      cpf: overrides.cpf ?? null,
    },
  })
}
```

- [ ] **Step 7: Rodar os testes**

Run: `npm test -- src/modules/residents src/modules/auth`
Expected: PASS em todos (inclusive os de usuários, após a extração do `validar`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Adiciona cadastro de residentes com validação e auditoria"
```

---

### Task 9: Histórico de grau de dependência

Implementa a regra R2 da spec: o grau vigente é o da avaliação mais recente **na data de referência**, não o atual.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/residents/dependencia.service.ts`
- Test: `src/modules/residents/dependencia.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`
- Produces:
  - `registrarAvaliacao(ctx, dados: { residenteId, grau, dataAvaliacao, avaliadorNome, justificativa? }): Promise<AvaliacaoDependencia>`
  - `obterGrauVigente(ctx, residenteId: string, emData?: Date): Promise<GrauDependencia | null>`
  - `listarAvaliacoes(ctx, residenteId: string): Promise<AvaliacaoDependencia[]>`

- [ ] **Step 1: Adicionar o modelo**

```prisma
enum GrauDependencia {
  I
  II
  III
}

model AvaliacaoDependencia {
  id            String          @id @default(cuid())
  residenteId   String
  residente     Residente       @relation(fields: [residenteId], references: [id])
  grau          GrauDependencia
  dataAvaliacao DateTime        @db.Date
  avaliadorNome String
  avaliadorId   String?
  justificativa String?
  criadoEm      DateTime        @default(now())
  criadoPorId   String?

  @@index([residenteId, dataAvaliacao])
  @@map("avaliacoes_dependencia")
}
```

Adicione também a relação inversa em `Residente`:

```prisma
  avaliacoesDependencia AvaliacaoDependencia[]
```

```bash
npm run db:migrate -- --name avaliacao_dependencia
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/residents/dependencia.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  registrarAvaliacao,
  obterGrauVigente,
  listarAvaliacoes,
} from './dependencia.service'

describe('registrarAvaliacao', () => {
  it('permite SAUDE e COORDENACAO', async () => {
    const residente = await criarResidenteDeTeste()

    for (const papel of ['SAUDE', 'COORDENACAO'] as const) {
      const ctx = await ctxComPapel(papel)
      const avaliacao = await registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'II',
        dataAvaliacao: new Date('2026-03-01'),
        avaliadorNome: 'Enf. Ana',
      })
      expect(avaliacao.grau).toBe('II')
    }
  })

  it('nega para ADMINISTRATIVO — atribuir grau é ato clínico', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'II',
        dataAvaliacao: new Date('2026-03-01'),
        avaliadorNome: 'Enf. Ana',
      })
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa data de avaliação no futuro', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      registrarAvaliacao(ctx, {
        residenteId: residente.id,
        grau: 'I',
        dataAvaliacao: new Date(Date.now() + 86_400_000),
        avaliadorNome: 'Enf. Ana',
      })
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('obterGrauVigente', () => {
  it('retorna o grau da avaliação mais recente até a data de referência', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'I',
      dataAvaliacao: new Date('2026-01-10'),
      avaliadorNome: 'Enf. Ana',
    })
    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'III',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-03-01'))).toBe('I')
    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-08-01'))).toBe('III')
    expect(await obterGrauVigente(ctx, residente.id)).toBe('III')
  })

  it('retorna null quando não há avaliação até a data', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'II',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    expect(await obterGrauVigente(ctx, residente.id, new Date('2026-01-01'))).toBeNull()
  })

  it('é legível por ADMINISTRATIVO — necessário para relatório de convênio', async () => {
    const residente = await criarResidenteDeTeste()
    const saude = await ctxComPapel('SAUDE')
    await registrarAvaliacao(saude, {
      residenteId: residente.id,
      grau: 'II',
      dataAvaliacao: new Date('2026-02-01'),
      avaliadorNome: 'Enf. Ana',
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    expect(await obterGrauVigente(administrativo, residente.id)).toBe('II')
  })
})

describe('listarAvaliacoes', () => {
  it('devolve o histórico do mais recente para o mais antigo', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'I',
      dataAvaliacao: new Date('2026-01-10'),
      avaliadorNome: 'Enf. Ana',
    })
    await registrarAvaliacao(ctx, {
      residenteId: residente.id,
      grau: 'III',
      dataAvaliacao: new Date('2026-06-15'),
      avaliadorNome: 'Enf. Ana',
    })

    const historico = await listarAvaliacoes(ctx, residente.id)
    expect(historico.map((a) => a.grau)).toEqual(['III', 'I'])
  })
})
```

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/residents/dependencia.service.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar**

`src/modules/residents/dependencia.service.ts`:

```typescript
import { z } from 'zod'
import type { AvaliacaoDependencia, GrauDependencia } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const avaliacaoSchema = z.object({
  residenteId: z.string().cuid(),
  grau: z.enum(['I', 'II', 'III']),
  dataAvaliacao: z
    .date()
    .refine((data) => data.getTime() <= Date.now(), {
      message: 'A data da avaliação não pode estar no futuro',
    }),
  avaliadorNome: z.string().trim().min(3, 'Informe quem realizou a avaliação'),
  justificativa: z.string().trim().optional(),
})

export type DadosAvaliacao = z.infer<typeof avaliacaoSchema>

export async function registrarAvaliacao(
  ctx: Ctx,
  dados: DadosAvaliacao
): Promise<AvaliacaoDependencia> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE')
  const entrada = validar(avaliacaoSchema, dados)

  const residente = await prisma.residente.findUnique({
    where: { id: entrada.residenteId },
  })
  if (!residente) throw new ErroNaoEncontrado('Residente não encontrado')

  return prisma.$transaction(async (tx) => {
    const criada = await tx.avaliacaoDependencia.create({
      data: { ...entrada, avaliadorId: ctx.usuarioId, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'AvaliacaoDependencia',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { grau: { de: null, para: entrada.grau } },
    })

    return criada
  })
}

export async function obterGrauVigente(
  ctx: Ctx,
  residenteId: string,
  emData: Date = new Date()
): Promise<GrauDependencia | null> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  const avaliacao = await prisma.avaliacaoDependencia.findFirst({
    where: { residenteId, dataAvaliacao: { lte: emData } },
    orderBy: [{ dataAvaliacao: 'desc' }, { criadoEm: 'desc' }],
  })

  return avaliacao?.grau ?? null
}

export async function listarAvaliacoes(
  ctx: Ctx,
  residenteId: string
): Promise<AvaliacaoDependencia[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')

  return prisma.avaliacaoDependencia.findMany({
    where: { residenteId },
    orderBy: [{ dataAvaliacao: 'desc' }, { criadoEm: 'desc' }],
  })
}
```

O desempate por `criadoEm` cobre duas avaliações lançadas com a mesma data: vale a registrada por último.

`obterGrauVigente` é a única porta pela qual o papel ADMINISTRATIVO alcança dado clínico, exatamente como a spec §7 determina. Nenhum outro serviço de saúde aceita esse papel.

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/modules/residents`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona histórico de grau de dependência com grau vigente por data"
```

---

### Task 10: Responsáveis e familiares

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/residents/responsaveis.service.ts`
- Test: `src/modules/residents/responsaveis.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`, `calcularDiff`, `validarCpf`
- Produces:
  - `adicionarResponsavel(ctx, dados): Promise<Responsavel>`
  - `listarResponsaveis(ctx, residenteId): Promise<Responsavel[]>`
  - `atualizarResponsavel(ctx, id, dados): Promise<Responsavel>`
  - `removerResponsavel(ctx, id): Promise<void>` — exclusão lógica (`ativo = false`)

- [ ] **Step 1: Adicionar o modelo**

```prisma
model Responsavel {
  id                  String    @id @default(cuid())
  residenteId         String
  residente           Residente @relation(fields: [residenteId], references: [id])
  nome                String
  parentesco          String
  cpf                 String?
  telefonePrincipal   String
  telefoneSecundario  String?
  email               String?
  logradouro          String?
  numero              String?
  complemento         String?
  bairro              String?
  cidade              String?
  uf                  String?   @db.Char(2)
  cep                 String?
  ehResponsavelLegal  Boolean   @default(false)
  ehContatoEmergencia Boolean   @default(false)
  autorizadoVisitar   Boolean   @default(true)
  observacao          String?
  ativo               Boolean   @default(true)
  criadoEm            DateTime  @default(now())
  atualizadoEm        DateTime  @updatedAt
  criadoPorId         String?

  @@index([residenteId, ativo])
  @@map("responsaveis")
}
```

Relação inversa em `Residente`: `responsaveis Responsavel[]`.

```bash
npm run db:migrate -- --name responsaveis
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/residents/responsaveis.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  adicionarResponsavel,
  listarResponsaveis,
  atualizarResponsavel,
  removerResponsavel,
} from './responsaveis.service'

async function dadosBase() {
  const residente = await criarResidenteDeTeste()
  return {
    residenteId: residente.id,
    nome: 'João da Silva',
    parentesco: 'Filho',
    telefonePrincipal: '(51) 99999-0000',
    cpf: '529.982.247-25',
    ehResponsavelLegal: true,
    ehContatoEmergencia: true,
  }
}

describe('adicionarResponsavel', () => {
  it('cria o responsável e normaliza o CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()

    const responsavel = await adicionarResponsavel(ctx, dados)

    expect(responsavel.nome).toBe('João da Silva')
    expect(responsavel.cpf).toBe('52998224725')
    expect(responsavel.ativo).toBe(true)
  })

  it('recusa CPF inválido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()

    await expect(
      adicionarResponsavel(ctx, { ...dados, cpf: '111.111.111-11' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita a mesma pessoa como responsável por dois residentes', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const primeiro = await dadosBase()
    const outroResidente = await criarResidenteDeTeste()

    await adicionarResponsavel(ctx, primeiro)
    const segundo = await adicionarResponsavel(ctx, {
      ...primeiro,
      residenteId: outroResidente.id,
    })

    expect(segundo.cpf).toBe('52998224725')
  })

  it('nega para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const dados = await dadosBase()

    await expect(adicionarResponsavel(ctx, dados)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarResponsaveis', () => {
  it('lista apenas os ativos e é legível pelo papel SAUDE', async () => {
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(admin, dados)
    await adicionarResponsavel(admin, { ...dados, nome: 'Ana Silva', cpf: undefined })
    await removerResponsavel(admin, responsavel.id)

    const saude = await ctxComPapel('SAUDE')
    const lista = await listarResponsaveis(saude, dados.residenteId)

    expect(lista.map((r) => r.nome)).toEqual(['Ana Silva'])
  })
})

describe('removerResponsavel', () => {
  it('desativa sem apagar o registro', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(ctx, dados)

    await removerResponsavel(ctx, responsavel.id)

    const registro = await prisma.responsavel.findUniqueOrThrow({
      where: { id: responsavel.id },
    })
    expect(registro.ativo).toBe(false)
  })
})

describe('atualizarResponsavel', () => {
  it('audita o campo alterado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const dados = await dadosBase()
    const responsavel = await adicionarResponsavel(ctx, dados)

    await atualizarResponsavel(ctx, responsavel.id, {
      telefonePrincipal: '(51) 98888-1111',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Responsavel', acao: 'ATUALIZAR' },
    })
    expect(log.diff).toEqual({
      telefonePrincipal: { de: '(51) 99999-0000', para: '(51) 98888-1111' },
    })
  })
})
```

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/residents/responsaveis.service.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar**

`src/modules/residents/responsaveis.service.ts`:

```typescript
import { z } from 'zod'
import type { Responsavel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'

const responsavelSchema = z.object({
  residenteId: z.string().cuid(),
  nome: z.string().trim().min(3, 'Informe o nome do responsável'),
  parentesco: z.string().trim().min(2, 'Informe o parentesco'),
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor ? somenteDigitos(valor) : undefined))
    .refine((valor) => valor === undefined || validarCpf(valor), {
      message: 'CPF inválido',
    }),
  telefonePrincipal: z.string().trim().min(8, 'Informe um telefone de contato'),
  telefoneSecundario: z.string().trim().optional(),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase().optional(),
  cep: z.string().trim().optional(),
  ehResponsavelLegal: z.boolean().default(false),
  ehContatoEmergencia: z.boolean().default(false),
  autorizadoVisitar: z.boolean().default(true),
  observacao: z.string().trim().optional(),
})

const atualizacaoSchema = responsavelSchema.partial().omit({ residenteId: true })

export type DadosResponsavel = z.input<typeof responsavelSchema>
export type DadosAtualizacaoResponsavel = z.input<typeof atualizacaoSchema>

export async function adicionarResponsavel(
  ctx: Ctx,
  dados: DadosResponsavel
): Promise<Responsavel> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(responsavelSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.responsavel.create({
      data: { ...entrada, email: entrada.email || null, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Responsavel',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { nome: { de: null, para: criado.nome } },
    })

    return criado
  })
}

export async function listarResponsaveis(
  ctx: Ctx,
  residenteId: string
): Promise<Responsavel[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  return prisma.responsavel.findMany({
    where: { residenteId, ativo: true },
    orderBy: [{ ehResponsavelLegal: 'desc' }, { nome: 'asc' }],
  })
}

async function exigirResponsavel(id: string): Promise<Responsavel> {
  const responsavel = await prisma.responsavel.findUnique({ where: { id } })
  if (!responsavel) throw new ErroNaoEncontrado('Responsável não encontrado')
  return responsavel
}

export async function atualizarResponsavel(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoResponsavel
): Promise<Responsavel> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoSchema, dados)
  const atual = await exigirResponsavel(id)
  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.responsavel.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Responsavel',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff,
    })

    return atualizado
  })
}

export async function removerResponsavel(ctx: Ctx, id: string): Promise<void> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const atual = await exigirResponsavel(id)

  await prisma.$transaction(async (tx) => {
    await tx.responsavel.update({ where: { id }, data: { ativo: false } })
    await registrarAuditoria(tx, ctx, {
      acao: 'EXCLUIR',
      entidade: 'Responsavel',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { ativo: { de: true, para: false } },
    })
  })
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/modules/residents`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona cadastro de responsáveis com exclusão lógica"
```

---
### Task 11: Armazenamento de arquivos e documentos anexos

Mecanismo único de anexo do sistema — a Fase 2 usa para exames, a Fase 3 para comprovantes fiscais.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/arquivos.ts`
- Create: `src/modules/residents/documentos.service.ts`
- Create: `src/app/api/documentos/[id]/route.ts`
- Test: `src/lib/arquivos.test.ts`, `src/modules/residents/documentos.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`
- Produces:
  - `salvarArquivo(conteudo: Buffer, mimeType: string): Promise<ArquivoSalvo>` onde `ArquivoSalvo = { caminhoRelativo: string; hashSha256: string; tamanhoBytes: number }`
  - `lerArquivo(caminhoRelativo: string): Promise<Buffer>`
  - `anexarDocumento(ctx, dados): Promise<Documento>`
  - `listarDocumentos(ctx, alvo: { residenteId?: string; funcionarioId?: string }): Promise<Documento[]>`
  - `obterDocumentoParaDownload(ctx, id): Promise<{ documento: Documento; conteudo: Buffer }>` — audita `DOWNLOAD`

- [ ] **Step 1: Escrever os testes de `arquivos.ts` (devem falhar)**

`src/lib/arquivos.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ErroValidacao } from './erros'
import { salvarArquivo, lerArquivo } from './arquivos'

const pdfMinimo = Buffer.from('%PDF-1.4 conteúdo de teste')

describe('salvarArquivo', () => {
  it('grava e devolve caminho, hash e tamanho', async () => {
    const salvo = await salvarArquivo(pdfMinimo, 'application/pdf')

    expect(salvo.tamanhoBytes).toBe(pdfMinimo.length)
    expect(salvo.hashSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(salvo.caminhoRelativo).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/)

    const lido = await lerArquivo(salvo.caminhoRelativo)
    expect(lido.equals(pdfMinimo)).toBe(true)
  })

  it('gera nomes diferentes para conteúdos idênticos', async () => {
    const a = await salvarArquivo(pdfMinimo, 'application/pdf')
    const b = await salvarArquivo(pdfMinimo, 'application/pdf')
    expect(a.caminhoRelativo).not.toBe(b.caminhoRelativo)
    expect(a.hashSha256).toBe(b.hashSha256)
  })

  it('recusa tipo de arquivo não permitido', async () => {
    await expect(
      salvarArquivo(Buffer.from('MZ'), 'application/x-msdownload')
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa arquivo acima de 20 MB', async () => {
    const grande = Buffer.alloc(20 * 1024 * 1024 + 1)
    await expect(salvarArquivo(grande, 'application/pdf')).rejects.toThrow(ErroValidacao)
  })
})

describe('lerArquivo', () => {
  it('recusa caminho que escapa do diretório base', async () => {
    await expect(lerArquivo('../../.env')).rejects.toThrow(ErroValidacao)
    await expect(lerArquivo('/etc/passwd')).rejects.toThrow(ErroValidacao)
  })
})
```

O teste de path traversal é obrigatório: o identificador do documento vem da URL, e sem essa verificação um caminho manipulado leria qualquer arquivo do servidor.

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test -- src/lib/arquivos.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `arquivos.ts`**

```typescript
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ErroValidacao } from './erros'

const EXTENSAO_POR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024

export type ArquivoSalvo = {
  caminhoRelativo: string
  hashSha256: string
  tamanhoBytes: number
}

function diretorioBase(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? './data/uploads')
}

export async function salvarArquivo(
  conteudo: Buffer,
  mimeType: string
): Promise<ArquivoSalvo> {
  const extensao = EXTENSAO_POR_MIME[mimeType]
  if (!extensao) {
    throw new ErroValidacao('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.')
  }
  if (conteudo.length > TAMANHO_MAXIMO_BYTES) {
    throw new ErroValidacao('O arquivo excede o limite de 20 MB')
  }

  const agora = new Date()
  const ano = String(agora.getFullYear())
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const nome = `${randomUUID()}.${extensao}`
  const caminhoRelativo = `${ano}/${mes}/${nome}`
  const caminhoAbsoluto = path.join(diretorioBase(), caminhoRelativo)

  await mkdir(path.dirname(caminhoAbsoluto), { recursive: true })
  await writeFile(caminhoAbsoluto, conteudo)

  return {
    caminhoRelativo,
    hashSha256: createHash('sha256').update(conteudo).digest('hex'),
    tamanhoBytes: conteudo.length,
  }
}

export async function lerArquivo(caminhoRelativo: string): Promise<Buffer> {
  const base = diretorioBase()
  const alvo = path.resolve(base, caminhoRelativo)

  if (alvo !== base && !alvo.startsWith(base + path.sep)) {
    throw new ErroValidacao('Caminho de arquivo inválido')
  }

  return readFile(alvo)
}
```

O nome no disco é sempre um UUID gerado aqui — o nome enviado pelo usuário fica apenas como metadado no banco, nunca toca o sistema de arquivos.

- [ ] **Step 4: Adicionar o modelo `Documento` ao schema**

```prisma
enum TipoDocumento {
  RG
  CPF
  CNS
  CERTIDAO
  LAUDO
  PROCURACAO
  TERMO_RESPONSABILIDADE
  TERMO_LGPD
  FOTO
  EXAME
  COMPROVANTE_FISCAL
  CONSELHO_PROFISSIONAL
  OUTRO
}

model Documento {
  id                  String        @id @default(cuid())
  tipo                TipoDocumento
  descricao           String?
  nomeArquivoOriginal String
  caminhoArmazenamento String
  mimeType            String
  tamanhoBytes        Int
  hashSha256          String
  residenteId         String?
  residente           Residente?    @relation(fields: [residenteId], references: [id])
  funcionarioId       String?
  ativo               Boolean       @default(true)
  criadoEm            DateTime      @default(now())
  criadoPorId         String?

  @@index([residenteId, ativo])
  @@index([funcionarioId, ativo])
  @@map("documentos")
}
```

Relação inversa em `Residente`: `documentos Documento[]`.

```bash
npm run db:migrate -- --name documentos
npm run db:migrate:test
```

- [ ] **Step 5: Escrever os testes do serviço (devem falhar)**

`src/modules/residents/documentos.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  anexarDocumento,
  listarDocumentos,
  obterDocumentoParaDownload,
} from './documentos.service'

const conteudo = Buffer.from('%PDF-1.4 laudo')

describe('anexarDocumento', () => {
  it('grava o arquivo e o metadado, e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg maria.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    expect(documento.nomeArquivoOriginal).toBe('rg maria.pdf')
    expect(documento.caminhoArmazenamento).not.toContain('rg maria')
    expect(documento.tamanhoBytes).toBe(conteudo.length)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Documento', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })
})

describe('obterDocumentoParaDownload', () => {
  it('entrega o conteúdo e registra o download na auditoria', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const documento = await anexarDocumento(ctx, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const resultado = await obterDocumentoParaDownload(ctx, documento.id)

    expect(resultado.conteudo.equals(conteudo)).toBe(true)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Documento', acao: 'DOWNLOAD' },
    })
    expect(log.entidadeId).toBe(documento.id)
  })

  it('nega documento clínico ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      obterDocumentoParaDownload(administrativo, exame.id)
    ).rejects.toThrow(ErroPermissao)
  })

  it('nega documento fiscal ao papel SAUDE', async () => {
    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()
    const comprovante = await anexarDocumento(administrativo, {
      tipo: 'COMPROVANTE_FISCAL',
      nomeArquivoOriginal: 'nota.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const saude = await ctxComPapel('SAUDE')
    await expect(
      obterDocumentoParaDownload(saude, comprovante.id)
    ).rejects.toThrow(ErroPermissao)
  })

  it('permite documento cadastral aos três papéis', async () => {
    const admin = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()
    const rg = await anexarDocumento(admin, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const resultado = await obterDocumentoParaDownload(ctx, rg.id)
      expect(resultado.documento.id).toBe(rg.id)
    }
  })
})

describe('listarDocumentos', () => {
  it('omite da lista os documentos que o papel não pode ver', async () => {
    const saude = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await anexarDocumento(saude, {
      tipo: 'EXAME',
      nomeArquivoOriginal: 'hemograma.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })
    await anexarDocumento(saude, {
      tipo: 'RG',
      nomeArquivoOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      conteudo,
      residenteId: residente.id,
    })

    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const lista = await listarDocumentos(administrativo, { residenteId: residente.id })

    expect(lista.map((d) => d.tipo)).toEqual(['RG'])
  })
})
```

- [ ] **Step 6: Implementar o serviço**

`src/modules/residents/documentos.service.ts`:

```typescript
import { z } from 'zod'
import type { Documento, Papel, TipoDocumento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { salvarArquivo, lerArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

const TODOS: Papel[] = ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO']
const CLINICO: Papel[] = ['COORDENACAO', 'SAUDE']
const FINANCEIRO_E_PESSOAL: Papel[] = ['COORDENACAO', 'ADMINISTRATIVO']

export function papeisQuePodemVer(documento: {
  tipo: TipoDocumento
  funcionarioId: string | null
}): Papel[] {
  if (documento.funcionarioId) return FINANCEIRO_E_PESSOAL
  if (documento.tipo === 'EXAME' || documento.tipo === 'LAUDO') return CLINICO
  if (documento.tipo === 'COMPROVANTE_FISCAL') return FINANCEIRO_E_PESSOAL
  return TODOS
}

const anexoSchema = z
  .object({
    tipo: z.enum([
      'RG', 'CPF', 'CNS', 'CERTIDAO', 'LAUDO', 'PROCURACAO',
      'TERMO_RESPONSABILIDADE', 'TERMO_LGPD', 'FOTO', 'EXAME',
      'COMPROVANTE_FISCAL', 'CONSELHO_PROFISSIONAL', 'OUTRO',
    ]),
    descricao: z.string().trim().optional(),
    nomeArquivoOriginal: z.string().trim().min(1, 'Informe o nome do arquivo'),
    mimeType: z.string().trim().min(1),
    conteudo: z.instanceof(Buffer),
    residenteId: z.string().cuid().optional(),
    funcionarioId: z.string().cuid().optional(),
  })
  .refine((d) => Boolean(d.residenteId) !== Boolean(d.funcionarioId), {
    message: 'Informe exatamente um vínculo: residente ou funcionário',
  })

export type DadosAnexo = z.input<typeof anexoSchema>

export async function anexarDocumento(ctx: Ctx, dados: DadosAnexo): Promise<Documento> {
  const entrada = validar(anexoSchema, dados)
  exigirPapel(
    ctx,
    ...papeisQuePodemVer({
      tipo: entrada.tipo,
      funcionarioId: entrada.funcionarioId ?? null,
    })
  )

  const salvo = await salvarArquivo(entrada.conteudo, entrada.mimeType)

  return prisma.$transaction(async (tx) => {
    const criado = await tx.documento.create({
      data: {
        tipo: entrada.tipo,
        descricao: entrada.descricao,
        nomeArquivoOriginal: entrada.nomeArquivoOriginal,
        caminhoArmazenamento: salvo.caminhoRelativo,
        mimeType: entrada.mimeType,
        tamanhoBytes: salvo.tamanhoBytes,
        hashSha256: salvo.hashSha256,
        residenteId: entrada.residenteId,
        funcionarioId: entrada.funcionarioId,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Documento',
      entidadeId: criado.id,
      residenteId: entrada.residenteId,
      diff: { tipo: { de: null, para: criado.tipo } },
    })

    return criado
  })
}

export async function listarDocumentos(
  ctx: Ctx,
  alvo: { residenteId?: string; funcionarioId?: string }
): Promise<Documento[]> {
  exigirPapel(ctx, ...TODOS)

  const documentos = await prisma.documento.findMany({
    where: { ...alvo, ativo: true },
    orderBy: { criadoEm: 'desc' },
  })

  return documentos.filter((documento) =>
    papeisQuePodemVer(documento).includes(ctx.papel)
  )
}

export async function obterDocumentoParaDownload(
  ctx: Ctx,
  id: string
): Promise<{ documento: Documento; conteudo: Buffer }> {
  const documento = await prisma.documento.findUnique({ where: { id } })
  if (!documento || !documento.ativo) {
    throw new ErroNaoEncontrado('Documento não encontrado')
  }

  if (!papeisQuePodemVer(documento).includes(ctx.papel)) {
    throw new ErroPermissao()
  }

  const conteudo = await lerArquivo(documento.caminhoArmazenamento)

  await registrarAuditoria(prisma, ctx, {
    acao: 'DOWNLOAD',
    entidade: 'Documento',
    entidadeId: id,
    residenteId: documento.residenteId ?? undefined,
  })

  return { documento, conteudo }
}
```

`listarDocumentos` filtra em vez de recusar: um usuário do administrativo vendo a aba de documentos de um residente enxerga os cadastrais e simplesmente não vê que existem exames — o que também evita vazar por omissão a informação de que há um exame ali.

- [ ] **Step 7: Criar a rota autenticada de download**

`src/app/api/documentos/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { obterCtx } from '@/modules/auth/sessao'
import { obterDocumentoParaDownload } from '@/modules/residents/documentos.service'
import { ErroNaoEncontrado, ErroPermissao } from '@/lib/erros'

export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const ctx = await obterCtx()
    const { documento, conteudo } = await obterDocumentoParaDownload(ctx, id)

    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        'Content-Type': documento.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(documento.nomeArquivoOriginal)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (erro) {
    if (erro instanceof ErroPermissao) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
    }
    if (erro instanceof ErroNaoEncontrado) {
      return NextResponse.json({ erro: 'Documento não encontrado' }, { status: 404 })
    }
    throw erro
  }
}
```

`Cache-Control: private, no-store` impede que um proxy ou o próprio navegador guarde cópia de documento pessoal em cache compartilhado.

- [ ] **Step 8: Rodar os testes**

Run: `npm test -- src/lib/arquivos.test.ts src/modules/residents`
Expected: PASS em todos.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Adiciona anexo de documentos com download autenticado e auditado"
```

---

### Task 12: Anotações gerais

Implementa a regra R3: janela de edição curta, depois só retificação.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/residents/anotacoes.service.ts`
- Test: `src/modules/residents/anotacoes.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`
- Produces:
  - `JANELA_EDICAO_MINUTOS = 15`
  - `criarAnotacao(ctx, dados: { residenteId, categoria, texto }): Promise<Anotacao>`
  - `listarAnotacoes(ctx, residenteId): Promise<Anotacao[]>`
  - `editarAnotacao(ctx, id, texto: string): Promise<Anotacao>`
  - `retificarAnotacao(ctx, id, dados: { categoria?, texto }): Promise<Anotacao>`

- [ ] **Step 1: Adicionar o modelo**

```prisma
enum CategoriaAnotacao {
  COMPORTAMENTO
  VISITA_FAMILIA
  OCORRENCIA
  SOCIAL
  JURIDICO
  OUTRO
}

model Anotacao {
  id                 String            @id @default(cuid())
  residenteId        String
  residente          Residente         @relation(fields: [residenteId], references: [id])
  categoria          CategoriaAnotacao
  texto              String
  editavelAte        DateTime
  retificaAnotacaoId String?
  retificaAnotacao   Anotacao?         @relation("Retificacao", fields: [retificaAnotacaoId], references: [id])
  retificacoes       Anotacao[]        @relation("Retificacao")
  criadoEm           DateTime          @default(now())
  atualizadoEm       DateTime          @updatedAt
  criadoPorId        String

  @@index([residenteId, criadoEm])
  @@map("anotacoes")
}
```

Relação inversa em `Residente`: `anotacoes Anotacao[]`.

Note que `criadoPorId` aqui é obrigatório: anotação sem autor não existe.

```bash
npm run db:migrate -- --name anotacoes
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/residents/anotacoes.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import {
  criarAnotacao,
  listarAnotacoes,
  editarAnotacao,
  retificarAnotacao,
} from './anotacoes.service'

async function anotacaoBase() {
  const residente = await criarResidenteDeTeste()
  const ctx = await ctxComPapel('SAUDE')
  const anotacao = await criarAnotacao(ctx, {
    residenteId: residente.id,
    categoria: 'VISITA_FAMILIA',
    texto: 'Recebeu visita da filha na tarde de hoje.',
  })
  return { residente, ctx, anotacao }
}

describe('criarAnotacao', () => {
  it('é permitida aos três papéis e grava o autor', async () => {
    const residente = await criarResidenteDeTeste()

    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      const anotacao = await criarAnotacao(ctx, {
        residenteId: residente.id,
        categoria: 'OUTRO',
        texto: 'Registro de teste com texto suficiente.',
      })
      expect(anotacao.criadoPorId).toBe(ctx.usuarioId)
    }
  })

  it('define a janela de edição em 15 minutos', async () => {
    const { anotacao } = await anotacaoBase()
    const janelaMinutos =
      (anotacao.editavelAte.getTime() - anotacao.criadoEm.getTime()) / 60_000
    expect(Math.round(janelaMinutos)).toBe(15)
  })

  it('recusa texto vazio', async () => {
    const residente = await criarResidenteDeTeste()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarAnotacao(ctx, { residenteId: residente.id, categoria: 'OUTRO', texto: '   ' })
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('editarAnotacao', () => {
  it('permite ao autor editar dentro da janela', async () => {
    const { ctx, anotacao } = await anotacaoBase()

    const editada = await editarAnotacao(ctx, anotacao.id, 'Texto corrigido pelo autor.')

    expect(editada.texto).toBe('Texto corrigido pelo autor.')
  })

  it('recusa edição após a janela', async () => {
    const { ctx, anotacao } = await anotacaoBase()
    await prisma.anotacao.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })

    await expect(
      editarAnotacao(ctx, anotacao.id, 'Tentativa tardia.')
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa edição por outro usuário, mesmo da coordenação', async () => {
    const { anotacao } = await anotacaoBase()
    const outro = await ctxComPapel('COORDENACAO')

    await expect(
      editarAnotacao(outro, anotacao.id, 'Editando anotação alheia.')
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('retificarAnotacao', () => {
  it('cria uma nova anotação vinculada e preserva a original intacta', async () => {
    const { anotacao } = await anotacaoBase()
    await prisma.anotacao.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })
    const outro = await ctxComPapel('COORDENACAO')

    const retificacao = await retificarAnotacao(outro, anotacao.id, {
      texto: 'Correção: a visita foi da sobrinha, não da filha.',
    })

    expect(retificacao.retificaAnotacaoId).toBe(anotacao.id)
    expect(retificacao.categoria).toBe('VISITA_FAMILIA')

    const original = await prisma.anotacao.findUniqueOrThrow({ where: { id: anotacao.id } })
    expect(original.texto).toBe('Recebeu visita da filha na tarde de hoje.')
  })

  it('registra a retificação na auditoria apontando para a original', async () => {
    const { anotacao, ctx } = await anotacaoBase()

    const retificacao = await retificarAnotacao(ctx, anotacao.id, {
      texto: 'Correção do registro anterior.',
    })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Anotacao', acao: 'CRIAR', entidadeId: retificacao.id },
    })
    expect(log.diff).toEqual({
      retificaAnotacaoId: { de: null, para: anotacao.id },
    })
  })
})

describe('listarAnotacoes', () => {
  it('devolve da mais recente para a mais antiga', async () => {
    const { residente, ctx } = await anotacaoBase()
    await criarAnotacao(ctx, {
      residenteId: residente.id,
      categoria: 'OCORRENCIA',
      texto: 'Segunda anotação registrada.',
    })

    const lista = await listarAnotacoes(ctx, residente.id)

    expect(lista).toHaveLength(2)
    expect(lista[0].texto).toBe('Segunda anotação registrada.')
  })
})
```

O teste de edição por outro usuário inclui a coordenação de propósito: nem o perfil mais alto reescreve texto assinado por outra pessoa. Corrigir o registro de outro é retificação, e retificação deixa rastro.

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/residents/anotacoes.service.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar**

`src/modules/residents/anotacoes.service.ts`:

```typescript
import { z } from 'zod'
import type { Anotacao } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

export const JANELA_EDICAO_MINUTOS = 15

const categoriaSchema = z.enum([
  'COMPORTAMENTO',
  'VISITA_FAMILIA',
  'OCORRENCIA',
  'SOCIAL',
  'JURIDICO',
  'OUTRO',
])

const novaAnotacaoSchema = z.object({
  residenteId: z.string().cuid(),
  categoria: categoriaSchema,
  texto: z.string().trim().min(3, 'Escreva o conteúdo da anotação'),
})

const retificacaoSchema = z.object({
  categoria: categoriaSchema.optional(),
  texto: z.string().trim().min(3, 'Escreva o conteúdo da retificação'),
})

export type DadosNovaAnotacao = z.infer<typeof novaAnotacaoSchema>
export type DadosRetificacao = z.infer<typeof retificacaoSchema>

async function exigirAnotacao(id: string): Promise<Anotacao> {
  const anotacao = await prisma.anotacao.findUnique({ where: { id } })
  if (!anotacao) throw new ErroNaoEncontrado('Anotação não encontrada')
  return anotacao
}

export async function criarAnotacao(
  ctx: Ctx,
  dados: DadosNovaAnotacao
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(novaAnotacaoSchema, dados)

  return prisma.$transaction(async (tx) => {
    const criada = await tx.anotacao.create({
      data: {
        ...entrada,
        editavelAte: new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000),
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Anotacao',
      entidadeId: criada.id,
      residenteId: entrada.residenteId,
      diff: { categoria: { de: null, para: criada.categoria } },
    })

    return criada
  })
}

export async function listarAnotacoes(
  ctx: Ctx,
  residenteId: string
): Promise<Anotacao[]> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  return prisma.anotacao.findMany({
    where: { residenteId },
    orderBy: { criadoEm: 'desc' },
  })
}

export async function editarAnotacao(
  ctx: Ctx,
  id: string,
  texto: string
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const atual = await exigirAnotacao(id)

  if (atual.criadoPorId !== ctx.usuarioId) {
    throw new ErroPermissao('Só o autor pode editar a própria anotação')
  }
  if (atual.editavelAte.getTime() < Date.now()) {
    throw new ErroValidacao(
      `A janela de ${JANELA_EDICAO_MINUTOS} minutos para edição expirou. Registre uma retificação.`
    )
  }

  const novoTexto = validar(z.string().trim().min(3, 'Escreva o conteúdo da anotação'), texto)

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.anotacao.update({
      where: { id },
      data: { texto: novoTexto },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Anotacao',
      entidadeId: id,
      residenteId: atual.residenteId,
      diff: { texto: { de: atual.texto, para: novoTexto } },
    })

    return atualizada
  })
}

export async function retificarAnotacao(
  ctx: Ctx,
  id: string,
  dados: DadosRetificacao
): Promise<Anotacao> {
  exigirPapel(ctx, 'COORDENACAO', 'SAUDE', 'ADMINISTRATIVO')
  const entrada = validar(retificacaoSchema, dados)
  const original = await exigirAnotacao(id)

  return prisma.$transaction(async (tx) => {
    const retificacao = await tx.anotacao.create({
      data: {
        residenteId: original.residenteId,
        categoria: entrada.categoria ?? original.categoria,
        texto: entrada.texto,
        editavelAte: new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000),
        retificaAnotacaoId: original.id,
        criadoPorId: ctx.usuarioId,
      },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Anotacao',
      entidadeId: retificacao.id,
      residenteId: original.residenteId,
      diff: { retificaAnotacaoId: { de: null, para: original.id } },
    })

    return retificacao
  })
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/modules/residents`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona anotações gerais com janela de edição e retificação"
```

---

### Task 13: Cadastro de funcionários

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/staff/funcionarios.schema.ts`
- Create: `src/modules/staff/funcionarios.service.ts`
- Test: `src/modules/staff/funcionarios.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`, `registrarAuditoria`, `calcularDiff`, `validarCpf`
- Produces:
  - `criarFuncionario(ctx, dados): Promise<Funcionario>`
  - `listarFuncionarios(ctx, filtro?: { busca?: string; apenasAtivos?: boolean }): Promise<Funcionario[]>`
  - `obterFuncionario(ctx, id): Promise<Funcionario>`
  - `atualizarFuncionario(ctx, id, dados): Promise<Funcionario>`
  - `desligarFuncionario(ctx, id, dados: { dataDesligamento: Date; motivoDesligamento: string }): Promise<Funcionario>`
  - `listarConselhosVencendo(ctx, ateDias: number): Promise<Funcionario[]>`

- [ ] **Step 1: Adicionar o modelo**

```prisma
enum VinculoFuncionario {
  CLT
  VOLUNTARIO
  PRESTADOR
  ESTAGIO
}

model Funcionario {
  id                  String             @id @default(cuid())
  nomeCompleto        String
  cpf                 String             @unique
  rg                  String?
  cargo               String
  vinculo             VinculoFuncionario
  dataAdmissao        DateTime           @db.Date
  dataDesligamento    DateTime?          @db.Date
  motivoDesligamento  String?
  telefone            String?
  email               String?
  logradouro          String?
  numero              String?
  bairro              String?
  cidade              String?
  uf                  String?            @db.Char(2)
  cep                 String?
  conselhoSigla       String?
  conselhoNumero      String?
  conselhoUf          String?            @db.Char(2)
  conselhoValidade    DateTime?          @db.Date
  ativo               Boolean            @default(true)
  criadoEm            DateTime           @default(now())
  atualizadoEm        DateTime           @updatedAt
  criadoPorId         String?

  @@index([ativo, nomeCompleto])
  @@map("funcionarios")
}
```

```bash
npm run db:migrate -- --name funcionarios
npm run db:migrate:test
```

- [ ] **Step 2: Escrever os testes (devem falhar)**

`src/modules/staff/funcionarios.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import {
  criarFuncionario,
  listarFuncionarios,
  atualizarFuncionario,
  desligarFuncionario,
  listarConselhosVencendo,
} from './funcionarios.service'

const dadosValidos = {
  nomeCompleto: 'Ana Paula Souza',
  cpf: '529.982.247-25',
  cargo: 'Técnica de enfermagem',
  vinculo: 'CLT' as const,
  dataAdmissao: new Date('2025-02-01'),
  conselhoSigla: 'COREN',
  conselhoNumero: '123456',
  conselhoUf: 'RS',
  conselhoValidade: new Date('2027-03-31'),
}

describe('criarFuncionario', () => {
  it('cria e normaliza o CPF', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    expect(funcionario.cpf).toBe('52998224725')
    expect(funcionario.ativo).toBe(true)
  })

  it('exige CPF válido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      criarFuncionario(ctx, { ...dadosValidos, cpf: '123.456.789-00' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa CPF duplicado', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarFuncionario(ctx, dadosValidos)
    await expect(criarFuncionario(ctx, dadosValidos)).rejects.toThrow(ErroValidacao)
  })

  it('nega para o papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(criarFuncionario(ctx, dadosValidos)).rejects.toThrow(ErroPermissao)
  })
})

describe('listarFuncionarios', () => {
  it('filtra ativos e busca por nome ou cargo', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const ana = await criarFuncionario(ctx, dadosValidos)
    await criarFuncionario(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Carlos Lima',
      cpf: '11144477735',
      cargo: 'Cozinheiro',
      conselhoSigla: undefined,
      conselhoNumero: undefined,
      conselhoUf: undefined,
      conselhoValidade: undefined,
    })
    await desligarFuncionario(ctx, ana.id, {
      dataDesligamento: new Date('2026-05-30'),
      motivoDesligamento: 'Pedido de demissão',
    })

    const ativos = await listarFuncionarios(ctx, { apenasAtivos: true })
    expect(ativos.map((f) => f.nomeCompleto)).toEqual(['Carlos Lima'])

    const porCargo = await listarFuncionarios(ctx, { busca: 'cozinh' })
    expect(porCargo).toHaveLength(1)
  })

  it('nega leitura ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(listarFuncionarios(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('desligarFuncionario', () => {
  it('marca inativo sem apagar e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await desligarFuncionario(ctx, funcionario.id, {
      dataDesligamento: new Date('2026-05-30'),
      motivoDesligamento: 'Pedido de demissão',
    })

    const registro = await prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionario.id },
    })
    expect(registro.ativo).toBe(false)
    expect(registro.dataDesligamento).not.toBeNull()

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Funcionario', acao: 'ATUALIZAR' },
    })
    expect(log.entidadeId).toBe(funcionario.id)
  })

  it('recusa desligamento anterior à admissão', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const funcionario = await criarFuncionario(ctx, dadosValidos)

    await expect(
      desligarFuncionario(ctx, funcionario.id, {
        dataDesligamento: new Date('2024-01-01'),
        motivoDesligamento: 'Erro de digitação',
      })
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('listarConselhosVencendo', () => {
  it('lista apenas ativos com conselho vencendo no prazo', async () => {
    const ctx = await ctxComPapel('COORDENACAO')
    const emVinteDias = new Date(Date.now() + 20 * 86_400_000)

    await criarFuncionario(ctx, { ...dadosValidos, conselhoValidade: emVinteDias })
    await criarFuncionario(ctx, {
      ...dadosValidos,
      nomeCompleto: 'Beatriz Nunes',
      cpf: '11144477735',
      conselhoValidade: new Date(Date.now() + 200 * 86_400_000),
    })

    const vencendo = await listarConselhosVencendo(ctx, 30)

    expect(vencendo.map((f) => f.nomeCompleto)).toEqual(['Ana Paula Souza'])
  })
})
```

`listarConselhosVencendo` existe porque registro profissional vencido é apontamento certo em fiscalização de ILPI, e ninguém acompanha data de validade em pasta de papel.

- [ ] **Step 3: Rodar para confirmar a falha**

Run: `npm test -- src/modules/staff`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Escrever os schemas**

`src/modules/staff/funcionarios.schema.ts`:

```typescript
import { z } from 'zod'
import { validarCpf, somenteDigitos } from '@/lib/ptbr'

export const novoFuncionarioSchema = z.object({
  nomeCompleto: z.string().trim().min(3, 'Informe o nome completo'),
  cpf: z
    .string()
    .trim()
    .transform(somenteDigitos)
    .refine(validarCpf, { message: 'CPF inválido' }),
  rg: z.string().trim().optional(),
  cargo: z.string().trim().min(2, 'Informe o cargo'),
  vinculo: z.enum(['CLT', 'VOLUNTARIO', 'PRESTADOR', 'ESTAGIO']),
  dataAdmissao: z.date(),
  telefone: z.string().trim().optional(),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  cep: z.string().trim().optional(),
  conselhoSigla: z.string().trim().optional(),
  conselhoNumero: z.string().trim().optional(),
  conselhoUf: z.string().trim().length(2).toUpperCase().optional(),
  conselhoValidade: z.date().optional(),
})

export const atualizacaoFuncionarioSchema = novoFuncionarioSchema.partial()

export const desligamentoFuncionarioSchema = z.object({
  dataDesligamento: z.date(),
  motivoDesligamento: z.string().trim().min(3, 'Informe o motivo do desligamento'),
})

export type DadosNovoFuncionario = z.input<typeof novoFuncionarioSchema>
export type DadosAtualizacaoFuncionario = z.input<typeof atualizacaoFuncionarioSchema>
export type DadosDesligamentoFuncionario = z.infer<typeof desligamentoFuncionarioSchema>
```

- [ ] **Step 5: Implementar o serviço**

`src/modules/staff/funcionarios.service.ts`:

```typescript
import type { Funcionario, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { validar } from '@/lib/validacao'
import { calcularDiff, registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  novoFuncionarioSchema,
  atualizacaoFuncionarioSchema,
  desligamentoFuncionarioSchema,
  type DadosNovoFuncionario,
  type DadosAtualizacaoFuncionario,
  type DadosDesligamentoFuncionario,
} from './funcionarios.schema'

async function exigirFuncionario(id: string): Promise<Funcionario> {
  const funcionario = await prisma.funcionario.findUnique({ where: { id } })
  if (!funcionario) throw new ErroNaoEncontrado('Funcionário não encontrado')
  return funcionario
}

export async function criarFuncionario(
  ctx: Ctx,
  dados: DadosNovoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(novoFuncionarioSchema, dados)

  const existente = await prisma.funcionario.findUnique({ where: { cpf: entrada.cpf } })
  if (existente) throw new ErroValidacao('Já existe um funcionário com este CPF')

  return prisma.$transaction(async (tx) => {
    const criado = await tx.funcionario.create({
      data: { ...entrada, email: entrada.email || null, criadoPorId: ctx.usuarioId },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'CRIAR',
      entidade: 'Funcionario',
      entidadeId: criado.id,
      diff: { nomeCompleto: { de: null, para: criado.nomeCompleto } },
    })

    return criado
  })
}

export async function obterFuncionario(ctx: Ctx, id: string): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  return exigirFuncionario(id)
}

export async function listarFuncionarios(
  ctx: Ctx,
  filtro: { busca?: string; apenasAtivos?: boolean } = {}
): Promise<Funcionario[]> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')

  const where: Prisma.FuncionarioWhereInput = {}
  if (filtro.apenasAtivos) where.ativo = true
  if (filtro.busca?.trim()) {
    where.OR = [
      { nomeCompleto: { contains: filtro.busca.trim(), mode: 'insensitive' } },
      { cargo: { contains: filtro.busca.trim(), mode: 'insensitive' } },
    ]
  }

  return prisma.funcionario.findMany({ where, orderBy: { nomeCompleto: 'asc' } })
}

export async function atualizarFuncionario(
  ctx: Ctx,
  id: string,
  dados: DadosAtualizacaoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(atualizacaoFuncionarioSchema, dados)
  const atual = await exigirFuncionario(id)

  if (entrada.cpf && entrada.cpf !== atual.cpf) {
    const existente = await prisma.funcionario.findUnique({ where: { cpf: entrada.cpf } })
    if (existente) throw new ErroValidacao('Já existe um funcionário com este CPF')
  }

  const diff = calcularDiff(atual as unknown as Record<string, unknown>, entrada)

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.funcionario.update({ where: { id }, data: entrada })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Funcionario',
      entidadeId: id,
      diff,
    })

    return atualizado
  })
}

export async function desligarFuncionario(
  ctx: Ctx,
  id: string,
  dados: DadosDesligamentoFuncionario
): Promise<Funcionario> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')
  const entrada = validar(desligamentoFuncionarioSchema, dados)
  const atual = await exigirFuncionario(id)

  if (!atual.ativo) throw new ErroValidacao('Este funcionário já está desligado')
  if (entrada.dataDesligamento < atual.dataAdmissao) {
    throw new ErroValidacao('A data de desligamento não pode ser anterior à admissão')
  }

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.funcionario.update({
      where: { id },
      data: { ...entrada, ativo: false },
    })

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'Funcionario',
      entidadeId: id,
      diff: { ativo: { de: true, para: false } },
    })

    return atualizado
  })
}

export async function listarConselhosVencendo(
  ctx: Ctx,
  ateDias: number
): Promise<Funcionario[]> {
  exigirPapel(ctx, 'COORDENACAO', 'ADMINISTRATIVO')

  const limite = new Date(Date.now() + ateDias * 86_400_000)

  return prisma.funcionario.findMany({
    where: { ativo: true, conselhoValidade: { not: null, lte: limite } },
    orderBy: { conselhoValidade: 'asc' },
  })
}
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- src/modules/staff`
Expected: PASS em todos.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Adiciona cadastro de funcionários com controle de conselho profissional"
```

---
### Task 14: Telas de residentes

Primeira entrega visível: layout autenticado, lista, cadastro e ficha do residente com as abas de responsáveis, documentos, anotações e grau de dependência.

**Files:**
- Create: `src/lib/acoes.ts`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/residentes/page.tsx`
- Create: `src/app/(app)/residentes/acoes.ts`
- Create: `src/app/(app)/residentes/novo/page.tsx`
- Create: `src/app/(app)/residentes/[id]/page.tsx`
- Create: `src/components/campo.tsx`
- Create: `src/components/formulario-simples.tsx`
- Create: `src/components/formulario-residente.tsx`
- Create: `src/components/formularios-ficha.tsx`
- Create: `src/components/formulario-documento.tsx`
- Modify: `playwright.config.ts`
- Test: `tests/e2e/auth.setup.ts`, `tests/e2e/residentes.spec.ts`

**Interfaces:**
- Consumes: todos os serviços de `residents`, `obterCtx`
- Produces:
  - `type EstadoAcao = { erro?: string; sucesso?: boolean }`
  - `executarAcao<T>(fn: () => Promise<T>): Promise<EstadoAcao>` — converte erros de domínio em mensagem para o formulário
  - `CAMPOS_RESIDENTE` — metadados dos campos, usados pelo formulário

- [ ] **Step 1: Criar o adaptador de erros para Server Actions**

`src/lib/acoes.ts`:

```typescript
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from './erros'

export type EstadoAcao = { erro?: string; sucesso?: boolean }

export async function executarAcao<T>(fn: () => Promise<T>): Promise<EstadoAcao> {
  try {
    await fn()
    return { sucesso: true }
  } catch (erro) {
    if (
      erro instanceof ErroValidacao ||
      erro instanceof ErroPermissao ||
      erro instanceof ErroNaoEncontrado
    ) {
      return { erro: erro.message }
    }
    console.error(erro)
    return { erro: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
```

Erros de domínio viram mensagem para o usuário; qualquer outro vira mensagem genérica e vai para o log do servidor. Detalhe de exceção interna na tela é vazamento de informação.

- [ ] **Step 2: Criar o layout autenticado com navegação por papel**

`src/app/(app)/layout.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Papel } from '@prisma/client'
import { obterCtxOuNulo } from '@/modules/auth/sessao'
import { signOut } from '@/modules/auth/config'

const ITENS: { href: string; rotulo: string; papeis: Papel[] }[] = [
  { href: '/residentes', rotulo: 'Residentes', papeis: ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] },
  { href: '/funcionarios', rotulo: 'Funcionários', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
  { href: '/usuarios', rotulo: 'Usuários', papeis: ['COORDENACAO'] },
  { href: '/auditoria', rotulo: 'Auditoria', papeis: ['COORDENACAO'] },
]

export default async function LayoutAutenticado({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await obterCtxOuNulo()
  if (!ctx) redirect('/login')

  const itens = ITENS.filter((item) => item.papeis.includes(ctx.papel))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-3">
          <span className="font-semibold text-slate-800">Lar de Idosos</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="text-sm text-slate-600 underline">
              Sair
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-3">{children}</main>
    </div>
  )
}
```

A navegação é montada a partir do papel, mas isso é conveniência — quem barra o acesso é o serviço. Digitar `/usuarios` na barra de endereço com papel de saúde falha no serviço, não só no menu.

- [ ] **Step 3: Criar o componente de campo e os metadados do formulário**

`src/components/campo.tsx`:

```tsx
export type PropsCampo = {
  nome: string
  rotulo: string
  tipo?: 'text' | 'date' | 'number' | 'email'
  obrigatorio?: boolean
  opcoes?: { valor: string; rotulo: string }[]
  valorInicial?: string
}

export function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio,
  opcoes,
  valorInicial,
}: PropsCampo) {
  const classe = 'w-full rounded border border-slate-300 px-3 py-2 text-base'

  return (
    <div className="space-y-1">
      <label htmlFor={nome} className="text-sm font-medium text-slate-700">
        {rotulo}
        {obrigatorio && <span className="text-red-600"> *</span>}
      </label>
      {opcoes ? (
        <select id={nome} name={nome} required={obrigatorio} defaultValue={valorInicial} className={classe}>
          <option value="">Selecione…</option>
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={nome}
          name={nome}
          type={tipo}
          required={obrigatorio}
          defaultValue={valorInicial}
          className={classe}
        />
      )}
    </div>
  )
}
```

`text-base` (16px) nos campos é deliberado: em iOS, fonte menor faz o navegador dar zoom automático ao focar o campo, o que atrapalha justamente quem está usando o celular em pé no corredor.

`src/components/formulario-simples.tsx` — o formulário genérico usado por todas as telas de cadastro e por cada seção da ficha:

```tsx
'use client'

import { useActionState } from 'react'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'

export function FormularioSimples({
  acao,
  campos,
  rotuloBotao,
  ocultos = {},
  colunas = 2,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  campos: PropsCampo[]
  rotuloBotao: string
  ocultos?: Record<string, string>
  colunas?: 1 | 2
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)

  return (
    <form action={enviar} className="space-y-4">
      {Object.entries(ocultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}

      <div className={colunas === 2 ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>
        {campos.map((campo) => (
          <Campo key={campo.nome} {...campo} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      {estado?.sucesso && (
        <p role="status" className="text-sm text-green-700">
          Registro salvo.
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60 sm:w-auto"
      >
        {enviando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}
```

`src/components/formulario-residente.tsx` — variante que preenche valores iniciais a partir de um residente existente:

```tsx
'use client'

import { useActionState } from 'react'
import type { Residente } from '@prisma/client'
import { Campo, type PropsCampo } from './campo'
import type { EstadoAcao } from '@/lib/acoes'

export const CAMPOS_RESIDENTE: PropsCampo[] = [
  { nome: 'nomeCompleto', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'nomeSocial', rotulo: 'Nome social' },
  { nome: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'date' as const, obrigatorio: true },
  {
    nome: 'sexo',
    rotulo: 'Sexo',
    obrigatorio: true,
    opcoes: [
      { valor: 'FEMININO', rotulo: 'Feminino' },
      { valor: 'MASCULINO', rotulo: 'Masculino' },
      { valor: 'OUTRO', rotulo: 'Outro' },
    ],
  },
  { nome: 'estadoCivil', rotulo: 'Estado civil' },
  { nome: 'naturalidade', rotulo: 'Naturalidade' },
  { nome: 'nacionalidade', rotulo: 'Nacionalidade' },
  { nome: 'religiao', rotulo: 'Religião' },
  { nome: 'escolaridade', rotulo: 'Escolaridade' },
  { nome: 'cpf', rotulo: 'CPF' },
  { nome: 'rg', rotulo: 'RG' },
  { nome: 'orgaoEmissorRg', rotulo: 'Órgão emissor do RG' },
  { nome: 'cns', rotulo: 'Cartão SUS (CNS)' },
  { nome: 'dataAdmissao', rotulo: 'Data de admissão', tipo: 'date' as const, obrigatorio: true },
  { nome: 'origemAdmissao', rotulo: 'Origem da admissão' },
  { nome: 'motivoAdmissao', rotulo: 'Motivo da admissão' },
  { nome: 'quarto', rotulo: 'Quarto' },
  { nome: 'leito', rotulo: 'Leito' },
  { nome: 'planoSaude', rotulo: 'Plano de saúde' },
  { nome: 'numeroPlanoSaude', rotulo: 'Número do plano' },
  {
    nome: 'beneficioTipo',
    rotulo: 'Tipo de benefício',
    opcoes: [
      { valor: 'APOSENTADORIA', rotulo: 'Aposentadoria' },
      { valor: 'BPC', rotulo: 'BPC' },
      { valor: 'PENSAO', rotulo: 'Pensão' },
      { valor: 'NENHUM', rotulo: 'Nenhum' },
    ],
  },
  { nome: 'beneficioNumero', rotulo: 'Número do benefício' },
  { nome: 'beneficioValor', rotulo: 'Valor do benefício (R$)', tipo: 'number' as const },
]

export function FormularioResidente({
  acao,
  residente,
  rotuloBotao,
}: {
  acao: (estado: EstadoAcao | null, dados: FormData) => Promise<EstadoAcao>
  residente?: Residente
  rotuloBotao: string
}) {
  const [estado, enviar, enviando] = useActionState(acao, null)

  const valorInicial = (nome: string): string | undefined => {
    const valor = residente?.[nome as keyof Residente]
    if (valor instanceof Date) return valor.toISOString().slice(0, 10)
    return valor == null ? undefined : String(valor)
  }

  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS_RESIDENTE.map((campo) => (
          <Campo key={campo.nome} {...campo} valorInicial={valorInicial(campo.nome)} />
        ))}
      </div>

      {estado?.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60 sm:w-auto"
      >
        {enviando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Criar as Server Actions de residentes**

`src/app/(app)/residentes/acoes.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import { criarResidente, atualizarResidente } from '@/modules/residents/residentes.service'
import { adicionarResponsavel } from '@/modules/residents/responsaveis.service'
import { criarAnotacao } from '@/modules/residents/anotacoes.service'
import { registrarAvaliacao } from '@/modules/residents/dependencia.service'
import { anexarDocumento } from '@/modules/residents/documentos.service'

function texto(dados: FormData, campo: string): string | undefined {
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? undefined : s
}

function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo)
  return valor ? new Date(`${valor}T12:00:00`) : undefined
}

function numero(dados: FormData, campo: string): number | undefined {
  const valor = texto(dados, campo)
  return valor ? Number(valor) : undefined
}

function dadosDoResidente(dados: FormData) {
  return {
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    nomeSocial: texto(dados, 'nomeSocial'),
    dataNascimento: data(dados, 'dataNascimento')!,
    sexo: texto(dados, 'sexo') as 'FEMININO' | 'MASCULINO' | 'OUTRO',
    estadoCivil: texto(dados, 'estadoCivil'),
    naturalidade: texto(dados, 'naturalidade'),
    nacionalidade: texto(dados, 'nacionalidade') ?? 'Brasileira',
    religiao: texto(dados, 'religiao'),
    escolaridade: texto(dados, 'escolaridade'),
    cpf: texto(dados, 'cpf'),
    rg: texto(dados, 'rg'),
    orgaoEmissorRg: texto(dados, 'orgaoEmissorRg'),
    cns: texto(dados, 'cns'),
    dataAdmissao: data(dados, 'dataAdmissao')!,
    origemAdmissao: texto(dados, 'origemAdmissao'),
    motivoAdmissao: texto(dados, 'motivoAdmissao'),
    quarto: texto(dados, 'quarto'),
    leito: texto(dados, 'leito'),
    planoSaude: texto(dados, 'planoSaude'),
    numeroPlanoSaude: texto(dados, 'numeroPlanoSaude'),
    beneficioTipo: texto(dados, 'beneficioTipo') as
      | 'APOSENTADORIA' | 'BPC' | 'PENSAO' | 'NENHUM' | undefined,
    beneficioNumero: texto(dados, 'beneficioNumero'),
    beneficioValor: numero(dados, 'beneficioValor'),
  }
}

export async function acaoCriarResidente(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  let id: string | undefined

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const residente = await criarResidente(ctx, dadosDoResidente(dados))
    id = residente.id
  })

  if (resultado.erro) return resultado

  revalidatePath('/residentes')
  redirect(`/residentes/${id}`)
}

export async function acaoAtualizarResidente(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = String(dados.get('id'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarResidente(ctx, id, dadosDoResidente(dados))
  })

  revalidatePath(`/residentes/${id}`)
  return resultado
}

export async function acaoAdicionarResponsavel(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await adicionarResponsavel(ctx, {
      residenteId,
      nome: texto(dados, 'nome')!,
      parentesco: texto(dados, 'parentesco')!,
      cpf: texto(dados, 'cpf'),
      telefonePrincipal: texto(dados, 'telefonePrincipal')!,
      telefoneSecundario: texto(dados, 'telefoneSecundario'),
      email: texto(dados, 'email'),
      ehResponsavelLegal: dados.get('ehResponsavelLegal') === 'on',
      ehContatoEmergencia: dados.get('ehContatoEmergencia') === 'on',
      autorizadoVisitar: dados.get('autorizadoVisitar') === 'on',
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoCriarAnotacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarAnotacao(ctx, {
      residenteId,
      categoria: texto(dados, 'categoria') as 'OUTRO',
      texto: texto(dados, 'texto')!,
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoRegistrarAvaliacao(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await registrarAvaliacao(ctx, {
      residenteId,
      grau: texto(dados, 'grau') as 'I' | 'II' | 'III',
      dataAvaliacao: data(dados, 'dataAvaliacao')!,
      avaliadorNome: texto(dados, 'avaliadorNome')!,
      justificativa: texto(dados, 'justificativa'),
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}

export async function acaoAnexarDocumento(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const residenteId = String(dados.get('residenteId'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const arquivo = dados.get('arquivo') as File | null
    if (!arquivo || arquivo.size === 0) {
      throw new Error('Selecione um arquivo')
    }

    await anexarDocumento(ctx, {
      tipo: texto(dados, 'tipo') as 'OUTRO',
      descricao: texto(dados, 'descricao'),
      nomeArquivoOriginal: arquivo.name,
      mimeType: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
      residenteId,
    })
  })

  revalidatePath(`/residentes/${residenteId}`)
  return resultado
}
```

O `T12:00:00` na conversão de data evita o clássico deslocamento de um dia: `new Date('2026-03-12')` é interpretado como UTC meia-noite, o que em fuso brasileiro vira 11 de março.

- [ ] **Step 5: Criar a lista de residentes**

`src/app/(app)/residentes/page.tsx`:

```tsx
import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarResidentes } from '@/modules/residents/residentes.service'
import { formatarData } from '@/lib/ptbr'

export default async function PaginaResidentes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; status?: string }>
}) {
  const { busca, status } = await searchParams
  const ctx = await obterCtx()
  const residentes = await listarResidentes(ctx, {
    busca,
    status: (status as 'ATIVO' | 'DESLIGADO' | 'FALECIDO') || 'ATIVO',
  })

  const podeCadastrar = ctx.papel !== 'SAUDE'

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Residentes</h1>
        {podeCadastrar && (
          <Link
            href="/residentes/novo"
            className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
          >
            Novo residente
          </Link>
        )}
      </div>

      <form className="flex gap-2">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome"
          aria-label="Buscar por nome"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-base"
        />
        <select
          name="status"
          defaultValue={status ?? 'ATIVO'}
          aria-label="Situação"
          className="rounded border border-slate-300 px-3 py-2 text-base"
        >
          <option value="ATIVO">Ativos</option>
          <option value="DESLIGADO">Desligados</option>
          <option value="FALECIDO">Falecidos</option>
        </select>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      {residentes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum residente encontrado.</p>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {residentes.map((residente) => (
            <li key={residente.id}>
              <Link
                href={`/residentes/${residente.id}`}
                className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50"
              >
                <span>
                  <span className="block font-medium text-slate-800">
                    {residente.nomeSocial || residente.nomeCompleto}
                  </span>
                  <span className="block text-sm text-slate-500">
                    Quarto {residente.quarto ?? '—'} · Admissão em{' '}
                    {formatarData(residente.dataAdmissao)}
                  </span>
                </span>
                <span aria-hidden className="text-slate-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Criar a página de cadastro**

`src/app/(app)/residentes/novo/page.tsx`:

```tsx
import { FormularioResidente } from '@/components/formulario-residente'
import { acaoCriarResidente } from '../acoes'

export default function PaginaNovoResidente() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Novo residente</h1>
      <FormularioResidente acao={acaoCriarResidente} rotuloBotao="Cadastrar residente" />
    </section>
  )
}
```

- [ ] **Step 7: Criar a ficha do residente**

`src/app/(app)/residentes/[id]/page.tsx`:

```tsx
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { listarResponsaveis } from '@/modules/residents/responsaveis.service'
import { listarDocumentos } from '@/modules/residents/documentos.service'
import { listarAnotacoes } from '@/modules/residents/anotacoes.service'
import {
  obterGrauVigente,
  listarAvaliacoes,
} from '@/modules/residents/dependencia.service'
import { formatarData, formatarDataHora, formatarCpf } from '@/lib/ptbr'

export default async function FichaResidente({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()

  const residente = await obterResidente(ctx, id)
  const [grau, responsaveis, documentos, anotacoes, avaliacoes] = await Promise.all([
    obterGrauVigente(ctx, id),
    listarResponsaveis(ctx, id),
    listarDocumentos(ctx, { residenteId: id }),
    listarAnotacoes(ctx, id),
    listarAvaliacoes(ctx, id),
  ])

  const emergencia = responsaveis.filter((r) => r.ehContatoEmergencia)

  return (
    <section className="space-y-4">
      <header className="rounded border bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-800">
          {residente.nomeSocial || residente.nomeCompleto}
        </h1>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500">Nascimento:</dt>
            <dd>{formatarData(residente.dataNascimento)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Quarto/leito:</dt>
            <dd>{residente.quarto ?? '—'} / {residente.leito ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">CPF:</dt>
            <dd>{residente.cpf ? formatarCpf(residente.cpf) : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Grau de dependência:</dt>
            <dd className="font-medium">{grau ?? 'não avaliado'}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-slate-500">Emergência:</dt>
            <dd>
              {emergencia.length > 0
                ? emergencia.map((r) => `${r.nome} (${r.telefonePrincipal})`).join(' · ')
                : '—'}
            </dd>
          </div>
        </dl>
      </header>

      <details open className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Anotações ({anotacoes.length})
        </summary>
        <ul className="mt-3 space-y-3">
          {anotacoes.map((anotacao) => (
            <li key={anotacao.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm text-slate-500">
                {formatarDataHora(anotacao.criadoEm)} · {anotacao.categoria}
                {anotacao.retificaAnotacaoId && ' · retificação'}
              </p>
              <p className="text-slate-800">{anotacao.texto}</p>
            </li>
          ))}
          {anotacoes.length === 0 && (
            <li className="text-sm text-slate-500">Nenhuma anotação registrada.</li>
          )}
        </ul>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Responsáveis ({responsaveis.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {responsaveis.map((responsavel) => (
            <li key={responsavel.id} className="text-sm">
              <span className="font-medium text-slate-800">{responsavel.nome}</span>{' '}
              <span className="text-slate-500">
                — {responsavel.parentesco} · {responsavel.telefonePrincipal}
                {responsavel.ehResponsavelLegal && ' · responsável legal'}
              </span>
            </li>
          ))}
          {responsaveis.length === 0 && (
            <li className="text-sm text-slate-500">Nenhum responsável cadastrado.</li>
          )}
        </ul>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Documentos ({documentos.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {documentos.map((documento) => (
            <li key={documento.id} className="text-sm">
              <a
                href={`/api/documentos/${documento.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-800 underline"
              >
                {documento.tipo} — {documento.nomeArquivoOriginal}
              </a>
            </li>
          ))}
          {documentos.length === 0 && (
            <li className="text-sm text-slate-500">Nenhum documento anexado.</li>
          )}
        </ul>
      </details>

      <details className="rounded border bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">
          Grau de dependência ({avaliacoes.length} avaliações)
        </summary>
        <ul className="mt-3 space-y-2">
          {avaliacoes.map((avaliacao) => (
            <li key={avaliacao.id} className="text-sm">
              <span className="font-medium">Grau {avaliacao.grau}</span>{' '}
              <span className="text-slate-500">
                em {formatarData(avaliacao.dataAvaliacao)} por {avaliacao.avaliadorNome}
              </span>
            </li>
          ))}
          {avaliacoes.length === 0 && (
            <li className="text-sm text-slate-500">Nenhuma avaliação registrada.</li>
          )}
        </ul>
      </details>
    </section>
  )
}
```

- [ ] **Step 7b: Criar os formulários das seções da ficha**

`src/components/formularios-ficha.tsx` — quatro composições de `FormularioSimples`, uma por seção:

```tsx
import { FormularioSimples } from './formulario-simples'
import {
  acaoCriarAnotacao,
  acaoAdicionarResponsavel,
  acaoRegistrarAvaliacao,
  acaoAnexarDocumento,
} from '@/app/(app)/residentes/acoes'

export function FormularioAnotacao({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoCriarAnotacao}
      ocultos={{ residenteId }}
      colunas={1}
      rotuloBotao="Registrar anotação"
      campos={[
        {
          nome: 'categoria',
          rotulo: 'Categoria',
          obrigatorio: true,
          opcoes: [
            { valor: 'COMPORTAMENTO', rotulo: 'Comportamento' },
            { valor: 'VISITA_FAMILIA', rotulo: 'Visita da família' },
            { valor: 'OCORRENCIA', rotulo: 'Ocorrência' },
            { valor: 'SOCIAL', rotulo: 'Social' },
            { valor: 'JURIDICO', rotulo: 'Jurídico' },
            { valor: 'OUTRO', rotulo: 'Outro' },
          ],
        },
        { nome: 'texto', rotulo: 'Anotação', obrigatorio: true },
      ]}
    />
  )
}

export function FormularioResponsavel({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoAdicionarResponsavel}
      ocultos={{ residenteId }}
      rotuloBotao="Adicionar responsável"
      campos={[
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        { nome: 'parentesco', rotulo: 'Parentesco', obrigatorio: true },
        { nome: 'cpf', rotulo: 'CPF' },
        { nome: 'telefonePrincipal', rotulo: 'Telefone principal', obrigatorio: true },
        { nome: 'telefoneSecundario', rotulo: 'Telefone secundário' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
      ]}
    />
  )
}

export function FormularioAvaliacao({ residenteId }: { residenteId: string }) {
  return (
    <FormularioSimples
      acao={acaoRegistrarAvaliacao}
      ocultos={{ residenteId }}
      rotuloBotao="Registrar avaliação"
      campos={[
        {
          nome: 'grau',
          rotulo: 'Grau de dependência',
          obrigatorio: true,
          opcoes: [
            { valor: 'I', rotulo: 'Grau I' },
            { valor: 'II', rotulo: 'Grau II' },
            { valor: 'III', rotulo: 'Grau III' },
          ],
        },
        { nome: 'dataAvaliacao', rotulo: 'Data da avaliação', tipo: 'date', obrigatorio: true },
        { nome: 'avaliadorNome', rotulo: 'Avaliado por', obrigatorio: true },
        { nome: 'justificativa', rotulo: 'Justificativa' },
      ]}
    />
  )
}
```

O anexo de documento precisa de `enctype="multipart/form-data"` e de um `<input type="file">`, que o `Campo` não cobre. Ele vai em **arquivo próprio** — `src/components/formulario-documento.tsx` — porque a diretiva `'use client'` vale para o arquivo inteiro e os três formulários acima são componentes de servidor:

```tsx
'use client'

import { useActionState } from 'react'
import { acaoAnexarDocumento } from '@/app/(app)/residentes/acoes'

export function FormularioDocumento({ residenteId }: { residenteId: string }) {
  const [estado, enviar, enviando] = useActionState(acaoAnexarDocumento, null)

  return (
    <form action={enviar} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      <div className="space-y-1">
        <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
          Tipo do documento <span className="text-red-600">*</span>
        </label>
        <select id="tipo" name="tipo" required className="w-full rounded border border-slate-300 px-3 py-2 text-base">
          <option value="RG">RG</option>
          <option value="CPF">CPF</option>
          <option value="CNS">Cartão SUS</option>
          <option value="CERTIDAO">Certidão</option>
          <option value="PROCURACAO">Procuração</option>
          <option value="TERMO_RESPONSABILIDADE">Termo de responsabilidade</option>
          <option value="TERMO_LGPD">Termo de ciência (LGPD)</option>
          <option value="FOTO">Foto</option>
          <option value="OUTRO">Outro</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="descricao" className="text-sm font-medium text-slate-700">Descrição</label>
        <input id="descricao" name="descricao" className="w-full rounded border border-slate-300 px-3 py-2 text-base" />
      </div>

      <div className="space-y-1">
        <label htmlFor="arquivo" className="text-sm font-medium text-slate-700">
          Arquivo (PDF, JPG, PNG ou WEBP, até 20 MB) <span className="text-red-600">*</span>
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base"
        />
      </div>

      {estado?.erro && <p role="alert" className="text-sm text-red-600">{estado.erro}</p>}

      <button type="submit" disabled={enviando} className="rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Anexar documento'}
      </button>
    </form>
  )
}
```

Importe cada um dentro do `<details>` correspondente da ficha, logo abaixo da lista. Envolva `FormularioResponsavel`, `FormularioDocumento` e `FormularioAvaliacao` em uma verificação de papel na página (`ctx.papel !== 'SAUDE'` para responsáveis e documentos; `ctx.papel !== 'ADMINISTRATIVO'` para avaliação) — a ação recusa de qualquer forma, mas esconder o formulário evita ao usuário um erro previsível.

`<details>` em vez de abas com JavaScript: funciona sem hidratação, é acessível por padrão e no celular ocupa a tela inteira quando aberto — que é o comportamento desejado.

- [ ] **Step 8: Configurar autenticação nos testes E2E**

`tests/e2e/auth.setup.ts`:

```typescript
import { test as setup, expect } from '@playwright/test'

const ARQUIVO_SESSAO = 'tests/e2e/.sessao.json'

setup('autentica como coordenação', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('coordenacao@lar.local')
  await page.getByLabel('Senha').fill('trocar-esta-senha-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/residentes/)
  await page.context().storageState({ path: ARQUIVO_SESSAO })
})
```

`playwright.config.ts` (substitua o conteúdo da Task 7):

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', locale: 'pt-BR' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'autenticado',
      testIgnore: /auth\.setup\.ts|login\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'tests/e2e/.sessao.json' },
    },
    { name: 'anonimo', testMatch: /login\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

Adicione `tests/e2e/.sessao.json` ao `.gitignore`.

- [ ] **Step 9: Escrever o teste E2E de cadastro**

`tests/e2e/residentes.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('cadastra um residente e o encontra na lista', async ({ page }) => {
  const nome = `Maria Teste ${Date.now()}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByLabel('Quarto').fill('7')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()

  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
  await expect(page.getByText('Quarto/leito:')).toBeVisible()

  await page.goto('/residentes')
  await page.getByLabel('Buscar por nome').fill(nome)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByRole('link', { name: new RegExp(nome) })).toBeVisible()
})

test('exibe erro ao cadastrar com CPF inválido', async ({ page }) => {
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill('Teste CPF Inválido')
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByLabel('CPF').fill('111.111.111-11')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()

  await expect(page.getByRole('alert')).toContainText('CPF inválido')
})
```

- [ ] **Step 10: Rodar tudo**

Run: `npm test && npm run test:e2e`
Expected: testes de serviço e E2E passando.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Adiciona telas de residentes com cadastro, busca e ficha"
```

---

### Task 15: Telas de funcionários e usuários

Mesmo padrão da Task 14, aplicado aos dois cadastros restantes.

**Files:**
- Create: `src/app/(app)/funcionarios/page.tsx`, `novo/page.tsx`, `acoes.ts`
- Create: `src/app/(app)/usuarios/page.tsx`, `acoes.ts`
- Create: `src/components/formulario-funcionario.tsx` (apenas os metadados dos campos)
- Test: `tests/e2e/funcionarios.spec.ts`

**Interfaces:**
- Consumes: `funcionarios.service`, `usuarios.service`, `executarAcao`, `obterCtx`, `FormularioSimples` e `PropsCampo` (Task 14)
- Produces: nada consumido por tasks posteriores

- [ ] **Step 1: Escrever o teste E2E (deve falhar)**

`tests/e2e/funcionarios.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('cadastra funcionário com registro de conselho', async ({ page }) => {
  const nome = `Ana Teste ${Date.now()}`

  await page.goto('/funcionarios/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('CPF').fill('529.982.247-25')
  await page.getByLabel('Cargo').fill('Técnica de enfermagem')
  await page.getByLabel('Vínculo').selectOption('CLT')
  await page.getByLabel('Data de admissão').fill('2025-02-01')
  await page.getByRole('button', { name: 'Cadastrar funcionário' }).click()

  await expect(page.getByText(nome)).toBeVisible()
})

test('recusa CPF duplicado com mensagem clara', async ({ page }) => {
  await page.goto('/funcionarios/novo')
  await page.getByLabel('Nome completo').fill('Outro Nome Qualquer')
  await page.getByLabel('CPF').fill('529.982.247-25')
  await page.getByLabel('Cargo').fill('Auxiliar')
  await page.getByLabel('Vínculo').selectOption('CLT')
  await page.getByLabel('Data de admissão').fill('2025-02-01')
  await page.getByRole('button', { name: 'Cadastrar funcionário' }).click()

  await expect(page.getByRole('alert')).toContainText('Já existe um funcionário com este CPF')
})
```

O segundo teste depende do primeiro ter rodado — os dois usam o mesmo CPF de propósito, e o Playwright executa na ordem do arquivo.

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm run test:e2e -- funcionarios`
Expected: FAIL — rota `/funcionarios/novo` inexistente (404).

- [ ] **Step 3: Criar as ações de funcionários**

`src/app/(app)/funcionarios/acoes.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import {
  criarFuncionario,
  atualizarFuncionario,
  desligarFuncionario,
} from '@/modules/staff/funcionarios.service'

function texto(dados: FormData, campo: string): string | undefined {
  const valor = dados.get(campo)
  const s = typeof valor === 'string' ? valor.trim() : ''
  return s === '' ? undefined : s
}

function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo)
  return valor ? new Date(`${valor}T12:00:00`) : undefined
}

function dadosDoFuncionario(dados: FormData) {
  return {
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    cpf: texto(dados, 'cpf')!,
    rg: texto(dados, 'rg'),
    cargo: texto(dados, 'cargo')!,
    vinculo: texto(dados, 'vinculo') as 'CLT' | 'VOLUNTARIO' | 'PRESTADOR' | 'ESTAGIO',
    dataAdmissao: data(dados, 'dataAdmissao')!,
    telefone: texto(dados, 'telefone'),
    email: texto(dados, 'email'),
    conselhoSigla: texto(dados, 'conselhoSigla'),
    conselhoNumero: texto(dados, 'conselhoNumero'),
    conselhoUf: texto(dados, 'conselhoUf'),
    conselhoValidade: data(dados, 'conselhoValidade'),
  }
}

export async function acaoCriarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarFuncionario(ctx, dadosDoFuncionario(dados))
  })

  if (resultado.erro) return resultado

  revalidatePath('/funcionarios')
  redirect('/funcionarios')
}

export async function acaoAtualizarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const id = String(dados.get('id'))

  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await atualizarFuncionario(ctx, id, dadosDoFuncionario(dados))
  })

  revalidatePath('/funcionarios')
  return resultado
}

export async function acaoDesligarFuncionario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desligarFuncionario(ctx, String(dados.get('id')), {
      dataDesligamento: data(dados, 'dataDesligamento')!,
      motivoDesligamento: texto(dados, 'motivoDesligamento')!,
    })
  })

  revalidatePath('/funcionarios')
  return resultado
}
```

- [ ] **Step 4: Criar o formulário de funcionário**

`src/components/formulario-funcionario.tsx` — só os metadados; a renderização fica por conta do `FormularioSimples` criado na Task 14:

```tsx
import type { PropsCampo } from './campo'

export const CAMPOS_FUNCIONARIO: PropsCampo[] = [
  { nome: 'nomeCompleto', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'cpf', rotulo: 'CPF', obrigatorio: true },
  { nome: 'rg', rotulo: 'RG' },
  { nome: 'cargo', rotulo: 'Cargo', obrigatorio: true },
  {
    nome: 'vinculo',
    rotulo: 'Vínculo',
    obrigatorio: true,
    opcoes: [
      { valor: 'CLT', rotulo: 'CLT' },
      { valor: 'VOLUNTARIO', rotulo: 'Voluntário' },
      { valor: 'PRESTADOR', rotulo: 'Prestador de serviço' },
      { valor: 'ESTAGIO', rotulo: 'Estágio' },
    ],
  },
  { nome: 'dataAdmissao', rotulo: 'Data de admissão', tipo: 'date' as const, obrigatorio: true },
  { nome: 'telefone', rotulo: 'Telefone' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' as const },
  { nome: 'conselhoSigla', rotulo: 'Conselho (COREN, CRM, CRN…)' },
  { nome: 'conselhoNumero', rotulo: 'Número do registro' },
  { nome: 'conselhoUf', rotulo: 'UF do conselho' },
  { nome: 'conselhoValidade', rotulo: 'Validade do registro', tipo: 'date' as const },
]
```

- [ ] **Step 5: Criar as páginas de funcionários**

`src/app/(app)/funcionarios/novo/page.tsx`:

```tsx
import { FormularioSimples } from '@/components/formulario-simples'
import { CAMPOS_FUNCIONARIO } from '@/components/formulario-funcionario'
import { acaoCriarFuncionario } from '../acoes'

export default function PaginaNovoFuncionario() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Novo funcionário</h1>
      <FormularioSimples
        acao={acaoCriarFuncionario}
        campos={CAMPOS_FUNCIONARIO}
        rotuloBotao="Cadastrar funcionário"
      />
    </section>
  )
}
```

`src/app/(app)/funcionarios/page.tsx`:

```tsx
import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import {
  listarFuncionarios,
  listarConselhosVencendo,
} from '@/modules/staff/funcionarios.service'
import { formatarData } from '@/lib/ptbr'

export default async function PaginaFuncionarios({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  const { busca } = await searchParams
  const ctx = await obterCtx()

  const [funcionarios, vencendo] = await Promise.all([
    listarFuncionarios(ctx, { busca, apenasAtivos: true }),
    listarConselhosVencendo(ctx, 60),
  ])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Funcionários</h1>
        <Link
          href="/funcionarios/novo"
          className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
        >
          Novo funcionário
        </Link>
      </div>

      {vencendo.length > 0 && (
        <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            {vencendo.length} registro(s) profissional(is) vencendo nos próximos 60 dias
          </p>
          <ul className="mt-1 text-amber-800">
            {vencendo.map((funcionario) => (
              <li key={funcionario.id}>
                {funcionario.nomeCompleto} — {funcionario.conselhoSigla}{' '}
                {funcionario.conselhoNumero}, validade{' '}
                {funcionario.conselhoValidade
                  ? formatarData(funcionario.conselhoValidade)
                  : '—'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="flex gap-2">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome ou cargo"
          aria-label="Buscar por nome ou cargo"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-base"
        />
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      <ul className="divide-y rounded border bg-white">
        {funcionarios.map((funcionario) => (
          <li key={funcionario.id} className="p-3">
            <span className="block font-medium text-slate-800">
              {funcionario.nomeCompleto}
            </span>
            <span className="block text-sm text-slate-500">
              {funcionario.cargo} · {funcionario.vinculo} · desde{' '}
              {formatarData(funcionario.dataAdmissao)}
            </span>
          </li>
        ))}
        {funcionarios.length === 0 && (
          <li className="p-3 text-sm text-slate-500">Nenhum funcionário encontrado.</li>
        )}
      </ul>
    </section>
  )
}
```

- [ ] **Step 6: Criar as ações e a tela de usuários**

`src/app/(app)/usuarios/acoes.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { executarAcao, type EstadoAcao } from '@/lib/acoes'
import { obterCtx } from '@/modules/auth/sessao'
import {
  criarUsuario,
  definirSenha,
  desativarUsuario,
} from '@/modules/auth/usuarios.service'

function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

export async function acaoCriarUsuario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await criarUsuario(ctx, {
      email: texto(dados, 'email'),
      nome: texto(dados, 'nome'),
      papel: texto(dados, 'papel') as 'COORDENACAO' | 'SAUDE' | 'ADMINISTRATIVO',
      senha: texto(dados, 'senha'),
    })
  })

  revalidatePath('/usuarios')
  return resultado
}

export async function acaoDefinirSenha(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await definirSenha(ctx, texto(dados, 'id'), texto(dados, 'senha'))
  })

  revalidatePath('/usuarios')
  return resultado
}

export async function acaoDesativarUsuario(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await desativarUsuario(ctx, texto(dados, 'id'))
  })

  revalidatePath('/usuarios')
  return resultado
}
```

`src/app/(app)/usuarios/page.tsx`:

```tsx
import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { FormularioSimples } from '@/components/formulario-simples'
import { formatarData } from '@/lib/ptbr'
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
            { nome: 'senha', rotulo: 'Senha inicial (mínimo 8 caracteres)', obrigatorio: true },
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
                {usuario.ultimoAcessoEm ? formatarData(usuario.ultimoAcessoEm) : 'nunca'}
              </span>
            </div>

            {usuario.ativo && usuario.id !== ctx.usuarioId && (
              <div className="flex flex-wrap gap-2">
                <FormularioSimples
                  acao={acaoDefinirSenha}
                  ocultos={{ id: usuario.id }}
                  colunas={1}
                  rotuloBotao="Definir nova senha"
                  campos={[{ nome: 'senha', rotulo: 'Nova senha', obrigatorio: true }]}
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
```

A própria conta não exibe os botões de desativar e trocar senha — `desativarUsuario` já recusa (Task 6), e esconder evita o erro previsível.

- [ ] **Step 7: Rodar os testes**

Run: `npm run test:e2e`
Expected: PASS em login, residentes e funcionários.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Adiciona telas de funcionários e gestão de usuários"
```

---

### Task 16: Consulta da trilha de auditoria

**Files:**
- Create: `src/modules/audit/auditoria.consulta.ts`
- Create: `src/app/(app)/auditoria/page.tsx`
- Test: `src/modules/audit/auditoria.consulta.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Ctx`, `exigirPapel`
- Produces: `consultarAuditoria(ctx, filtro: { usuarioId?: string; entidade?: string; residenteId?: string; de?: Date; ate?: Date; pagina?: number }): Promise<{ registros: LogAuditoria[]; total: number; paginas: number }>`

- [ ] **Step 1: Escrever os testes (devem falhar)**

`src/modules/audit/auditoria.consulta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel } from '@/../tests/helpers/fabricas'
import { registrarAuditoria } from './auditoria.service'
import { consultarAuditoria } from './auditoria.consulta'

describe('consultarAuditoria', () => {
  it('é restrita à coordenação', async () => {
    for (const papel of ['SAUDE', 'ADMINISTRATIVO'] as const) {
      const ctx = await ctxComPapel(papel)
      await expect(consultarAuditoria(ctx, {})).rejects.toThrow(ErroPermissao)
    }
  })

  it('filtra por entidade e por período', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    await registrarAuditoria(prisma, ctx, { acao: 'CRIAR', entidade: 'Residente' })
    await registrarAuditoria(prisma, ctx, { acao: 'CRIAR', entidade: 'Funcionario' })

    const porEntidade = await consultarAuditoria(ctx, { entidade: 'Residente' })
    expect(porEntidade.total).toBe(1)

    const foraDoPeriodo = await consultarAuditoria(ctx, {
      de: new Date('2020-01-01'),
      ate: new Date('2020-12-31'),
    })
    expect(foraDoPeriodo.total).toBe(0)
  })

  it('pagina em 50 registros e ordena do mais recente', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    for (let i = 0; i < 55; i++) {
      await registrarAuditoria(prisma, ctx, {
        acao: 'VISUALIZAR',
        entidade: 'Residente',
        entidadeId: `res_${i}`,
      })
    }

    const primeira = await consultarAuditoria(ctx, { entidade: 'Residente' })
    expect(primeira.registros).toHaveLength(50)
    expect(primeira.total).toBe(55)
    expect(primeira.paginas).toBe(2)

    const segunda = await consultarAuditoria(ctx, { entidade: 'Residente', pagina: 2 })
    expect(segunda.registros).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test -- src/modules/audit/auditoria.consulta.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/modules/audit/auditoria.consulta.ts`:

```typescript
import type { LogAuditoria, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'

const POR_PAGINA = 50

export type FiltroAuditoria = {
  usuarioId?: string
  entidade?: string
  residenteId?: string
  de?: Date
  ate?: Date
  pagina?: number
}

export async function consultarAuditoria(
  ctx: Ctx,
  filtro: FiltroAuditoria
): Promise<{ registros: LogAuditoria[]; total: number; paginas: number }> {
  exigirPapel(ctx, 'COORDENACAO')

  const where: Prisma.LogAuditoriaWhereInput = {}
  if (filtro.usuarioId) where.usuarioId = filtro.usuarioId
  if (filtro.entidade) where.entidade = filtro.entidade
  if (filtro.residenteId) where.residenteId = filtro.residenteId
  if (filtro.de || filtro.ate) {
    where.criadoEm = { gte: filtro.de, lte: filtro.ate }
  }

  const pagina = Math.max(1, filtro.pagina ?? 1)

  const [registros, total] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.logAuditoria.count({ where }),
  ])

  return { registros, total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) }
}
```

A consulta da auditoria não se audita: registrar cada consulta geraria crescimento sem informação nova, já que o acesso à tela é restrito a um único papel.

- [ ] **Step 4: Criar a tela**

`src/app/(app)/auditoria/page.tsx`:

```tsx
import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { listarUsuarios } from '@/modules/auth/usuarios.service'
import { consultarAuditoria } from '@/modules/audit/auditoria.consulta'
import { formatarDataHora } from '@/lib/ptbr'

const ENTIDADES = [
  'Residente',
  'Responsavel',
  'Documento',
  'Anotacao',
  'AvaliacaoDependencia',
  'Funcionario',
  'Usuario',
]

function formatarDiff(diff: unknown): string {
  if (!diff || typeof diff !== 'object') return '—'
  return Object.entries(diff as Record<string, { de: unknown; para: unknown }>)
    .map(([campo, { de, para }]) => `${campo}: ${String(de ?? '—')} → ${String(para ?? '—')}`)
    .join(' · ')
}

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ entidade?: string; usuarioId?: string; de?: string; ate?: string; pagina?: string }>
}) {
  const filtros = await searchParams
  const ctx = await obterCtx()

  const [usuarios, resultado] = await Promise.all([
    listarUsuarios(ctx),
    consultarAuditoria(ctx, {
      entidade: filtros.entidade || undefined,
      usuarioId: filtros.usuarioId || undefined,
      de: filtros.de ? new Date(`${filtros.de}T00:00:00`) : undefined,
      ate: filtros.ate ? new Date(`${filtros.ate}T23:59:59`) : undefined,
      pagina: filtros.pagina ? Number(filtros.pagina) : 1,
    }),
  ])

  const pagina = Number(filtros.pagina ?? 1)
  const parametros = (novaPagina: number) => {
    const busca = new URLSearchParams()
    for (const [chave, valor] of Object.entries(filtros)) {
      if (valor && chave !== 'pagina') busca.set(chave, valor)
    }
    busca.set('pagina', String(novaPagina))
    return `?${busca.toString()}`
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Trilha de auditoria</h1>

      <form className="grid gap-2 sm:grid-cols-5">
        <select
          name="entidade"
          defaultValue={filtros.entidade ?? ''}
          aria-label="Entidade"
          className="rounded border border-slate-300 px-3 py-2 text-base"
        >
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((entidade) => (
            <option key={entidade} value={entidade}>{entidade}</option>
          ))}
        </select>

        <select
          name="usuarioId"
          defaultValue={filtros.usuarioId ?? ''}
          aria-label="Usuário"
          className="rounded border border-slate-300 px-3 py-2 text-base"
        >
          <option value="">Todos os usuários</option>
          {usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>{usuario.nome}</option>
          ))}
        </select>

        <input type="date" name="de" defaultValue={filtros.de} aria-label="De"
          className="rounded border border-slate-300 px-3 py-2 text-base" />
        <input type="date" name="ate" defaultValue={filtros.ate} aria-label="Até"
          className="rounded border border-slate-300 px-3 py-2 text-base" />

        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">
          Filtrar
        </button>
      </form>

      <p className="text-sm text-slate-500">
        {resultado.total} registro(s) · página {pagina} de {resultado.paginas}
      </p>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-2">Data/hora</th>
              <th className="p-2">Usuário</th>
              <th className="p-2">Ação</th>
              <th className="p-2">Entidade</th>
              <th className="p-2">Alteração</th>
            </tr>
          </thead>
          <tbody>
            {resultado.registros.map((registro) => (
              <tr key={registro.id} className="border-b last:border-0">
                <td className="whitespace-nowrap p-2">{formatarDataHora(registro.criadoEm)}</td>
                <td className="p-2">{registro.usuarioEmail}</td>
                <td className="p-2">{registro.acao}</td>
                <td className="p-2">
                  {registro.entidade}
                  {registro.entidadeId && (
                    <span className="block text-xs text-slate-400">{registro.entidadeId}</span>
                  )}
                </td>
                <td className="p-2 text-slate-600">{formatarDiff(registro.diff)}</td>
              </tr>
            ))}
            {resultado.registros.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-slate-500">
                  Nenhum registro no filtro selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        {pagina > 1 && (
          <Link href={parametros(pagina - 1)} className="rounded border px-3 py-2 text-sm">
            Anterior
          </Link>
        )}
        {pagina < resultado.paginas && (
          <Link href={parametros(pagina + 1)} className="rounded border px-3 py-2 text-sm">
            Próxima
          </Link>
        )}
      </div>
    </section>
  )
}
```

A tabela vive dentro de um contêiner com `overflow-x-auto`: no celular ela rola horizontalmente sozinha, em vez de empurrar a página inteira para o lado.

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- src/modules/audit`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona consulta da trilha de auditoria para a coordenação"
```

---

### Task 17: Implantação em produção

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `Caddyfile`
- Create: `docker-entrypoint.sh`
- Modify: `next.config.ts` (saída standalone)
- Create: `.env.producao.example`
- Create: `docs/operacao/implantacao.md`

**Interfaces:**
- Consumes: build da aplicação, `prisma/seed.ts`
- Produces: ambiente executável na VPS

- [ ] **Step 1: Configurar a saída standalone**

`next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
}

export default nextConfig
```

`output: 'standalone'` faz o Next empacotar só as dependências usadas, reduzindo a imagem de ~1 GB para ~200 MB — relevante numa VPS pequena.

- [ ] **Step 2: Escrever o Dockerfile**

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache postgresql18-client openssl

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

- [ ] **Step 3: Escrever o entrypoint**

`docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

echo "Aplicando migrations..."
npx prisma migrate deploy

echo "Executando seed (idempotente)..."
npx tsx prisma/seed.ts || echo "Seed ignorado."

exec "$@"
```

As migrations rodam no start do container, não em passo manual: reimplantar e esquecer de migrar é o erro mais comum, e ele quebra a aplicação de forma confusa.

- [ ] **Step 4: Escrever o compose de produção**

`docker-compose.yml`:

```yaml
name: lar

services:
  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_TRUST_HOST: "true"
      NEXTAUTH_URL: https://${DOMINIO}
      UPLOADS_DIR: /data/uploads
      SEED_ADMIN_EMAIL: ${SEED_ADMIN_EMAIL}
      SEED_ADMIN_SENHA: ${SEED_ADMIN_SENHA}
    volumes:
      - uploads:/data/uploads

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMINIO: ${DOMINIO}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  pgdata:
  uploads:
  caddy_data:
  caddy_config:
```

O `name: lar` no topo fixa o prefixo dos volumes como `lar_` (`lar_uploads`, `lar_pgdata`). Sem ele, o Compose derivaria o prefixo do nome do diretório — e os scripts de backup da Tarefa 18, que referenciam `lar_uploads` por nome, quebrariam na primeira execução, silenciosamente copiando um volume vazio.

`Caddyfile`:

```
{$DOMINIO} {
	encode gzip
	request_body {
		max_size 25MB
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "same-origin"
	}
	reverse_proxy app:3000
}
```

O limite de 25 MB no corpo da requisição acompanha o limite de 20 MB por arquivo, com folga para o envelope do multipart.

`.env.producao.example`:

```
DOMINIO=lar.exemplo.org.br
POSTGRES_USER=lar
POSTGRES_PASSWORD=
POSTGRES_DB=lar
AUTH_SECRET=
SEED_ADMIN_EMAIL=coordenacao@lar.exemplo.org.br
SEED_ADMIN_SENHA=
```

- [ ] **Step 5: Documentar a implantação**

`docs/operacao/implantacao.md` deve conter, em ordem executável: requisitos da VPS (2 GB de RAM, Docker e Docker Compose), apontamento do DNS para o IP, cópia do `.env.producao.example` para `.env`, geração do `AUTH_SECRET` com `openssl rand -base64 32`, `docker compose up -d --build`, verificação em `https://<dominio>/login`, **troca imediata da senha do usuário inicial**, e o procedimento de atualização (`git pull && docker compose up -d --build`).

- [ ] **Step 6: Verificar localmente**

```bash
cp .env.producao.example .env.producao
# preencha as senhas e o AUTH_SECRET
docker compose --env-file .env.producao build
docker compose --env-file .env.producao up -d
docker compose logs -f app
```

Expected: log mostra "Aplicando migrations", depois o seed, depois o servidor pronto. Acesse `http://localhost` e confirme a tela de login. (Sem DNS público, o Caddy não emitirá certificado — para o teste local isso é esperado.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Adiciona implantação com Docker, Caddy e migrations no start"
```

---

### Task 18: Backup e restauração verificada

Último item da fase e o mais fácil de tratar como formalidade — não é. O sistema passa a guardar o prontuário de trinta pessoas em disco único.

**Files:**
- Create: `scripts/backup.sh`
- Create: `scripts/restaurar.sh`
- Create: `docs/operacao/backup.md`

**Interfaces:**
- Consumes: containers `db` e `app` do compose de produção
- Produces: rotina de backup agendada e procedimento de restauração testado

- [ ] **Step 1: Escrever o script de backup**

`scripts/backup.sh`:

```sh
#!/bin/sh
set -eu

# Carrega POSTGRES_USER/POSTGRES_DB do mesmo arquivo usado pelo compose.
ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || { echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2; exit 1; }
. "$ARQUIVO_ENV"

DESTINO="${DESTINO_BACKUP:-/var/backups/lar}"
REMOTO="${RCLONE_REMOTO:-}"
SENHA_GPG="${SENHA_BACKUP:?Defina SENHA_BACKUP}"
CARIMBO=$(date +%Y-%m-%d_%H%M)

mkdir -p "$DESTINO"

echo "[1/4] Exportando o banco..."
docker compose exec -T db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "$DESTINO/banco_$CARIMBO.sql.gz"

echo "[2/4] Empacotando os arquivos enviados..."
docker run --rm -v lar_uploads:/dados -v "$DESTINO":/saida alpine \
  tar czf "/saida/uploads_$CARIMBO.tar.gz" -C /dados .

echo "[3/4] Criptografando..."
for arquivo in "$DESTINO/banco_$CARIMBO.sql.gz" "$DESTINO/uploads_$CARIMBO.tar.gz"; do
  gpg --batch --yes --passphrase "$SENHA_GPG" --symmetric --cipher-algo AES256 "$arquivo"
  rm "$arquivo"
done

echo "[4/4] Enviando para fora da VPS..."
if [ -n "$REMOTO" ]; then
  rclone copy "$DESTINO" "$REMOTO" --include "*_$CARIMBO.*.gpg"
else
  echo "AVISO: RCLONE_REMOTO não definido — a cópia ficou apenas local."
fi

find "$DESTINO" -name "*.gpg" -mtime +30 -delete

echo "Backup $CARIMBO concluído."
```

A criptografia acontece **antes** do envio: o backup contém prontuário e documentos pessoais, e o armazenamento remoto é de terceiro.

- [ ] **Step 2: Escrever o script de restauração**

`scripts/restaurar.sh`:

```sh
#!/bin/sh
set -eu

ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || { echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2; exit 1; }
. "$ARQUIVO_ENV"

ARQUIVO_BANCO="${1:?Informe o arquivo .sql.gz.gpg do banco}"
ARQUIVO_UPLOADS="${2:?Informe o arquivo .tar.gz.gpg dos uploads}"
SENHA_GPG="${SENHA_BACKUP:?Defina SENHA_BACKUP}"

echo "ATENÇÃO: isto substitui os dados atuais. Ctrl+C para abortar."
sleep 5

echo "[1/3] Descriptografando..."
gpg --batch --yes --passphrase "$SENHA_GPG" -o /tmp/banco.sql.gz -d "$ARQUIVO_BANCO"
gpg --batch --yes --passphrase "$SENHA_GPG" -o /tmp/uploads.tar.gz -d "$ARQUIVO_UPLOADS"

echo "[2/3] Restaurando o banco..."
docker compose stop app
gunzip -c /tmp/banco.sql.gz \
  | docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "[3/3] Restaurando os arquivos..."
docker run --rm -v lar_uploads:/dados -v /tmp:/entrada alpine \
  sh -c "rm -rf /dados/* && tar xzf /entrada/uploads.tar.gz -C /dados"

docker compose start app
rm -f /tmp/banco.sql.gz /tmp/uploads.tar.gz

echo "Restauração concluída. Confira a aplicação."
```

- [ ] **Step 3: Agendar a execução diária**

No `crontab -e` da VPS:

```
0 3 * * * cd /opt/lar && SENHA_BACKUP=xxx RCLONE_REMOTO=remoto:lar-backup ARQUIVO_ENV=/opt/lar/.env.producao sh scripts/backup.sh >> /var/log/lar-backup.log 2>&1
```

O `cron` roda com ambiente mínimo — daí os scripts carregarem o `.env.producao` explicitamente em vez de contarem com variáveis herdadas do shell. Um backup que falha silenciosamente às 3h da manhã só é descoberto no dia da restauração.

- [ ] **Step 4: Executar o teste de restauração — obrigatório**

Este passo não é opcional e não pode ser marcado sem ter sido feito de verdade:

1. Cadastre um residente com nome reconhecível e anexe um documento
2. Rode `sh scripts/backup.sh`
3. Apague o residente diretamente no banco e remova o arquivo do volume
4. Rode `sh scripts/restaurar.sh <banco.gpg> <uploads.gpg>`
5. Confirme na aplicação que o residente voltou **e que o documento anexado abre**

Um backup de banco que restaura sem os arquivos é uma falha silenciosa: a tela mostra o documento na lista e o download quebra. É exatamente o tipo de defeito que só aparece no dia em que já é tarde.

- [ ] **Step 5: Documentar**

`docs/operacao/backup.md`: o que é copiado (banco e volume de uploads), onde vai parar, política de retenção (30 dias local, conforme o remoto), como restaurar, e o **registro datado do teste de restauração** com o resultado observado. Inclua o lembrete de repetir o teste a cada seis meses.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona backup criptografado e procedimento de restauração testado"
```

---

## Cobertura da spec

| Requisito da spec | Onde é implementado |
|---|---|
| §2.1 Stack | Task 1 |
| §2.2 Camada de serviço isolada | Tasks 4, 6, 8-13 |
| §2.3 Arquivos em volume, rota autenticada | Task 11 |
| §2.4 Sessão JWT com revogação imediata | Task 7 |
| §2.5 Identificadores CUID | Task 1 (schema) e seguintes |
| §4.1 Usuario | Tasks 1, 6 |
| §4.2 Residente, AvaliacaoDependencia, Responsavel, Documento, Anotacao | Tasks 8-12 |
| §4.3 Funcionario | Task 13 |
| §4.7 LogAuditoria | Task 5 |
| R1 exclusão lógica | Tasks 8, 10, 13 |
| R2 grau vigente por data | Task 9 |
| R3 janela de edição e retificação | Task 12 |
| R11 permissão na camada de serviço | Tasks 4, 6, 8-13, 16 |
| R12 auditoria de escrita e de leitura sensível | Tasks 5, 8, 11 |
| §7 Permissões por papel | Tasks 4, 6, 8-13, 16; exceções do grau em Task 9 |
| §8 LGPD: CUID, arquivo autenticado, Argon2id, backup criptografado | Tasks 1, 3, 11, 18 |
| §9 Interface pt-BR, responsiva | Tasks 2, 14, 15 |
| §12 Testes contra Postgres real | Task 1 e todas as seguintes |
| §13 Implantação, backup verificado, seed | Tasks 7, 17, 18 |

Fora do escopo desta fase, por pertencerem às Fases 2A, 2B e 3: prontuário, medicação e financeiro. O modelo `Documento` (Task 11) e o mecanismo de auditoria (Task 5) já foram desenhados para atendê-las sem alteração.

## Ao terminar a Fase 1

1. `npm test && npm run test:e2e` — tudo verde
2. Implantar na VPS conforme `docs/operacao/implantacao.md`
3. Trocar a senha do usuário inicial
4. Executar o teste de restauração de backup e registrar a data em `docs/operacao/backup.md`
5. Cadastrar os ~30 residentes (digitação manual, conforme §13 da spec)
6. Só então iniciar o plano da Fase 2A
