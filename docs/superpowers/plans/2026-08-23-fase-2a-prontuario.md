# Fase 2A — Prontuário: plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** substituir o caderno de plantão — cabeçalho clínico, anotações de
saúde, sinais vitais, exames com controle de pendências, consultas, vacinas e
linha do tempo, numa rota que o papel ADMINISTRATIVO não alcança.

**Arquitetura:** oito entidades novas, cada uma com serviço, schema Zod e seção
próprios, no mesmo formato da Fase 1. A linha do tempo não é tabela: são cinco
consultas indexadas por residente, unidas e ordenadas em memória. O prontuário
vive em `/residentes/[id]/prontuario`; a ficha existente continua cadastral.

**Pilha:** Next.js 15 (App Router, Server Actions), React 19, Prisma,
PostgreSQL 18, Zod, Vitest contra Postgres real, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-fase-2a-prontuario-design.md` — leia
antes da primeira tarefa. O design geral do sistema está em
`docs/superpowers/specs/2026-08-18-lar-idosos-design.md`.

## Restrições globais

Valem para toda tarefa, sem repetição em cada uma:

- **Idioma:** identificadores, comentários, mensagens de erro, rótulos e nomes
  de teste em português do Brasil. Datas `dd/mm/aaaa`.
- **Permissão na camada de serviço:** toda função exportada começa com
  `exigirPapel(ctx, '<Entidade>', 'COORDENACAO', 'SAUDE')`. A tela esconder não
  é permissão. Cada recusa tem teste.
- **Auditoria dentro da transação:** toda escrita chama `registrarAuditoria(tx, ctx, …)`
  dentro do mesmo `prisma.$transaction` que gravou.
- **Exclusão é lógica.** Nenhum `DELETE` físico.
- **TDD:** o teste é escrito primeiro, visto falhar pelo motivo certo, e só
  então o código. Um teste que passa de primeira não provou nada.
- **Verificação antes de commitar:** `npx tsc --noEmit`, `npx eslint` e
  `npm test` verdes. Comando de teste único: `npx dotenv -e .env.test -- npx vitest run <arquivo>`.
- **Nada de campo opcional com `.optional()`:** use `.nullish()`. Campo presente
  e vazio vira `null` e limpa a coluna; ausente é omitido. Ver
  `src/lib/formulario.ts`.
- **Commits em português, sem acentos no assunto**, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/health/cabecalho.service.ts` | `CondicaoCronica`, `Alergia`, `RestricaoAlimentar` — as três que alimentam o cabeçalho |
| `src/modules/health/anotacoes-saude.service.ts` | `AnotacaoSaude` com janela de edição e retificação |
| `src/modules/health/sinais-vitais.service.ts` | `SinalVital` |
| `src/modules/health/exames.service.ts` | `Exame` e sua máquina de status |
| `src/modules/health/consultas.service.ts` | `Consulta` |
| `src/modules/health/vacinas.service.ts` | `Vacina` |
| `src/modules/health/linha-do-tempo.ts` | Leitura: une as cinco fontes e ordena |
| `src/modules/health/pendencias.ts` | Leitura institucional: exames e consultas em aberto |
| `src/lib/janela-edicao.ts` | Regra R3 extraída, compartilhada pelas duas anotações |
| `src/app/(app)/residentes/[id]/prontuario/page.tsx` | A tela do prontuário |
| `src/app/(app)/residentes/[id]/prontuario/acoes.ts` | Server Actions do prontuário |
| `src/app/(app)/pendencias/page.tsx` | A área de pendências |
| `src/components/cabecalho-clinico.tsx` | O cabeçalho fixo |
| `src/components/linha-do-tempo.tsx` | O fluxo cronológico com filtro |
| `src/components/formularios-prontuario.tsx` | Os formulários das seções |

Um módulo `health` novo, irmão de `residents` e `staff`, porque prontuário é
assunto próprio e porque `residents` já tem sete arquivos. Serviços separados
por entidade, não um `prontuario.service.ts` único: o arquivo único chegaria a
mil linhas antes da metade da fase.

**Modificados:** `prisma/schema.prisma`, `src/modules/audit/auditoria.service.ts`
(união `EntidadeAuditada`), `src/app/(app)/auditoria/page.tsx` (rótulos),
`src/app/(app)/layout.tsx` (menu), `src/modules/residents/anotacoes.service.ts`
(estreitamento e extração da janela), `src/app/(app)/residentes/[id]/page.tsx`
(link para o prontuário).

---

## Tarefa 1: Schema das oito entidades e a migration

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/<carimbo>_prontuario_fase_2a/migration.sql`
- Modificar: `src/modules/audit/auditoria.service.ts` (união `EntidadeAuditada`)
- Modificar: `src/app/(app)/auditoria/page.tsx` (`ROTULO_ENTIDADE`)
- Teste: `tests/fundacao.test.ts`

**Interfaces:**
- Produz: os modelos Prisma `CondicaoCronica`, `Alergia`, `RestricaoAlimentar`,
  `AnotacaoSaude`, `SinalVital`, `Exame`, `Consulta`, `Vacina`; os enums
  `TipoAlergia`, `Gravidade`, `CategoriaAnotacaoSaude`, `Turno`, `StatusExame`,
  `StatusConsulta`; e os oito valores novos de `EntidadeAuditada`.

- [ ] **Passo 1: Escrever o teste que falha**

Em `tests/fundacao.test.ts`, acrescentar:

```ts
it('tem as tabelas do prontuário com o vínculo ao residente', async () => {
  // A fundação da 2A: sem estas oito tabelas nenhuma tarefa seguinte roda.
  // O teste consulta o catálogo em vez de contar linhas porque as tabelas
  // nascem vazias.
  const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'condicoes_cronicas', 'alergias', 'restricoes_alimentares',
        'anotacoes_saude', 'sinais_vitais', 'exames', 'consultas', 'vacinas'
      )
  `
  expect(tabelas).toHaveLength(8)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run tests/fundacao.test.ts`
Esperado: FALHA — `expected [] to have a length of 8`.

- [ ] **Passo 3: Acrescentar os modelos ao schema**

Em `prisma/schema.prisma`, depois de `model AvaliacaoDependencia`:

```prisma
enum TipoAlergia {
  MEDICAMENTO
  ALIMENTO
  OUTRO
}

enum Gravidade {
  LEVE
  MODERADA
  GRAVE
}

enum CategoriaAnotacaoSaude {
  EVOLUCAO
  INTERCORRENCIA
  ALIMENTACAO
  SONO
  HIGIENE
  COMPORTAMENTO
  QUEDA
}

enum Turno {
  MANHA
  TARDE
  NOITE
}

enum StatusExame {
  SOLICITADO
  AGENDADO
  REALIZADO
  RESULTADO_RECEBIDO
  CANCELADO
}

enum StatusConsulta {
  AGENDADA
  REALIZADA
  CANCELADA
}

model CondicaoCronica {
  id              String    @id @default(cuid())
  residenteId     String
  residente       Residente @relation(fields: [residenteId], references: [id])
  descricao       String
  cid10           String?
  dataDiagnostico DateTime? @db.Date
  ativa           Boolean   @default(true)
  criadoEm        DateTime  @default(now())
  atualizadoEm    DateTime  @updatedAt
  criadoPorId     String?

  @@index([residenteId, ativa])
  @@map("condicoes_cronicas")
}

model Alergia {
  id           String      @id @default(cuid())
  residenteId  String
  residente    Residente   @relation(fields: [residenteId], references: [id])
  agente       String
  tipo         TipoAlergia
  gravidade    Gravidade
  reacao       String?
  ativa        Boolean     @default(true)
  criadoEm     DateTime    @default(now())
  atualizadoEm DateTime    @updatedAt
  criadoPorId  String?

  @@index([residenteId, ativa])
  @@map("alergias")
}

model RestricaoAlimentar {
  id           String    @id @default(cuid())
  residenteId  String
  residente    Residente @relation(fields: [residenteId], references: [id])
  descricao    String
  ativa        Boolean   @default(true)
  criadoEm     DateTime  @default(now())
  atualizadoEm DateTime  @updatedAt
  criadoPorId  String?

  @@index([residenteId, ativa])
  @@map("restricoes_alimentares")
}

model AnotacaoSaude {
  id                      String                 @id @default(cuid())
  residenteId             String
  residente               Residente              @relation(fields: [residenteId], references: [id])
  categoria               CategoriaAnotacaoSaude
  turno                   Turno
  texto                   String
  gravidade               Gravidade?
  conduta                 String?
  ocorridoEm              DateTime
  editavelAte             DateTime
  retificaAnotacaoSaudeId String?
  autorId                 String?
  criadoEm                DateTime               @default(now())
  atualizadoEm            DateTime               @updatedAt
  criadoPorId             String?

  @@index([residenteId, ocorridoEm])
  @@index([retificaAnotacaoSaudeId])
  @@map("anotacoes_saude")
}

model SinalVital {
  id                     String    @id @default(cuid())
  residenteId            String
  residente              Residente @relation(fields: [residenteId], references: [id])
  aferidoEm              DateTime
  pressaoSistolica       Int?
  pressaoDiastolica      Int?
  frequenciaCardiaca     Int?
  frequenciaRespiratoria Int?
  temperatura            Decimal?  @db.Decimal(4, 1)
  saturacaoO2            Int?
  glicemia               Int?
  peso                   Decimal?  @db.Decimal(5, 2)
  observacao             String?
  criadoEm               DateTime  @default(now())
  atualizadoEm           DateTime  @updatedAt
  criadoPorId            String?

  @@index([residenteId, aferidoEm])
  @@map("sinais_vitais")
}

model Exame {
  id               String      @id @default(cuid())
  residenteId      String
  residente        Residente   @relation(fields: [residenteId], references: [id])
  tipo             String
  dataSolicitacao  DateTime?   @db.Date
  dataRealizacao   DateTime?   @db.Date
  dataResultado    DateTime?   @db.Date
  solicitanteNome  String?
  laboratorio      String?
  status           StatusExame @default(SOLICITADO)
  resumoResultado  String?
  documentoId      String?
  documento        Documento?  @relation(fields: [documentoId], references: [id])
  criadoEm         DateTime    @default(now())
  atualizadoEm     DateTime    @updatedAt
  criadoPorId      String?

  @@index([status, dataSolicitacao])
  @@index([residenteId, dataSolicitacao])
  @@map("exames")
}

model Consulta {
  id             String         @id @default(cuid())
  residenteId    String
  residente      Residente      @relation(fields: [residenteId], references: [id])
  dataHora       DateTime
  especialidade  String
  profissional   String?
  local          String?
  motivo         String?
  conduta        String?
  encaminhamento String?
  dataRetorno    DateTime?      @db.Date
  status         StatusConsulta @default(AGENDADA)
  documentoId    String?
  documento      Documento?     @relation(fields: [documentoId], references: [id])
  criadoEm       DateTime       @default(now())
  atualizadoEm   DateTime       @updatedAt
  criadoPorId    String?

  @@index([status, dataHora])
  @@index([residenteId, dataHora])
  @@map("consultas")
}

model Vacina {
  id             String    @id @default(cuid())
  residenteId    String
  residente      Residente @relation(fields: [residenteId], references: [id])
  imunizante     String
  dose           String
  dataAplicacao  DateTime  @db.Date
  lote           String?
  localAplicacao String?
  criadoEm       DateTime  @default(now())
  atualizadoEm   DateTime  @updatedAt
  criadoPorId    String?

  @@index([residenteId, dataAplicacao])
  @@map("vacinas")
}
```

Acrescentar as relações inversas em `model Residente`, junto das que já existem:

```prisma
  condicoesCronicas     CondicaoCronica[]
  alergias              Alergia[]
  restricoesAlimentares RestricaoAlimentar[]
  anotacoesSaude        AnotacaoSaude[]
  sinaisVitais          SinalVital[]
  exames                Exame[]
  consultas             Consulta[]
  vacinas               Vacina[]
```

E em `model Documento`, as inversas do anexo:

```prisma
  exames    Exame[]
  consultas Consulta[]
```

Os índices não são decoração: `@@index([status, dataSolicitacao])` em `Exame` e
`@@index([status, dataHora])` em `Consulta` são o que sustenta a área de
pendências, que varre **todos** os residentes; os `@@index([residenteId, <data>])`
sustentam a linha do tempo, que é cinco consultas por residente.

- [ ] **Passo 4: Gerar a migration**

```bash
npx dotenv -e .env -- npx prisma migrate dev --name prontuario_fase_2a --skip-seed
```

Se o Prisma pedir reset do banco por checksum divergente de migration antiga,
**não aceite o reset**. Escreva a migration à mão em
`prisma/migrations/<AAAAMMDDHHMMSS>_prontuario_fase_2a/migration.sql` e aplique
com `npx dotenv -e .env -- npx prisma migrate deploy`. O README explica o
porquê, na seção "Banco e usuário inicial".

- [ ] **Passo 5: Acrescentar as oito entidades a `EntidadeAuditada`**

Em `src/modules/audit/auditoria.service.ts`, na união `EntidadeAuditada`,
acrescentar após `'LogAuditoria'`:

```ts
  | 'CondicaoCronica'
  | 'Alergia'
  | 'RestricaoAlimentar'
  | 'AnotacaoSaude'
  | 'SinalVital'
  | 'Exame'
  | 'Consulta'
  | 'Vacina'
```

- [ ] **Passo 6: Rodar o typecheck e ver a tela de auditoria quebrar**

Rodar: `npx tsc --noEmit`
Esperado: FALHA em `src/app/(app)/auditoria/page.tsx` — `Record<EntidadeAuditada, string>`
sem as oito chaves novas. É a rede funcionando: entidade sem rótulo não compila.

- [ ] **Passo 7: Dar rótulo às oito**

Em `src/app/(app)/auditoria/page.tsx`, em `ROTULO_ENTIDADE`:

```ts
  CondicaoCronica: 'Condição crônica',
  Alergia: 'Alergia',
  RestricaoAlimentar: 'Restrição alimentar',
  AnotacaoSaude: 'Anotação de saúde',
  SinalVital: 'Sinal vital',
  Exame: 'Exame',
  Consulta: 'Consulta',
  Vacina: 'Vacina',
```

- [ ] **Passo 8: Aplicar no banco de teste e rodar tudo**

```bash
npx dotenv -e .env.test -- npx prisma migrate deploy
npx tsc --noEmit && npx eslint && npm test
```
Esperado: typecheck e lint limpos; o teste do Passo 1 passa; nenhum teste
existente quebra.

- [ ] **Passo 9: Commitar**

```bash
git add prisma/ src/modules/audit/auditoria.service.ts "src/app/(app)/auditoria/page.tsx" tests/fundacao.test.ts
git commit -m "Acrescenta o schema do prontuario da Fase 2A"
```

---

## Tarefa 2: Estreitar a anotação geral para o não-clínico

**Arquivos:**
- Modificar: `prisma/schema.prisma` (enum `CategoriaAnotacao`)
- Criar: `prisma/migrations/<carimbo>_anotacao_geral_nao_clinica/migration.sql`
- Modificar: `src/modules/residents/anotacoes.service.ts`
- Modificar: `src/components/formularios-ficha.tsx`
- Modificar: `src/app/(app)/residentes/[id]/page.tsx` (`ROTULO_CATEGORIA`)
- Teste: `src/modules/residents/anotacoes.service.test.ts`

**Interfaces:**
- Consome: nada de tarefas anteriores.
- Produz: `CategoriaAnotacao` reduzido a `VISITA_FAMILIA | SOCIAL | JURIDICO | OUTRO`.

- [ ] **Passo 1: Escrever o teste que falha**

Em `src/modules/residents/anotacoes.service.test.ts`:

```ts
it('recusa categoria clínica na anotação geral', async () => {
  // Clínico tem um lugar só, e é `AnotacaoSaude`. Sem esta recusa, um
  // comportamento agitado poderia ser registrado nos dois lugares e o
  // prontuário ficaria com metade da história.
  const ctx = await ctxComPapel('ADMINISTRATIVO')
  const residente = await criarResidenteDeTeste()

  await expect(
    criarAnotacao(ctx, {
      residenteId: residente.id,
      categoria: 'OCORRENCIA' as never,
      texto: 'Tentativa de registrar clínico na anotação geral.',
    })
  ).rejects.toThrow(ErroValidacao)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/modules/residents/anotacoes.service.test.ts`
Esperado: FALHA — a promessa resolve em vez de rejeitar.

- [ ] **Passo 3: Estreitar o enum no schema e no Zod**

Em `prisma/schema.prisma`, `enum CategoriaAnotacao` fica com
`VISITA_FAMILIA`, `SOCIAL`, `JURIDICO`, `OUTRO`. Em
`src/modules/residents/anotacoes.service.ts`, o `z.enum([...])` correspondente
perde os mesmos dois valores.

- [ ] **Passo 4: Escrever a migration à mão**

Postgres não remove valor de enum com `ALTER TYPE`. O caminho é recriar o tipo,
e os dados precisam sair antes:

```sql
-- As duas categorias clínicas passam a existir só em `anotacoes_saude`. O
-- valor antigo vai para o início do texto: em ambiente com dado real, a
-- informação não pode sumir só porque a categoria mudou de lugar.
UPDATE "anotacoes"
   SET "texto" = '[ocorrência] ' || "texto", "categoria" = 'OUTRO'
 WHERE "categoria" = 'OCORRENCIA';

UPDATE "anotacoes"
   SET "texto" = '[comportamento] ' || "texto", "categoria" = 'OUTRO'
 WHERE "categoria" = 'COMPORTAMENTO';

ALTER TYPE "CategoriaAnotacao" RENAME TO "CategoriaAnotacao_antigo";
CREATE TYPE "CategoriaAnotacao" AS ENUM ('VISITA_FAMILIA', 'SOCIAL', 'JURIDICO', 'OUTRO');
ALTER TABLE "anotacoes"
  ALTER COLUMN "categoria" TYPE "CategoriaAnotacao"
  USING ("categoria"::text::"CategoriaAnotacao");
DROP TYPE "CategoriaAnotacao_antigo";
```

- [ ] **Passo 5: Tirar as duas da tela**

Em `src/components/formularios-ficha.tsx`, `FormularioAnotacao` perde as opções
`COMPORTAMENTO` e `OCORRENCIA`. Em `src/app/(app)/residentes/[id]/page.tsx`,
`ROTULO_CATEGORIA` perde as duas chaves.

- [ ] **Passo 6: Rodar e ver passar**

```bash
npx dotenv -e .env -- npx prisma migrate deploy
npx dotenv -e .env.test -- npx prisma migrate deploy
npx tsc --noEmit && npx eslint && npm test
```
Esperado: tudo verde. Se algum teste de E2E usar `OCORRENCIA`, ele precisa
mudar para `VISITA_FAMILIA` — a categoria clínica deixou de existir ali.

- [ ] **Passo 7: Commitar**

```bash
git add prisma/ src/ tests/
git commit -m "Estreita a anotacao geral para o nao-clinico"
```

---

## Tarefa 3: Extrair a janela de edição e a retificação

**Arquivos:**
- Criar: `src/lib/janela-edicao.ts`
- Criar: `src/lib/janela-edicao.test.ts`
- Modificar: `src/modules/residents/anotacoes.service.ts`
- Modificar: `src/components/formularios-anotacao.tsx` (import da constante)

**Interfaces:**
- Produz:
  - `export const JANELA_EDICAO_MINUTOS = 15`
  - `export function prazoDeEdicao(): Date` — o `editavelAte` de um registro criado agora
  - `export function exigirJanelaAberta(editavelAte: Date, autorId: string | null, ctx: Ctx): void`
    — lança `ErroValidacao` com a mensagem do prazo se expirou, e `ErroPermissao`
    se `autorId !== ctx.usuarioId`

- [ ] **Passo 1: Escrever o teste que falha**

Em `src/lib/janela-edicao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prazoDeEdicao, exigirJanelaAberta, JANELA_EDICAO_MINUTOS } from './janela-edicao'
import { ErroPermissao, ErroValidacao } from './erros'
import type { Ctx } from './contexto'

const ctx: Ctx = {
  usuarioId: 'usr_1',
  email: 'teste@lar.local',
  papel: 'SAUDE',
}

describe('exigirJanelaAberta', () => {
  it('deixa o autor corrigir dentro do prazo', () => {
    expect(() => exigirJanelaAberta(prazoDeEdicao(), 'usr_1', ctx)).not.toThrow()
  })

  it('recusa depois do prazo, mandando retificar', () => {
    // A regra R3: passada a janela, a original nunca muda — a correção vira
    // registro novo, vinculado. É o que a fiscalização lê.
    const expirado = new Date(Date.now() - 60_000)
    expect(() => exigirJanelaAberta(expirado, 'usr_1', ctx)).toThrow(ErroValidacao)
  })

  it('recusa quem não escreveu, mesmo dentro do prazo', () => {
    expect(() => exigirJanelaAberta(prazoDeEdicao(), 'usr_2', ctx)).toThrow(ErroPermissao)
  })

  it('recusa quando a anotação não tem autor registrado', () => {
    // Anotação sem autor é anterior ao campo, ou veio do seed: ninguém a
    // "escreveu", então ninguém a edita. Retificar continua aberto.
    expect(() => exigirJanelaAberta(prazoDeEdicao(), null, ctx)).toThrow(ErroPermissao)
  })

  it('o prazo é de JANELA_EDICAO_MINUTOS a partir de agora', () => {
    const margem = Math.abs(
      prazoDeEdicao().getTime() - (Date.now() + JANELA_EDICAO_MINUTOS * 60_000)
    )
    expect(margem).toBeLessThan(1_000)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/lib/janela-edicao.test.ts`
Esperado: FALHA ao carregar o módulo — `Failed to load url ./janela-edicao`.

- [ ] **Passo 3: Escrever o módulo**

```ts
import { ErroPermissao, ErroValidacao } from './erros'
import type { Ctx } from './contexto'

/**
 * Regra R3 do design: anotação é editável pelo autor por 15 minutos; depois
 * disso a correção só entra como registro novo, vinculado à original, que
 * nunca é alterada.
 *
 * Mora aqui, e não dentro de um dos serviços, porque duas entidades a seguem —
 * `Anotacao` (geral) e `AnotacaoSaude` (prontuário). Duas cópias da mesma regra
 * divergem, e esta é uma regra que a fiscalização lê.
 */
export const JANELA_EDICAO_MINUTOS = 15

export function prazoDeEdicao(): Date {
  return new Date(Date.now() + JANELA_EDICAO_MINUTOS * 60_000)
}

export function exigirJanelaAberta(
  editavelAte: Date,
  autorId: string | null,
  ctx: Ctx
): void {
  // A autoria vem antes do prazo de propósito: para quem não escreveu, o
  // prazo é irrelevante, e "a janela expirou" sugeriria que chegar antes
  // teria adiantado.
  if (autorId !== ctx.usuarioId) {
    throw new ErroPermissao()
  }

  if (editavelAte.getTime() < Date.now()) {
    throw new ErroValidacao(
      `A janela de ${JANELA_EDICAO_MINUTOS} minutos para edição expirou. Registre uma retificação.`
    )
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/lib/janela-edicao.test.ts`
Esperado: PASSA, 5 testes.

- [ ] **Passo 5: Trocar a cópia de `anotacoes.service.ts` pelo módulo**

Em `src/modules/residents/anotacoes.service.ts`, remover a constante e a
verificação inline, importando de `@/lib/janela-edicao`. Reexportar
`JANELA_EDICAO_MINUTOS` de lá para não quebrar
`src/components/formularios-anotacao.tsx`, ou ajustar o import daquele arquivo —
prefira ajustar o import: reexportar esconde de onde a regra vem.

- [ ] **Passo 6: Rodar a suíte inteira**

Rodar: `npm test`
Esperado: os testes de `anotacoes.service.test.ts` continuam **todos** verdes,
sem nenhuma alteração neles. É essa ausência de alteração que prova que a
extração não mudou comportamento.

- [ ] **Passo 7: Commitar**

```bash
git add src/lib/janela-edicao.ts src/lib/janela-edicao.test.ts src/modules/residents/anotacoes.service.ts src/components/formularios-anotacao.tsx
git commit -m "Extrai a janela de edicao para ser compartilhada pelas duas anotacoes"
```

---

## Tarefa 4: As três entidades do cabeçalho clínico

**Arquivos:**
- Criar: `src/modules/health/cabecalho.service.ts`
- Criar: `src/modules/health/cabecalho.service.test.ts`

**Interfaces:**
- Consome: os modelos da Tarefa 1.
- Produz:
  - `registrarCondicaoCronica(ctx, dados): Promise<CondicaoCronica>`
  - `registrarAlergia(ctx, dados): Promise<Alergia>`
  - `registrarRestricaoAlimentar(ctx, dados): Promise<RestricaoAlimentar>`
  - `desativarCondicaoCronica(ctx, id): Promise<void>`
  - `desativarAlergia(ctx, id): Promise<void>`
  - `desativarRestricaoAlimentar(ctx, id): Promise<void>`
  - `obterCabecalhoClinico(ctx, residenteId): Promise<CabecalhoClinico>` onde
    `CabecalhoClinico = { alergias: Alergia[]; condicoes: CondicaoCronica[]; restricoes: RestricaoAlimentar[] }`

- [ ] **Passo 1: Escrever os testes que falham**

Em `src/modules/health/cabecalho.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { prisma } from '@/lib/prisma'
import {
  registrarAlergia,
  registrarCondicaoCronica,
  registrarRestricaoAlimentar,
  desativarAlergia,
  obterCabecalhoClinico,
} from './cabecalho.service'

describe('registrarAlergia', () => {
  it('grava a alergia e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const alergia = await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Dipirona',
      tipo: 'MEDICAMENTO',
      gravidade: 'GRAVE',
      reacao: 'Edema de glote',
    })

    expect(alergia.agente).toBe('Dipirona')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Alergia', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    // A fronteira da §7: prontuário inteiro fora do alcance desse papel.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarAlergia(ctx, {
        residenteId: residente.id,
        agente: 'Dipirona',
        tipo: 'MEDICAMENTO',
        gravidade: 'GRAVE',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('obterCabecalhoClinico', () => {
  it('traz só o que está ativo, com a alergia mais grave primeiro', async () => {
    // A ordem não é estética: quem lê o cabeçalho antes de encostar na pessoa
    // precisa ver o edema de glote antes da coceira.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Poeira',
      tipo: 'OUTRO',
      gravidade: 'LEVE',
    })
    await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Dipirona',
      tipo: 'MEDICAMENTO',
      gravidade: 'GRAVE',
    })
    const antiga = await registrarAlergia(ctx, {
      residenteId: residente.id,
      agente: 'Camarão',
      tipo: 'ALIMENTO',
      gravidade: 'MODERADA',
    })
    await desativarAlergia(ctx, antiga.id)

    await registrarCondicaoCronica(ctx, {
      residenteId: residente.id,
      descricao: 'Hipertensão arterial',
      cid10: 'I10',
    })
    await registrarRestricaoAlimentar(ctx, {
      residenteId: residente.id,
      descricao: 'Dieta pastosa',
    })

    const cabecalho = await obterCabecalhoClinico(ctx, residente.id)

    expect(cabecalho.alergias.map((a) => a.agente)).toEqual(['Dipirona', 'Poeira'])
    expect(cabecalho.condicoes).toHaveLength(1)
    expect(cabecalho.restricoes).toHaveLength(1)
  })

  it('nega leitura ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(obterCabecalhoClinico(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/modules/health/cabecalho.service.test.ts`
Esperado: FALHA ao carregar `./cabecalho.service`.

- [ ] **Passo 3: Escrever o serviço**

Siga o formato de `src/modules/residents/dependencia.service.ts` linha a linha:
schema Zod no topo, `exigirPapel` na primeira linha de cada função exportada,
`validar(schema, dados)`, confirmação de que o residente existe antes de gravar,
e `prisma.$transaction` com `registrarAuditoria` dentro.

A ordenação do cabeçalho:

```ts
// `GRAVE` antes de `MODERADA` antes de `LEVE`. O enum do Prisma ordena
// alfabeticamente no banco, o que poria `GRAVE` depois de `LEVE` — por isso a
// ordem é imposta aqui, e não num `orderBy`.
const PESO_GRAVIDADE: Record<Gravidade, number> = { GRAVE: 0, MODERADA: 1, LEVE: 2 }
```

Cada uma das três funções de desativação grava `ativa: false` e audita
`EXCLUIR` com `diff: { ativa: { de: true, para: false } }`, como
`excluirDocumento` faz em `src/modules/residents/documentos.service.ts`.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/modules/health/cabecalho.service.test.ts`
Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/
git commit -m "Acrescenta as tres entidades do cabecalho clinico"
```

---

## Tarefa 5: A rota do prontuário, com o cabeçalho

**Arquivos:**
- Criar: `src/app/(app)/residentes/[id]/prontuario/page.tsx`
- Criar: `src/components/cabecalho-clinico.tsx`
- Modificar: `src/app/(app)/residentes/[id]/page.tsx` (link para o prontuário)
- Teste: `tests/e2e/prontuario.spec.ts`, `tests/e2e/saude.spec.ts`

**Interfaces:**
- Consome: `obterCabecalhoClinico` (Tarefa 4), `obterResidente` e
  `obterGrauVigente` (Fase 1).
- Produz: a rota `/residentes/[id]/prontuario`.

- [ ] **Passo 1: Escrever o E2E que falha**

Em `tests/e2e/prontuario.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a coordenação abre o prontuário e vê o cabeçalho clínico', async ({ page }) => {
  const nome = `Idosa Prontuario ${Date.now()}`
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1938-05-20')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-10')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  await page.getByRole('link', { name: 'Prontuário' }).click()

  await expect(page).toHaveURL(/\/prontuario$/)
  await expect(page.getByRole('heading', { name: /Prontuário/ })).toBeVisible()
  await expect(page.getByText('Nenhuma alergia registrada.')).toBeVisible()
})
```

Em `tests/e2e/saude.spec.ts` (projeto `saude`), a recusa ao outro papel fica na
Tarefa 14, junto do resto do perfil.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx playwright test tests/e2e/prontuario.spec.ts`
Esperado: FALHA — não existe link "Prontuário" na ficha.

- [ ] **Passo 3: Escrever o componente do cabeçalho**

`src/components/cabecalho-clinico.tsx` — componente de servidor, sem `'use client'`.
Recebe `{ grau, cabecalho, ultimoSinalVital }` e desenha os cinco blocos da §3
da spec. Alergia `GRAVE` recebe `border-red-500 bg-red-50` e o texto em
`text-red-800`; as demais, o cinza padrão do sistema. Cada lista vazia mostra
uma frase própria ("Nenhuma alergia registrada.", "Nenhuma condição crônica
registrada.", "Nenhuma restrição alimentar registrada."), nunca um bloco em
branco — bloco em branco na tela clínica se lê como "não tem", e a diferença
entre "não tem" e "ninguém registrou" é grande.

O parâmetro `ultimoSinalVital` chega como `null` até a Tarefa 7, e o componente
já trata esse caso.

- [ ] **Passo 4: Escrever a página**

`src/app/(app)/residentes/[id]/prontuario/page.tsx`, no formato de
`src/app/(app)/residentes/[id]/desligar/page.tsx`: `params` como `Promise`,
`obterCtx`, `obterResidente` dentro de `try` com `notFound()` para
`ErroNaoEncontrado`.

A permissão vem do serviço: `obterCabecalhoClinico` exige COORDENACAO ou SAUDE,
então um ADMINISTRATIVO que digite a URL recebe `ErroPermissao`, cai na
fronteira de erro de `(app)/error.tsx` e a tentativa entra na trilha como
`ACESSO_NEGADO` — sem nenhuma condição escrita nesta página.

Auditar a leitura, conforme a §8 da spec:

```ts
// Prontuário é dado sensível (LGPD, art. 11) e esta tela mostra conteúdo
// clínico, não metadado — a dispensa que vale para `listarDocumentos` não
// vale aqui. Uma linha por abertura, como `obterResidente` já faz.
await registrarAuditoria(prisma, ctx, {
  acao: 'VISUALIZAR',
  entidade: 'AnotacaoSaude',
  residenteId: id,
})
```

- [ ] **Passo 5: Ligar a ficha ao prontuário**

Em `src/app/(app)/residentes/[id]/page.tsx`, junto dos links de "Editar
cadastro" e "Registrar saída", acrescentar o link para `prontuario` —
condicionado a `ctx.papel !== 'ADMINISTRATIVO'`, pelo mesmo motivo dos outros:
esconder poupa um erro previsível, quem barra é o serviço.

- [ ] **Passo 6: Rodar e ver passar**

Rodar: `npx playwright test tests/e2e/prontuario.spec.ts`
Esperado: PASSA.

- [ ] **Passo 7: Commitar**

```bash
git add "src/app/(app)/residentes/" src/components/cabecalho-clinico.tsx tests/e2e/prontuario.spec.ts
git commit -m "Abre a rota do prontuario com o cabecalho clinico"
```

---

## Tarefa 6: Anotação de saúde, com janela e retificação

**Arquivos:**
- Criar: `src/modules/health/anotacoes-saude.service.ts`
- Criar: `src/modules/health/anotacoes-saude.service.test.ts`

**Interfaces:**
- Consome: `prazoDeEdicao`, `exigirJanelaAberta` (Tarefa 3).
- Produz:
  - `criarAnotacaoSaude(ctx, dados): Promise<AnotacaoSaude>`
  - `editarAnotacaoSaude(ctx, id, texto): Promise<AnotacaoSaude>`
  - `retificarAnotacaoSaude(ctx, id, dados): Promise<AnotacaoSaude>`
  - `listarAnotacoesSaude(ctx, residenteId): Promise<AnotacaoSaude[]>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('criarAnotacaoSaude', () => {
  it('grava com autor, turno e o momento em que ocorreu', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const ocorridoEm = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const anotacao = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'INTERCORRENCIA',
      turno: 'NOITE',
      texto: 'Queda da própria altura ao ir ao banheiro. Sem lesão aparente.',
      gravidade: 'MODERADA',
      conduta: 'Observação por 24h e comunicação à família.',
      ocorridoEm,
    })

    expect(anotacao.autorId).toBe(ctx.usuarioId)
    // `ocorridoEm` é diferente de `criadoEm`: quem registra às 6h o que houve
    // às 3h precisa poder dizer isso, senão a linha do tempo mente sobre a
    // madrugada.
    expect(anotacao.ocorridoEm.getTime()).toBe(ocorridoEm.getTime())
    expect(anotacao.criadoEm.getTime()).toBeGreaterThan(ocorridoEm.getTime())
  })

  it('recusa data de ocorrência no futuro', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      criarAnotacaoSaude(ctx, {
        residenteId: residente.id,
        categoria: 'EVOLUCAO',
        turno: 'MANHA',
        texto: 'Registro com data futura.',
        ocorridoEm: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      criarAnotacaoSaude(ctx, {
        residenteId: residente.id,
        categoria: 'EVOLUCAO',
        turno: 'MANHA',
        texto: 'Tentativa do administrativo.',
        ocorridoEm: new Date(),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('editarAnotacaoSaude', () => {
  it('recusa quem não escreveu, mesmo dentro da janela', async () => {
    const autora = await ctxComPapel('SAUDE')
    const outra = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(autora, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Aceitou o café da manhã por completo.',
      ocorridoEm: new Date(),
    })

    await expect(
      editarAnotacaoSaude(outra, anotacao.id, 'Texto de outra pessoa.')
    ).rejects.toThrow(ErroPermissao)
  })

  it('recusa depois da janela expirada', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anotacao = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Aceitou o café da manhã por completo.',
      ocorridoEm: new Date(),
    })

    // Envelhece o registro no banco em vez de esperar 15 minutos.
    await prisma.anotacaoSaude.update({
      where: { id: anotacao.id },
      data: { editavelAte: new Date(Date.now() - 1000) },
    })

    await expect(
      editarAnotacaoSaude(ctx, anotacao.id, 'Correção fora do prazo.')
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('retificarAnotacaoSaude', () => {
  it('cria registro novo vinculado e deixa a original intacta', async () => {
    // R3: a original nunca é alterada. É o que faz a trilha valer alguma
    // coisa para quem a lê depois.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const original = await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Recusou o almoço.',
      ocorridoEm: new Date(),
    })

    const retificacao = await retificarAnotacaoSaude(ctx, original.id, {
      texto: 'Recusou o almoço; aceitou a sobremesa.',
    })

    expect(retificacao.retificaAnotacaoSaudeId).toBe(original.id)
    expect(retificacao.categoria).toBe('EVOLUCAO')

    const intacta = await prisma.anotacaoSaude.findUniqueOrThrow({
      where: { id: original.id },
    })
    expect(intacta.texto).toBe('Recusou o almoço.')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/modules/health/anotacoes-saude.service.test.ts`
Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

Espelhe `src/modules/residents/anotacoes.service.ts`, com três diferenças:
`turno` e `ocorridoEm` obrigatórios; `gravidade` e `conduta` opcionais
(`.nullish()`); e a janela vindo de `@/lib/janela-edicao` em vez de constante
local. A retificação herda `categoria` e `turno` da original quando não vierem,
como `retificarAnotacao` já faz com a categoria.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 6 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/anotacoes-saude.service.ts src/modules/health/anotacoes-saude.service.test.ts
git commit -m "Acrescenta a anotacao de saude, com janela e retificacao"
```

---

## Tarefa 7: Sinais vitais

**Arquivos:**
- Criar: `src/modules/health/sinais-vitais.service.ts`
- Criar: `src/modules/health/sinais-vitais.service.test.ts`
- Modificar: `src/components/cabecalho-clinico.tsx` (última aferição)

**Interfaces:**
- Produz:
  - `registrarSinalVital(ctx, dados): Promise<SinalVital>`
  - `listarSinaisVitais(ctx, residenteId): Promise<SinalVital[]>`
  - `obterUltimoSinalVital(ctx, residenteId): Promise<SinalVital | null>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('registrarSinalVital', () => {
  it('aceita aferição parcial', async () => {
    // Quem afere só a pressão não deve ser obrigado a inventar uma saturação.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date(),
      pressaoSistolica: 130,
      pressaoDiastolica: 80,
    })

    expect(sinal.pressaoSistolica).toBe(130)
    expect(sinal.saturacaoO2).toBeNull()
  })

  it('recusa aferição sem nenhuma medida', async () => {
    // Um registro sem nenhum número não é uma aferição: é uma linha vazia na
    // linha do tempo, ocupando o lugar de uma de verdade.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(),
        observacao: 'Paciente dormindo.',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa aferição no futuro', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(Date.now() + 86_400_000),
        temperatura: 36.5,
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: new Date(),
        temperatura: 36.5,
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('obterUltimoSinalVital', () => {
  it('devolve a aferição mais recente, não a última gravada', async () => {
    // Registro retroativo é comum: alguém lança de manhã o que aferiu de
    // madrugada. Ordenar por `criadoEm` mostraria a antiga como atual.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T08:00:00'),
      temperatura: 36.5,
    })
    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-19T08:00:00'),
      temperatura: 37.8,
    })

    const ultimo = await obterUltimoSinalVital(ctx, residente.id)
    expect(Number(ultimo?.temperatura)).toBe(36.5)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

A recusa da aferição vazia mora no schema Zod, não no corpo da função:

```ts
const MEDIDAS = [
  'pressaoSistolica', 'pressaoDiastolica', 'frequenciaCardiaca',
  'frequenciaRespiratoria', 'temperatura', 'saturacaoO2', 'glicemia', 'peso',
] as const

const sinalVitalSchema = z
  .object({
    residenteId: z.string().cuid(),
    aferidoEm: z.date().refine((d) => d.getTime() <= Date.now(), {
      message: 'A aferição não pode estar no futuro',
    }),
    pressaoSistolica: z.number().int().min(40).max(300).nullish(),
    pressaoDiastolica: z.number().int().min(20).max(200).nullish(),
    frequenciaCardiaca: z.number().int().min(20).max(250).nullish(),
    frequenciaRespiratoria: z.number().int().min(4).max(80).nullish(),
    temperatura: z.number().min(30).max(45).nullish(),
    saturacaoO2: z.number().int().min(50).max(100).nullish(),
    glicemia: z.number().int().min(20).max(700).nullish(),
    peso: z.number().min(20).max(300).nullish(),
    observacao: z.string().trim().nullish(),
  })
  .refine((d) => MEDIDAS.some((campo) => d[campo] != null), {
    message: 'Informe ao menos uma medida',
  })

// As faixas são de plausibilidade, não clínicas: existem para pegar dedo
// escorregado no teclado (uma temperatura de 365) antes de o número virar
// linha do prontuário. Valor fora de faixa clínica mas plausível — febre de
// 40 °C — entra normalmente: recusá-lo apagaria justamente o registro que
// mais importa.
```

`temperatura` e `peso` são `Decimal` no banco; o schema os aceita como `number`
e o Prisma converte. Ao ler, use `Number(sinal.temperatura)` — `Decimal` não é
número em JavaScript, e comparar direto dá falso negativo silencioso. É o mesmo
cuidado que `calcularDiff` já toma com `beneficioValor`.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 5 testes.

- [ ] **Passo 5: Ligar ao cabeçalho**

Em `src/components/cabecalho-clinico.tsx`, o bloco da última aferição passa a
receber dado de verdade: `PA 130×80 · 36,5 °C · SpO₂ 96% — 20/08/2026 08:00`,
omitindo as medidas ausentes. Sem aferição nenhuma, "Nenhuma aferição
registrada."

- [ ] **Passo 6: Commitar**

```bash
git add src/modules/health/ src/components/cabecalho-clinico.tsx
git commit -m "Acrescenta os sinais vitais e liga a ultima afericao ao cabecalho"
```

---

## Tarefa 8: Exames e a máquina de status

**Arquivos:**
- Criar: `src/modules/health/exames.service.ts`
- Criar: `src/modules/health/exames.service.test.ts`

**Interfaces:**
- Produz:
  - `registrarExame(ctx, dados): Promise<Exame>`
  - `atualizarExame(ctx, id, dados): Promise<Exame>`
  - `listarExames(ctx, residenteId): Promise<Exame[]>`
  - `EXAMES_EM_ABERTO: StatusExame[]` — `['SOLICITADO', 'AGENDADO', 'REALIZADO']`,
    consumido pela Tarefa 12

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('registrarExame', () => {
  it('nasce SOLICITADO e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-08-01'),
      solicitanteNome: 'Dr. Antônio Lima',
    })

    expect(exame.status).toBe('SOLICITADO')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Exame', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarExame(ctx, { residenteId: residente.id, tipo: 'Hemograma completo' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarExame', () => {
  it('exige resumo ou anexo para chegar a RESULTADO_RECEBIDO', async () => {
    // Sem isto, marcar "resultado recebido" viraria o jeito rápido de tirar o
    // exame da lista de pendências sem ninguém ter olhado o resultado — que é
    // exatamente o problema que a lista existe para pegar.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })

    await expect(
      atualizarExame(ctx, exame.id, { status: 'RESULTADO_RECEBIDO' })
    ).rejects.toThrow(ErroValidacao)

    const comResumo = await atualizarExame(ctx, exame.id, {
      status: 'RESULTADO_RECEBIDO',
      resumoResultado: 'Hemoglobina 11,2 — anemia leve.',
      dataResultado: new Date('2026-08-10'),
    })
    expect(comResumo.status).toBe('RESULTADO_RECEBIDO')
  })

  it('registra no diff só o que mudou', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const exame = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
    })

    await atualizarExame(ctx, exame.id, { status: 'AGENDADO' })

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Exame', acao: 'ATUALIZAR', entidadeId: exame.id },
    })
    expect(log.diff).toEqual({ status: { de: 'SOLICITADO', para: 'AGENDADO' } })
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

`atualizarExame` usa `calcularDiff` como `atualizarResidente` faz. A guarda do
`RESULTADO_RECEBIDO` fica no corpo da função, não no schema: ela depende do
estado gravado — o exame pode já ter anexo de uma atualização anterior — e
schema não enxerga o banco.

```ts
if (entrada.status === 'RESULTADO_RECEBIDO') {
  const resumo = entrada.resumoResultado ?? atual.resumoResultado
  const documento = entrada.documentoId ?? atual.documentoId
  if (!resumo && !documento) {
    throw new ErroValidacao(
      'Para marcar o resultado como recebido, informe o resumo ou anexe o laudo'
    )
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/exames.service.ts src/modules/health/exames.service.test.ts
git commit -m "Acrescenta os exames e a guarda do resultado recebido"
```

---

## Tarefa 9: Consultas

**Arquivos:**
- Criar: `src/modules/health/consultas.service.ts`
- Criar: `src/modules/health/consultas.service.test.ts`

**Interfaces:**
- Produz: `registrarConsulta`, `atualizarConsulta`, `listarConsultas`, com as
  mesmas assinaturas de `exames.service.ts`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('registrarConsulta', () => {
  it('aceita consulta marcada para o futuro', async () => {
    // Ao contrário de anotação e sinal vital, consulta nasce agendada: data
    // futura é o caso normal, não erro.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 7 * 86_400_000),
      especialidade: 'Cardiologia',
      local: 'UBS Central',
    })

    expect(consulta.status).toBe('AGENDADA')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarConsulta(ctx, {
        residenteId: residente.id,
        dataHora: new Date(),
        especialidade: 'Cardiologia',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('atualizarConsulta', () => {
  it('exige conduta para marcar como REALIZADA', async () => {
    // Consulta sem conduta registrada não saiu do lugar: o idoso foi, voltou,
    // e ninguém sabe o que o médico disse.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() - 86_400_000),
      especialidade: 'Cardiologia',
    })

    await expect(
      atualizarConsulta(ctx, consulta.id, { status: 'REALIZADA' })
    ).rejects.toThrow(ErroValidacao)

    const realizada = await atualizarConsulta(ctx, consulta.id, {
      status: 'REALIZADA',
      conduta: 'Mantida a medicação; retorno em 6 meses.',
    })
    expect(realizada.status).toBe('REALIZADA')
  })

  it('deixa cancelar sem conduta', async () => {
    // Consulta desmarcada não tem conduta a registrar, e exigi-la empurraria
    // a equipe a inventar texto.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const consulta = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 86_400_000),
      especialidade: 'Cardiologia',
    })

    const cancelada = await atualizarConsulta(ctx, consulta.id, { status: 'CANCELADA' })
    expect(cancelada.status).toBe('CANCELADA')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

Mesmo formato de `exames.service.ts`. A guarda do `REALIZADA` fica no corpo,
pelo mesmo motivo da guarda do `RESULTADO_RECEBIDO`.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/consultas.service.ts src/modules/health/consultas.service.test.ts
git commit -m "Acrescenta as consultas com status"
```

---

## Tarefa 10: Vacinas

**Arquivos:**
- Criar: `src/modules/health/vacinas.service.ts`
- Criar: `src/modules/health/vacinas.service.test.ts`

**Interfaces:**
- Produz: `registrarVacina(ctx, dados): Promise<Vacina>`,
  `listarVacinas(ctx, residenteId): Promise<Vacina[]>`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('registrarVacina', () => {
  it('grava a aplicação e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const vacina = await registrarVacina(ctx, {
      residenteId: residente.id,
      imunizante: 'Influenza',
      dose: 'Dose anual 2026',
      dataAplicacao: new Date('2026-04-15'),
      lote: 'ABC123',
      localAplicacao: 'Deltoide esquerdo',
    })

    expect(vacina.imunizante).toBe('Influenza')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Vacina', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa aplicação no futuro', async () => {
    // Vacina se registra depois de aplicada. Data futura aqui é erro de
    // digitação, e a carteira de vacinação é documento que a vigilância lê.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarVacina(ctx, {
        residenteId: residente.id,
        imunizante: 'Influenza',
        dose: 'Dose anual 2026',
        dataAplicacao: new Date(Date.now() + 86_400_000),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      registrarVacina(ctx, {
        residenteId: residente.id,
        imunizante: 'Influenza',
        dose: 'Dose anual 2026',
        dataAplicacao: new Date('2026-04-15'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

O menor dos seis. Sem status, sem janela, sem máquina: cria e lista.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 3 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/vacinas.service.ts src/modules/health/vacinas.service.test.ts
git commit -m "Acrescenta as vacinas"
```

---

## Tarefa 11: A linha do tempo

**Arquivos:**
- Criar: `src/modules/health/linha-do-tempo.ts`
- Criar: `src/modules/health/linha-do-tempo.test.ts`
- Criar: `src/components/linha-do-tempo.tsx`
- Modificar: `src/app/(app)/residentes/[id]/prontuario/page.tsx`

**Interfaces:**
- Consome: os serviços das Tarefas 6-9 e `listarAvaliacoes` (Fase 1).
- Produz:

```ts
export type TipoEvento =
  | 'ANOTACAO_SAUDE' | 'SINAL_VITAL' | 'EXAME' | 'CONSULTA' | 'GRAU_DEPENDENCIA'

export type EventoLinhaDoTempo = {
  id: string
  tipo: TipoEvento
  ocorridoEm: Date
  titulo: string
  detalhe: string | null
}

export async function montarLinhaDoTempo(
  ctx: Ctx,
  residenteId: string,
  filtros?: { tipos?: TipoEvento[]; de?: Date; ate?: Date }
): Promise<EventoLinhaDoTempo[]>
```

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('montarLinhaDoTempo', () => {
  it('ordena eventos de tipos diferentes pelo momento em que ocorreram', async () => {
    // O ponto inteiro da linha do tempo: a equipe pensa "o que aconteceu com
    // ela nas últimas semanas", não "abra a aba de exames".
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T14:00:00'),
      temperatura: 38.2,
    })
    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'INTERCORRENCIA',
      turno: 'MANHA',
      texto: 'Febre ao acordar.',
      ocorridoEm: new Date('2026-08-20T07:00:00'),
    })
    await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-08-20T16:00:00'),
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, {
      de: new Date('2026-08-01'),
      ate: new Date('2026-08-31'),
    })

    expect(linha.map((e) => e.tipo)).toEqual([
      'EXAME', 'SINAL_VITAL', 'ANOTACAO_SAUDE',
    ])
  })

  it('filtra por tipo', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date('2026-08-20T14:00:00'),
      temperatura: 38.2,
    })
    await criarAnotacaoSaude(ctx, {
      residenteId: residente.id,
      categoria: 'EVOLUCAO',
      turno: 'MANHA',
      texto: 'Sem intercorrências.',
      ocorridoEm: new Date('2026-08-20T07:00:00'),
    })

    const linha = await montarLinhaDoTempo(ctx, residente.id, {
      tipos: ['SINAL_VITAL'],
      de: new Date('2026-08-01'),
      ate: new Date('2026-08-31'),
    })

    expect(linha).toHaveLength(1)
    expect(linha[0].tipo).toBe('SINAL_VITAL')
  })

  it('não traz a anotação geral, que é da ficha cadastral', async () => {
    // Se a anotação geral entrasse aqui, o mesmo dado teria dois níveis de
    // acesso conforme a tela por onde fosse lido — e a fronteira do
    // ADMINISTRATIVO deixaria de fazer sentido.
    const saude = await ctxComPapel('SAUDE')
    const administrativo = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await criarAnotacao(administrativo, {
      residenteId: residente.id,
      categoria: 'VISITA_FAMILIA',
      texto: 'Filha visitou na tarde de domingo.',
    })

    const linha = await montarLinhaDoTempo(saude, residente.id)
    expect(linha).toHaveLength(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(montarLinhaDoTempo(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo**

```ts
/**
 * Cinco consultas indexadas por residente, unidas e ordenadas em memória.
 *
 * Não há tabela de índice nem `UNION` em SQL cru. Com trinta residentes e
 * janela padrão de 90 dias, cada consulta devolve dezenas de linhas, e a
 * alternativa custaria a tipagem do Prisma de ponta a ponta. O dia em que isso
 * doer é o dia de medir antes de mudar — não antes.
 */
const JANELA_PADRAO_DIAS = 90
```

Cada fonte vira `EventoLinhaDoTempo` com um `ocorridoEm` explícito, e a escolha
de qual data usar importa:

| Fonte | `ocorridoEm` | Por quê |
|---|---|---|
| `AnotacaoSaude` | `ocorridoEm` | é o momento do evento, não o do registro |
| `SinalVital` | `aferidoEm` | idem |
| `Exame` | `dataResultado ?? dataRealizacao ?? dataSolicitacao ?? criadoEm` | o exame aparece na data do que houve de mais recente com ele |
| `Consulta` | `dataHora` | é a data da consulta, passada ou futura |
| `AvaliacaoDependencia` | `dataAvaliacao` | idem |

Ordenação decrescente por `ocorridoEm`, com empate desempatado por `id` — a
ordem precisa ser estável entre carregamentos, o mesmo cuidado que
`listarDocumentos` já toma.

`exigirPapel(ctx, 'AnotacaoSaude', 'COORDENACAO', 'SAUDE')` na primeira linha:
uma checagem só, porque a linha do tempo é uma leitura só.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Escrever o componente e ligar à página**

`src/components/linha-do-tempo.tsx`: lista com um rótulo textual por tipo,
data/hora à esquerda, título e detalhe à direita. O filtro por tipo é um
formulário de servidor que escreve na query string, como o filtro de
`/auditoria` já faz — sem estado de cliente.

- [ ] **Passo 6: Commitar**

```bash
git add src/modules/health/linha-do-tempo.ts src/modules/health/linha-do-tempo.test.ts src/components/linha-do-tempo.tsx "src/app/(app)/residentes/"
git commit -m "Acrescenta a linha do tempo do prontuario"
```

---

## Tarefa 12: A área de pendências

**Arquivos:**
- Criar: `src/modules/health/pendencias.ts`
- Criar: `src/modules/health/pendencias.test.ts`
- Criar: `src/app/(app)/pendencias/page.tsx`
- Modificar: `src/app/(app)/layout.tsx` (item de menu)
- Criar: `tests/e2e/pendencias.spec.ts`

**Interfaces:**
- Consome: `EXAMES_EM_ABERTO` (Tarefa 8).
- Produz:

```ts
type ResidenteResumido = { id: string; nomeCompleto: string; nomeSocial: string | null }

export type Pendencias = {
  exames: (Exame & { residente: ResidenteResumido })[]
  consultas: (Consulta & { residente: ResidenteResumido })[]
}

export async function listarPendencias(ctx: Ctx): Promise<Pendencias>
```

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('listarPendencias', () => {
  it('traz exame realizado sem resultado, e não traz o já recebido', async () => {
    // Exame feito cujo resultado ninguém buscou é exatamente o caso que o
    // módulo existe para pegar — por isso REALIZADO conta como pendente.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const emAberto = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma completo',
      dataSolicitacao: new Date('2026-07-01'),
    })
    await atualizarExame(ctx, emAberto.id, { status: 'REALIZADO' })

    const resolvido = await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Raio-X de tórax',
      dataSolicitacao: new Date('2026-07-02'),
    })
    await atualizarExame(ctx, resolvido.id, {
      status: 'RESULTADO_RECEBIDO',
      resumoResultado: 'Sem alterações.',
    })

    const pendencias = await listarPendencias(ctx)
    const tipos = pendencias.exames.map((e) => e.tipo)

    expect(tipos).toContain('Hemograma completo')
    expect(tipos).not.toContain('Raio-X de tórax')
  })

  it('atravessa residentes, com a pendência mais antiga primeiro', async () => {
    // Esquecer acontece entre residentes: ninguém percebe abrindo trinta
    // fichas uma a uma. E a mais antiga é a mais esquecida.
    const ctx = await ctxComPapel('SAUDE')
    const primeira = await criarResidenteDeTeste()
    const segunda = await criarResidenteDeTeste()

    await registrarExame(ctx, {
      residenteId: segunda.id,
      tipo: 'Exame recente',
      dataSolicitacao: new Date('2026-08-01'),
    })
    await registrarExame(ctx, {
      residenteId: primeira.id,
      tipo: 'Exame antigo',
      dataSolicitacao: new Date('2026-05-01'),
    })

    const pendencias = await listarPendencias(ctx)
    expect(pendencias.exames.map((e) => e.tipo)).toEqual(['Exame antigo', 'Exame recente'])
  })

  it('traz consulta agendada e não traz a cancelada', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 5 * 86_400_000),
      especialidade: 'Cardiologia',
    })
    const desmarcada = await registrarConsulta(ctx, {
      residenteId: residente.id,
      dataHora: new Date(Date.now() + 6 * 86_400_000),
      especialidade: 'Oftalmologia',
    })
    await atualizarConsulta(ctx, desmarcada.id, { status: 'CANCELADA' })

    const pendencias = await listarPendencias(ctx)
    const especialidades = pendencias.consultas.map((c) => c.especialidade)

    expect(especialidades).toContain('Cardiologia')
    expect(especialidades).not.toContain('Oftalmologia')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(listarPendencias(ctx)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo e a página**

O `include: { residente: { select: … } }` traz o nome junto, numa consulta só —
a alternativa seria N+1 numa tela que a equipe abre todo dia.

Na página, as consultas de data já passada aparecem no topo e destacadas, com
"aguardando registro" ao lado: a consulta que aconteceu e ninguém registrou é
indistinguível, para o sistema, da que foi esquecida, e as duas precisam da
mesma atenção humana.

O item de menu em `src/app/(app)/layout.tsx`:

```ts
{ href: '/pendencias', rotulo: 'Pendências', papeis: ['COORDENACAO', 'SAUDE'] },
```

Entra **antes** de "Funcionários": é tela de rotina diária, e as de rotina ficam
no topo.

- [ ] **Passo 4: Escrever o E2E**

Em `tests/e2e/pendencias.spec.ts`, um teste só, que percorre o caminho inteiro:
cadastra residente, abre o prontuário, registra um exame, confere que ele
aparece em `/pendencias`, volta ao prontuário e marca o resultado recebido com
resumo, e confere que sumiu de `/pendencias`. É o teste que prova a razão de
ser do módulo — nenhum teste de unidade cobre a ida e a volta pela tela.

- [ ] **Passo 5: Rodar tudo e commitar**

```bash
npx tsc --noEmit && npx eslint && npm test && npx playwright test
git add src/modules/health/pendencias.ts src/modules/health/pendencias.test.ts "src/app/(app)/" tests/e2e/pendencias.spec.ts
git commit -m "Acrescenta a area de pendencias de exames e consultas"
```

---

## Tarefa 13: Os três botões grandes do celular

**Arquivos:**
- Criar: `src/components/formularios-prontuario.tsx`
- Criar: `src/app/(app)/residentes/[id]/prontuario/acoes.ts`
- Modificar: `src/app/(app)/residentes/[id]/prontuario/page.tsx`
- Modificar: `tests/e2e/prontuario.spec.ts`

**Interfaces:**
- Consome: os serviços das Tarefas 4 e 6-10.
- Produz: `acaoRegistrarEvolucao`, `acaoRegistrarSinalVital`,
  `acaoRegistrarIntercorrencia`, `acaoRegistrarExame`, `acaoAtualizarExame`,
  `acaoRegistrarConsulta`, `acaoAtualizarConsulta`, `acaoRegistrarVacina`,
  `acaoRegistrarAlergia`, `acaoRegistrarCondicaoCronica`,
  `acaoRegistrarRestricaoAlimentar`.

- [ ] **Passo 1: Escrever o E2E que falha**

Em `tests/e2e/prontuario.spec.ts`, acrescentar um teste que abre o prontuário,
clica em "Evolução", preenche **só o texto**, envia, e confere que o evento
aparece na linha do tempo com o turno e a hora preenchidos sozinhos. A §9 do
design é a razão do teste: se registrar der trabalho, ninguém registra, e o
sistema vira um caderno digital vazio.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — não existe botão "Evolução".

- [ ] **Passo 3: Escrever as ações e os formulários**

Três botões no topo do prontuário, abaixo do cabeçalho, em
`grid grid-cols-3 gap-2` com `py-4` — alvo de toque grande, como o `Campo` já
faz com a caixa de seleção. Cada um abre um `<details>` com o formulário curto,
no mesmo padrão das seções da ficha.

O `turno` é derivado da hora quando não informado, e o critério precisa estar
explícito no código, não implícito:

```ts
// Manhã 6h–13h59, tarde 14h–21h59, noite 22h–5h59. Não é a divisão de escala
// do Lar — é a que a equipe usa ao dizer "no turno da noite ela…". Continua
// editável no formulário; isto é só o palpite inicial.
```

Data e hora vêm preenchidas com o agora, editáveis, para o registro retroativo
da madrugada continuar possível.

As demais seções (exames, consultas, vacinas, e as três do cabeçalho) usam
`FormularioSimples` dentro de `<details>`, como a ficha da Fase 1 faz.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 5: Commitar**

```bash
git add src/components/formularios-prontuario.tsx "src/app/(app)/residentes/" tests/e2e/prontuario.spec.ts
git commit -m "Acrescenta os tres botoes de registro rapido do prontuario"
```

---

## Tarefa 14: O perfil SAUDE de ponta a ponta, e a recusa do ADMINISTRATIVO

**Arquivos:**
- Modificar: `tests/e2e/saude.spec.ts`
- Criar: `tests/e2e/administrativo.spec.ts`
- Modificar: `playwright.config.ts`, `tests/e2e/credenciais.ts`,
  `tests/e2e/global-setup.ts`, `tests/e2e/auth.setup.ts`
- Modificar: `README.md`
- Criar: `docs/operacao/pendencias-fase-2a.md`

**Interfaces:**
- Consome: tudo.

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/e2e/saude.spec.ts`, o turno inteiro: abrir o prontuário do residente
fixo do perfil SAUDE, registrar evolução, sinais vitais e intercorrência,
conferir os três na linha do tempo na ordem certa, filtrar por "Sinais vitais"
e conferir que sobra um.

Em `tests/e2e/administrativo.spec.ts`, a fronteira exercitada por onde ela seria
furada — pela URL: abrir `/residentes/<id>/prontuario` com a sessão do
administrativo, conferir a tela de erro em pt-BR sem vazar mensagem interna, e
então abrir `/auditoria` com a sessão da coordenação (segundo contexto do
navegador, como `auditoria.spec.ts` já faz) e conferir a linha "Acesso negado".

- [ ] **Passo 2: Criar o terceiro perfil autenticado**

`playwright.config.ts` ganha o projeto `administrativo`, espelhando o `saude`:
`testMatch: /administrativo\.spec\.ts/`, `storageState: 'tests/e2e/.sessao-administrativo.json'`,
`dependencies: ['setup']`. O projeto `autenticado` ganha
`administrativo\.spec\.ts` no `testIgnore`. `credenciais.ts` ganha
`EMAIL_ADMINISTRATIVO` e `SENHA_ADMINISTRATIVO`; `global-setup.ts` garante a
conta; `auth.setup.ts` faz o login e grava a sessão.

O motivo de existir um terceiro perfil é o mesmo que criou o segundo: metade da
interface é condicionada a papel, e o defeito do anexo clínico da Fase 1 se
escondeu justamente onde nenhum teste rodava com outro papel.

- [ ] **Passo 3: Rodar e ver falhar, depois passar**

Rodar: `npx playwright test`
Esperado: falham só os testes novos; implementados, os quatro projetos passam.

- [ ] **Passo 4: Atualizar a documentação**

- `README.md`: a lista de módulos ganha o prontuário; a seção de testes ganha o
  terceiro perfil E2E.
- `docs/operacao/pendencias-fase-2a.md`, novo, no formato do de Fase 1: entram
  as duas questões que a §12 da spec deixou abertas — o cabeçalho clínico
  invisível ao ADMINISTRATIVO e a ausência de alerta para sinal vital fora de
  faixa — mais o que surgir durante a execução.

- [ ] **Passo 5: Verificação final e commit**

```bash
npx tsc --noEmit && npx eslint && npm test && npx playwright test
git add -A
git commit -m "Fecha a Fase 2A com o perfil E2E do administrativo"
```

---

## Ordem e dependências

```
1 (schema) ──┬── 2 (estreitar anotação geral)
             ├── 3 (extrair janela) ──── 6 (anotação de saúde) ──┐
             ├── 4 (cabeçalho) ── 5 (rota) ───────────┐          │
             ├── 7 (sinais vitais) ──────────────────┼──────────┼── 11 ── 13 ── 14
             ├── 8 (exames) ─────────────────────────┤          │
             ├── 9 (consultas) ──────────────────────┘          │
             └── 10 (vacinas) ──────────────────────────────────┘
                          8, 9 ─── 12 (pendências)
```

As tarefas 2, 3, 4, 7, 8, 9 e 10 só dependem da 1 e podem sair em qualquer
ordem entre si. A 11 precisa de 6, 7, 8 e 9. A 12 precisa de 8 e 9. A 13 precisa
da 5 e das de serviço. A 14 é a última.
