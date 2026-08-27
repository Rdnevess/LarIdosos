# Alerta de sinal vital fora de faixa — Plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** que uma pressão de 200×120 aferida agora apareça sozinha para quem cuida, em vez de esperar alguém abrir a ficha.

**Arquitetura:** duas tabelas novas (`FaixaReferencia`, `AlertaDispensado`) e um módulo puro que compara aferição com faixa. O alerta é **derivado na leitura**, como as doses previstas: não há tabela de alertas nem processo que os crie. A tela é a `/pendencias`, que já atravessa todos os residentes.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions), Prisma 6, PostgreSQL 18, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-alerta-sinal-vital-design.md`

## Restrições globais

- **Papéis:** alertas e faixas exigem `COORDENACAO` ou `SAUDE`. `ADMINISTRATIVO` recebe `ErroPermissao`, e a tentativa vira `ACESSO_NEGADO` na trilha — `exigirPapel` já faz isso sozinho.
- **Auditoria:** toda escrita de faixa e todo dispensar deixam linha, na mesma transação que gravou.
- **Idioma:** interface e mensagens em pt-BR.
- **Nada de exclusão física:** dispensar cria linha; desfazer apaga a linha do dispensar, nunca o sinal vital.
- **Comandos:** unidade `npx dotenv -e .env.test -- vitest run <arquivo>`; E2E `npx playwright test <arquivo>`; `npx tsc --noEmit` e `npx eslint` limpos antes de cada commit.
- **Migrations:** aplicar nos dois bancos — `npx dotenv -e .env.test -- prisma migrate deploy` e `npx dotenv -e .env -- prisma migrate deploy` —, e rodar `npx prisma generate` depois.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | enum `MedidaVital`, models `FaixaReferencia` e `AlertaDispensado` |
| `src/modules/health/faixas.ts` | **puro**: faixas do sistema e a comparação valor↔faixa |
| `src/modules/health/faixas.test.ts` | unidade do módulo puro |
| `src/modules/health/faixas.service.ts` | ler e gravar `FaixaReferencia`, com papel e auditoria |
| `src/modules/health/faixas.service.test.ts` | unidade do serviço, contra o banco |
| `src/modules/health/alertas-vitais.ts` | derivação: aferições recentes + faixas + dispensados → alertas |
| `src/modules/health/alertas-vitais.test.ts` | unidade da derivação |
| `src/modules/health/pendencias.ts` | passa a incluir os alertas na sequência paginada |
| `src/app/(app)/pendencias/page.tsx` | a seção de alertas, com o botão de dispensar |
| `src/app/(app)/pendencias/acoes.ts` | Server Action de dispensar |
| `tests/e2e/alertas-vitais.spec.ts` | a travessia pela tela |

O módulo puro (`faixas.ts`) fica separado do serviço de propósito: a comparação é a regra que decide quem é alertado, e ela precisa ser testável sem banco — como `janela-edicao.ts` e `turno.ts` já são.

---

### Task 1: O módulo puro das faixas

**Files:**
- Create: `src/modules/health/faixas.ts`
- Test: `src/modules/health/faixas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `MEDIDAS_VITAIS: readonly MedidaVital[]`, `ROTULO_MEDIDA: Record<MedidaVital, string>`, `FAIXAS_DO_SISTEMA: Record<MedidaVital, Faixa>`, `type Faixa = { minimo: number | null; maximo: number | null }`, `foraDaFaixa(valor: number, faixa: Faixa): boolean`, `faixaVigente(medida, ajustes): Faixa`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/modules/health/faixas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  FAIXAS_DO_SISTEMA,
  MEDIDAS_VITAIS,
  ROTULO_MEDIDA,
  faixaVigente,
  foraDaFaixa,
} from './faixas'

describe('foraDaFaixa', () => {
  it('as bordas são inclusivas e não alertam', () => {
    // Um mínimo de 90 quer dizer "90 está bom". Alertar em 90 tornaria a
    // faixa uma coisa e o texto dela outra.
    const faixa = { minimo: 90, maximo: 140 }
    expect(foraDaFaixa(90, faixa)).toBe(false)
    expect(foraDaFaixa(140, faixa)).toBe(false)
    expect(foraDaFaixa(89, faixa)).toBe(true)
    expect(foraDaFaixa(141, faixa)).toBe(true)
  })

  it('faixa sem máximo só alerta por baixo', () => {
    // A saturação de oxigênio não tem "alto demais".
    const faixa = { minimo: 92, maximo: null }
    expect(foraDaFaixa(99, faixa)).toBe(false)
    expect(foraDaFaixa(100, faixa)).toBe(false)
    expect(foraDaFaixa(91, faixa)).toBe(true)
  })

  it('faixa sem mínimo só alerta por cima', () => {
    const faixa = { minimo: null, maximo: 180 }
    expect(foraDaFaixa(20, faixa)).toBe(false)
    expect(foraDaFaixa(181, faixa)).toBe(true)
  })

  it('faixa sem lado nenhum nunca alerta', () => {
    // É o que uma faixa ajustada para "não me avise sobre isto" significa.
    expect(foraDaFaixa(500, { minimo: null, maximo: null })).toBe(false)
  })
})

describe('faixaVigente', () => {
  it('sem ajuste, usa a faixa do sistema', () => {
    const vigente = faixaVigente('PRESSAO_SISTOLICA', [])
    expect(vigente).toEqual(FAIXAS_DO_SISTEMA.PRESSAO_SISTOLICA)
  })

  it('o ajuste do residente vence a faixa do sistema', () => {
    // A regra que decide quem é alertado, e a que mais custa se errar: um
    // hipertenso com faixa ajustada não pode ser medido pela do sistema.
    const vigente = faixaVigente('PRESSAO_SISTOLICA', [
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])
    expect(vigente).toEqual({ minimo: 110, maximo: 160 })
  })

  it('o ajuste de outra medida não afeta esta', () => {
    const vigente = faixaVigente('TEMPERATURA', [
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])
    expect(vigente).toEqual(FAIXAS_DO_SISTEMA.TEMPERATURA)
  })
})

describe('o inventário de medidas', () => {
  it('peso não é medida de alerta', () => {
    // 62 kg não é alarmante nem tranquilizador sem os 68 kg do mês passado.
    // Peso é tendência, e tendência é outro trabalho.
    expect(MEDIDAS_VITAIS).not.toContain('PESO')
  })

  it('toda medida tem faixa e rótulo', () => {
    // Sem isto, acrescentar uma medida ao enum e esquecer da faixa daria uma
    // coluna que nunca alerta, em silêncio.
    for (const medida of MEDIDAS_VITAIS) {
      expect(FAIXAS_DO_SISTEMA[medida], `faixa de ${medida}`).toBeDefined()
      expect(ROTULO_MEDIDA[medida], `rótulo de ${medida}`).toBeTruthy()
    }
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/faixas.test.ts`
Esperado: FAIL — `Failed to load url ./faixas`.

- [ ] **Passo 3: Implementação mínima**

Crie `src/modules/health/faixas.ts`:

```typescript
/**
 * As faixas de referência dos sinais vitais, e a comparação que decide se um
 * valor alerta.
 *
 * Módulo **puro**, sem banco: é a regra que decide quem é alertado, e regra
 * assim precisa ser testável sozinha — como `janela-edicao.ts` e `turno.ts`.
 *
 * Estas faixas são de **normalidade**, e não de urgência. A consequência foi
 * aceita ao decidir: quem viver fora delas e não tiver ajuste gera alerta todo
 * dia, e idoso hipertenso em ILPI é a regra. O ajuste por residente existe
 * para isso — ver a §3 da spec.
 */

export type MedidaVital =
  | 'PRESSAO_SISTOLICA'
  | 'PRESSAO_DIASTOLICA'
  | 'FREQUENCIA_CARDIACA'
  | 'FREQUENCIA_RESPIRATORIA'
  | 'TEMPERATURA'
  | 'SATURACAO_O2'
  | 'GLICEMIA'

export type Faixa = { minimo: number | null; maximo: number | null }

/**
 * `peso` fica de fora de propósito: ele só significa alguma coisa como
 * tendência, e um alerta por faixa fixa diria algo que não quer dizer nada.
 */
export const MEDIDAS_VITAIS = [
  'PRESSAO_SISTOLICA',
  'PRESSAO_DIASTOLICA',
  'FREQUENCIA_CARDIACA',
  'FREQUENCIA_RESPIRATORIA',
  'TEMPERATURA',
  'SATURACAO_O2',
  'GLICEMIA',
] as const satisfies readonly MedidaVital[]

/** O campo de `SinalVital` que cada medida lê. */
export const CAMPO_DA_MEDIDA: Record<MedidaVital, string> = {
  PRESSAO_SISTOLICA: 'pressaoSistolica',
  PRESSAO_DIASTOLICA: 'pressaoDiastolica',
  FREQUENCIA_CARDIACA: 'frequenciaCardiaca',
  FREQUENCIA_RESPIRATORIA: 'frequenciaRespiratoria',
  TEMPERATURA: 'temperatura',
  SATURACAO_O2: 'saturacaoO2',
  GLICEMIA: 'glicemia',
}

export const ROTULO_MEDIDA: Record<MedidaVital, string> = {
  PRESSAO_SISTOLICA: 'Pressão sistólica',
  PRESSAO_DIASTOLICA: 'Pressão diastólica',
  FREQUENCIA_CARDIACA: 'Frequência cardíaca',
  FREQUENCIA_RESPIRATORIA: 'Frequência respiratória',
  TEMPERATURA: 'Temperatura',
  SATURACAO_O2: 'Saturação de O₂',
  GLICEMIA: 'Glicemia',
}

/**
 * O ponto de partida de quem não tem ajuste.
 *
 * **Estes números são proposta, e esperam a equipe de saúde do Lar** (§3.1 e
 * §11 da spec). Trocá-los é trocar esta tabela; nada mais no desenho depende
 * dos valores.
 */
export const FAIXAS_DO_SISTEMA: Record<MedidaVital, Faixa> = {
  PRESSAO_SISTOLICA: { minimo: 90, maximo: 140 },
  PRESSAO_DIASTOLICA: { minimo: 60, maximo: 90 },
  FREQUENCIA_CARDIACA: { minimo: 50, maximo: 100 },
  FREQUENCIA_RESPIRATORIA: { minimo: 12, maximo: 20 },
  TEMPERATURA: { minimo: 35.5, maximo: 37.8 },
  // Sem máximo: não existe saturação alta demais.
  SATURACAO_O2: { minimo: 92, maximo: null },
  GLICEMIA: { minimo: 70, maximo: 180 },
}

/**
 * As bordas são **inclusivas**: um mínimo de 90 quer dizer "90 está bom".
 * Alertar em 90 tornaria a faixa uma coisa e o texto dela outra.
 */
export function foraDaFaixa(valor: number, faixa: Faixa): boolean {
  if (faixa.minimo !== null && valor < faixa.minimo) return true
  if (faixa.maximo !== null && valor > faixa.maximo) return true
  return false
}

export function faixaVigente(
  medida: MedidaVital,
  ajustes: { medida: MedidaVital; minimo: number | null; maximo: number | null }[]
): Faixa {
  const ajuste = ajustes.find((a) => a.medida === medida)
  if (!ajuste) return FAIXAS_DO_SISTEMA[medida]
  return { minimo: ajuste.minimo, maximo: ajuste.maximo }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/faixas.test.ts`
Esperado: PASS, 9 testes.

- [ ] **Passo 5: Commitar**

```bash
npx tsc --noEmit && npx eslint
git add src/modules/health/faixas.ts src/modules/health/faixas.test.ts
git commit -m "Acrescenta as faixas de referencia dos sinais vitais"
```

---

### Task 2: As duas tabelas

**Files:**
- Modify: `prisma/schema.prisma` (enum `MedidaVital`, models novos, e a ponta da relação em `SinalVital:448-468`)
- Create: `prisma/migrations/20260828000000_alerta_sinal_vital/migration.sql`

**Interfaces:**
- Consomes: `MedidaVital` da Task 1 — os valores do enum do Prisma são **os mesmos** nomes do tipo TypeScript, de propósito.
- Produz: `prisma.faixaReferencia` e `prisma.alertaDispensado` no cliente gerado.

- [ ] **Passo 1: Acrescentar ao schema**

Em `prisma/schema.prisma`, junto dos outros enums:

```prisma
/// As medidas que alertam. `peso` nao esta aqui de proposito: so significa
/// alguma coisa como tendencia. Ver `src/modules/health/faixas.ts`.
enum MedidaVital {
  PRESSAO_SISTOLICA
  PRESSAO_DIASTOLICA
  FREQUENCIA_CARDIACA
  FREQUENCIA_RESPIRATORIA
  TEMPERATURA
  SATURACAO_O2
  GLICEMIA
}
```

E os dois models, depois de `SinalVital`:

```prisma
model FaixaReferencia {
  id           String      @id @default(cuid())
  residenteId  String
  residente    Residente   @relation(fields: [residenteId], references: [id])
  medida       MedidaVital
  /// Anulaveis porque nem toda medida tem os dois lados: a saturacao nao tem
  /// maximo. Decimal, e nao Float: a temperatura tem casa decimal, e erro de
  /// ponto flutuante numa comparacao que decide se alguem e alertado e o tipo
  /// de defeito que ninguem encontra.
  minimo       Decimal?    @db.Decimal(5, 1)
  maximo       Decimal?    @db.Decimal(5, 1)
  criadoEm     DateTime    @default(now())
  atualizadoEm DateTime    @updatedAt
  criadoPorId  String?

  /// Impede duas faixas concorrentes para a mesma medida do mesmo residente.
  /// Sem isto, "qual e a faixa da dona Maria" teria duas respostas.
  @@unique([residenteId, medida])
  @@map("faixas_referencia")
}

model AlertaDispensado {
  id           String      @id @default(cuid())
  usuarioId    String
  sinalVitalId String
  sinalVital   SinalVital  @relation(fields: [sinalVitalId], references: [id])
  medida       MedidaVital
  criadoEm     DateTime    @default(now())

  /// Existir e estar dispensado; nao ha booleano a manter.
  @@unique([usuarioId, sinalVitalId, medida])
  @@index([usuarioId])
  @@map("alertas_dispensados")
}
```

E, **dentro do model `SinalVital`**, antes do `@@index`, a ponta da relação — sem ela o Prisma recusa o schema:

```prisma
  alertasDispensados AlertaDispensado[]
```

E, **dentro do model `Residente`**, junto das outras relações:

```prisma
  faixasReferencia FaixaReferencia[]
```

- [ ] **Passo 2: Escrever a migration**

Crie `prisma/migrations/20260828000000_alerta_sinal_vital/migration.sql`:

```sql
-- Alerta de sinal vital fora de faixa.
--
-- Duas tabelas e nenhuma de alertas: o alerta e derivado na leitura, como as
-- doses previstas. Materializa-lo exigiria cron e, pior, sobreviveria ao
-- ajuste da faixa — um alerta gravado sob a faixa antiga continuaria existindo
-- depois de alguem corrigi-la.
CREATE TYPE "MedidaVital" AS ENUM (
  'PRESSAO_SISTOLICA', 'PRESSAO_DIASTOLICA', 'FREQUENCIA_CARDIACA',
  'FREQUENCIA_RESPIRATORIA', 'TEMPERATURA', 'SATURACAO_O2', 'GLICEMIA'
);

CREATE TABLE "faixas_referencia" (
  "id"           TEXT NOT NULL,
  "residenteId"  TEXT NOT NULL,
  "medida"       "MedidaVital" NOT NULL,
  "minimo"       DECIMAL(5,1),
  "maximo"       DECIMAL(5,1),
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "criadoPorId"  TEXT,
  CONSTRAINT "faixas_referencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faixas_referencia_residenteId_medida_key"
  ON "faixas_referencia"("residenteId", "medida");

ALTER TABLE "faixas_referencia"
  ADD CONSTRAINT "faixas_referencia_residenteId_fkey"
  FOREIGN KEY ("residenteId") REFERENCES "residentes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "alertas_dispensados" (
  "id"           TEXT NOT NULL,
  "usuarioId"    TEXT NOT NULL,
  "sinalVitalId" TEXT NOT NULL,
  "medida"       "MedidaVital" NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alertas_dispensados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alertas_dispensados_usuarioId_sinalVitalId_medida_key"
  ON "alertas_dispensados"("usuarioId", "sinalVitalId", "medida");

CREATE INDEX "alertas_dispensados_usuarioId_idx"
  ON "alertas_dispensados"("usuarioId");

ALTER TABLE "alertas_dispensados"
  ADD CONSTRAINT "alertas_dispensados_sinalVitalId_fkey"
  FOREIGN KEY ("sinalVitalId") REFERENCES "sinais_vitais"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Passo 3: Aplicar nos dois bancos e gerar o cliente**

```bash
npx dotenv -e .env.test -- prisma migrate deploy
npx dotenv -e .env -- prisma migrate deploy
npx prisma generate
```

Esperado: "All migrations have been successfully applied." nas duas.

- [ ] **Passo 4: Conferir que o schema e o banco concordam**

Run: `npx prisma migrate status` e `npx tsc --noEmit`
Esperado: sem migration pendente, e `tsc` limpo — o `prisma.faixaReferencia` já existe no cliente.

- [ ] **Passo 5: Commitar**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Acrescenta as tabelas de faixa de referencia e de alerta dispensado"
```

---

### Task 3: O serviço das faixas

**Files:**
- Create: `src/modules/health/faixas.service.ts`
- Test: `src/modules/health/faixas.service.test.ts`
- Modify: `src/modules/audit/auditoria.service.ts:20-45` (acrescentar `'FaixaReferencia'` e `'AlertaDispensado'` a `EntidadeAuditada`)

**Interfaces:**
- Consumes: `MedidaVital`, `Faixa` da Task 1; `prisma.faixaReferencia` da Task 2; `exigirPapel(ctx, entidade, ...papeis)` e `registrarAuditoria(cliente, ator, dados)` já existentes.
- Produces: `listarFaixas(ctx, residenteId): Promise<AjusteDeFaixa[]>` e `definirFaixa(ctx, residenteId, medida, faixa): Promise<void>`, com `type AjusteDeFaixa = { medida: MedidaVital; minimo: number | null; maximo: number | null }`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/modules/health/faixas.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { definirFaixa, listarFaixas } from './faixas.service'

describe('definirFaixa', () => {
  it('grava o ajuste e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', {
      minimo: 110,
      maximo: 160,
    })

    expect(await listarFaixas(ctx, residente.id)).toEqual([
      { medida: 'PRESSAO_SISTOLICA', minimo: 110, maximo: 160 },
    ])

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'FaixaReferencia', residenteId: residente.id },
    })
    expect(log.acao).toBe('CRIAR')
  })

  it('redefinir a mesma medida atualiza, e não cria uma segunda', async () => {
    // O `@@unique` do banco impede duas faixas concorrentes; aqui se prova
    // que o serviço trata isso como atualização, e não como erro na cara de
    // quem só quis corrigir o número.
    const ctx = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'TEMPERATURA', { minimo: 35, maximo: 38 })
    await definirFaixa(ctx, residente.id, 'TEMPERATURA', { minimo: 35, maximo: 38.5 })

    const faixas = await listarFaixas(ctx, residente.id)
    expect(faixas).toHaveLength(1)
    expect(faixas[0].maximo).toBe(38.5)

    const logs = await prisma.logAuditoria.count({
      where: { entidade: 'FaixaReferencia', residenteId: residente.id },
    })
    expect(logs, 'as duas escritas deixam rastro').toBe(2)
  })

  it('aceita faixa com um lado só', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await definirFaixa(ctx, residente.id, 'SATURACAO_O2', { minimo: 90, maximo: null })

    expect(await listarFaixas(ctx, residente.id)).toEqual([
      { medida: 'SATURACAO_O2', minimo: 90, maximo: null },
    ])
  })

  it('recusa faixa invertida', async () => {
    // Mínimo maior que máximo não alerta nunca nem alerta sempre — depende de
    // qual comparação roda primeiro. É erro de digitação, e o lugar de
    // recusá-lo é aqui.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', { minimo: 160, maximo: 110 })
    ).rejects.toThrow('O mínimo não pode ser maior que o máximo')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirFaixa(ctx, residente.id, 'GLICEMIA', { minimo: 70, maximo: 200 })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarFaixas', () => {
  it('devolve vazio para quem não tem ajuste', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    expect(await listarFaixas(ctx, residente.id)).toEqual([])
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarFaixas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/faixas.service.test.ts`
Esperado: FAIL — `Failed to load url ./faixas.service`.

- [ ] **Passo 3: Acrescentar as entidades à trilha**

Em `src/modules/audit/auditoria.service.ts`, na união `EntidadeAuditada` (linha 20), depois de `'AdministracaoMedicacao'`:

```typescript
  // Alerta de sinal vital.
  | 'FaixaReferencia'
  | 'AlertaDispensado'
```

- [ ] **Passo 4: Implementação mínima**

Crie `src/modules/health/faixas.service.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroValidacao } from '@/lib/erros'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import type { Faixa, MedidaVital } from './faixas'

export type AjusteDeFaixa = {
  medida: MedidaVital
  minimo: number | null
  maximo: number | null
}

/**
 * Os ajustes de faixa de um residente. Quem não tem ajuste não tem linha, e a
 * lista volta vazia — a faixa do sistema é o padrão, e não uma cópia gravada
 * em cada residente.
 */
export async function listarFaixas(
  ctx: Ctx,
  residenteId: string
): Promise<AjusteDeFaixa[]> {
  exigirPapel(ctx, 'FaixaReferencia', 'COORDENACAO', 'SAUDE')

  const linhas = await prisma.faixaReferencia.findMany({
    where: { residenteId },
    orderBy: { medida: 'asc' },
  })

  return linhas.map((linha) => ({
    medida: linha.medida,
    minimo: linha.minimo === null ? null : Number(linha.minimo),
    maximo: linha.maximo === null ? null : Number(linha.maximo),
  }))
}

/**
 * Define — ou redefine — a faixa de uma medida. Mudar a faixa muda o que o
 * sistema considera normal para aquela pessoa, e por isso é decisão clínica
 * com autor e data na trilha.
 */
export async function definirFaixa(
  ctx: Ctx,
  residenteId: string,
  medida: MedidaVital,
  faixa: Faixa
): Promise<void> {
  exigirPapel(ctx, 'FaixaReferencia', 'COORDENACAO', 'SAUDE')

  // Mínimo maior que máximo não alerta nunca nem alerta sempre, conforme a
  // ordem das comparações. É erro de digitação, e o lugar de recusá-lo é aqui.
  if (faixa.minimo !== null && faixa.maximo !== null && faixa.minimo > faixa.maximo) {
    throw new ErroValidacao('O mínimo não pode ser maior que o máximo')
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.faixaReferencia.findUnique({
      where: { residenteId_medida: { residenteId, medida } },
    })

    const salvo = await tx.faixaReferencia.upsert({
      where: { residenteId_medida: { residenteId, medida } },
      create: { residenteId, medida, ...faixa, criadoPorId: ctx.usuarioId },
      update: { ...faixa },
    })

    await registrarAuditoria(tx, ctx, {
      acao: anterior ? 'ATUALIZAR' : 'CRIAR',
      entidade: 'FaixaReferencia',
      entidadeId: salvo.id,
      residenteId,
      diff: {
        minimo: { de: anterior?.minimo ?? null, para: faixa.minimo },
        maximo: { de: anterior?.maximo ?? null, para: faixa.maximo },
      },
    })
  })
}
```

- [ ] **Passo 5: Rodar e ver passar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/faixas.service.test.ts`
Esperado: PASS, 7 testes.

- [ ] **Passo 6: Commitar**

```bash
npx tsc --noEmit && npx eslint
git add src/modules/health/faixas.service.ts src/modules/health/faixas.service.test.ts src/modules/audit/auditoria.service.ts
git commit -m "Acrescenta o servico das faixas de referencia por residente"
```

---

### Task 4: A derivação dos alertas

**Files:**
- Create: `src/modules/health/alertas-vitais.ts`
- Test: `src/modules/health/alertas-vitais.test.ts`

**Interfaces:**
- Consumes: `MEDIDAS_VITAIS`, `CAMPO_DA_MEDIDA`, `faixaVigente`, `foraDaFaixa`, `type Faixa`, `type MedidaVital` da Task 1; `prisma.faixaReferencia` e `prisma.alertaDispensado` da Task 2.
- Produces: `DIAS_DA_JANELA = 7`, `listarAlertasVitais(ctx): Promise<AlertaVital[]>` e `dispensarAlerta(ctx, sinalVitalId, medida): Promise<void>`, com
  `type AlertaVital = { sinalVitalId: string; residenteId: string; residenteNome: string; medida: MedidaVital; valor: number; faixa: Faixa; aferidoEm: Date; seguidas: number }`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/modules/health/alertas-vitais.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ErroPermissao } from '@/lib/erros'
import { ctxComPapel, criarResidenteDeTeste } from '@/../tests/helpers/fabricas'
import { registrarSinalVital } from './sinais-vitais.service'
import { definirFaixa } from './faixas.service'
import { dispensarAlerta, listarAlertasVitais } from './alertas-vitais'

const AGORA = () => new Date()
const HA_DIAS = (dias: number) => new Date(Date.now() - dias * 86_400_000)

describe('listarAlertasVitais', () => {
  it('alerta o valor fora da faixa do sistema', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria Alerta' })

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
      pressaoDiastolica: 120,
    })

    const alertas = await listarAlertasVitais(ctx)
    const sistolica = alertas.filter((a) => a.medida === 'PRESSAO_SISTOLICA')

    expect(sistolica).toHaveLength(1)
    expect(sistolica[0].valor).toBe(200)
    expect(sistolica[0].residenteNome).toBe('Maria Alerta')
  })

  it('não alerta o valor dentro da faixa', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 120,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('a faixa ajustada do residente vence a do sistema', async () => {
    // O hipertenso conhecido: 150 está fora da faixa do sistema (90–140) e
    // dentro da dele. É a regra que impede o alerta diário que ninguém lê.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await definirFaixa(ctx, residente.id, 'PRESSAO_SISTOLICA', {
      minimo: 110,
      maximo: 160,
    })

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 150,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('ignora aferição mais velha que a janela', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(8),
      pressaoSistolica: 200,
    })

    const alertas = await listarAlertasVitais(ctx)
    expect(alertas.filter((a) => a.residenteId === residente.id)).toEqual([])
  })

  it('conta quantas aferições seguidas estão fora', async () => {
    // É o que separa o evento do padrão: uma vez pede atenção, quatro seguidas
    // pedem ajuste de faixa.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    for (const dias of [3, 2, 1]) {
      await registrarSinalVital(ctx, {
        residenteId: residente.id,
        aferidoEm: HA_DIAS(dias),
        pressaoSistolica: 200,
      })
    }

    const alertas = await listarAlertasVitais(ctx)
    const doResidente = alertas.filter(
      (a) => a.residenteId === residente.id && a.medida === 'PRESSAO_SISTOLICA'
    )

    expect(doResidente).toHaveLength(3)
    // A mais recente sabe que é a terceira seguida.
    expect(Math.max(...doResidente.map((a) => a.seguidas))).toBe(3)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(listarAlertasVitais(ctx)).rejects.toThrow(ErroPermissao)
  })
})

describe('dispensarAlerta', () => {
  it('some para quem dispensou e continua para o outro', async () => {
    // A decisão do Lar: o dispensar é individual. Um usuário resolver não pode
    // esconder o alerta de quem entra no plantão seguinte.
    const ana = await ctxComPapel('SAUDE')
    const carlos = await ctxComPapel('COORDENACAO')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ana, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    await dispensarAlerta(ana, sinal.id, 'PRESSAO_SISTOLICA')

    const daAna = await listarAlertasVitais(ana)
    const doCarlos = await listarAlertasVitais(carlos)

    expect(daAna.filter((a) => a.sinalVitalId === sinal.id)).toEqual([])
    expect(doCarlos.filter((a) => a.sinalVitalId === sinal.id)).toHaveLength(1)
  })

  it('dispensar uma medida não dispensa a outra da mesma aferição', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
      pressaoDiastolica: 120,
    })

    await dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')

    const alertas = await listarAlertasVitais(ctx)
    const daAfericao = alertas.filter((a) => a.sinalVitalId === sinal.id)

    expect(daAfericao).toHaveLength(1)
    expect(daAfericao[0].medida).toBe('PRESSAO_DIASTOLICA')
  })

  it('a aferição seguinte volta a alertar, mesmo tendo dispensado a anterior', async () => {
    // O alerta é sobre a medida, e não sobre a pessoa: dispensar hoje não pode
    // esconder a piora de amanhã.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const ontem = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: HA_DIAS(1),
      pressaoSistolica: 190,
    })
    await dispensarAlerta(ctx, ontem.id, 'PRESSAO_SISTOLICA')

    const hoje = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 220,
    })

    const alertas = await listarAlertasVitais(ctx)
    const ids = alertas.map((a) => a.sinalVitalId)

    expect(ids).toContain(hoje.id)
    expect(ids).not.toContain(ontem.id)
  })

  it('dispensar duas vezes não estoura', async () => {
    // O `@@unique` recusaria o segundo insert. Clicar duas vezes é normal, e a
    // resposta certa é "já está dispensado", não um erro na tela.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const sinal = await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    await dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')
    await expect(dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')).resolves.toBeUndefined()
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const enfermeira = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const sinal = await registrarSinalVital(enfermeira, {
      residenteId: residente.id,
      aferidoEm: AGORA(),
      pressaoSistolica: 200,
    })

    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await expect(
      dispensarAlerta(ctx, sinal.id, 'PRESSAO_SISTOLICA')
    ).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/alertas-vitais.test.ts`
Esperado: FAIL — `Failed to load url ./alertas-vitais`.

- [ ] **Passo 3: Implementação mínima**

Crie `src/modules/health/alertas-vitais.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'
import {
  CAMPO_DA_MEDIDA,
  MEDIDAS_VITAIS,
  faixaVigente,
  foraDaFaixa,
  type Faixa,
  type MedidaVital,
} from './faixas'

/**
 * A janela do que conta como pendência.
 *
 * Uma pressão alta de três meses atrás não é pendência, é história — e história
 * é a linha do tempo do prontuário, que já existe. Sem janela, a tela cresceria
 * para sempre e o alerta perderia o sentido de "o que precisa de atenção".
 */
export const DIAS_DA_JANELA = 7

export type AlertaVital = {
  sinalVitalId: string
  residenteId: string
  residenteNome: string
  medida: MedidaVital
  valor: number
  faixa: Faixa
  aferidoEm: Date
  /** Quantas aferições seguidas daquela medida estão fora, contando esta. */
  seguidas: number
}

/**
 * Os alertas de todos os residentes, derivados na leitura.
 *
 * Não há tabela de alertas: materializá-los exigiria cron e sobreviveria ao
 * ajuste da faixa — um alerta gravado sob a faixa antiga continuaria existindo
 * depois de alguém corrigi-la, e alguém teria de sair apagando o que a faixa
 * nova não produz.
 */
export async function listarAlertasVitais(ctx: Ctx): Promise<AlertaVital[]> {
  exigirPapel(ctx, 'SinalVital', 'COORDENACAO', 'SAUDE')

  const desde = new Date(Date.now() - DIAS_DA_JANELA * 86_400_000)

  const [afericoes, ajustes, dispensados] = await Promise.all([
    prisma.sinalVital.findMany({
      where: { aferidoEm: { gte: desde } },
      include: { residente: { select: { nomeCompleto: true, nomeSocial: true } } },
      // Mais recente primeiro, e `id` desempata: duas aferições no mesmo
      // instante trocariam de lugar entre consultas.
      orderBy: [{ aferidoEm: 'desc' }, { id: 'desc' }],
    }),
    prisma.faixaReferencia.findMany(),
    prisma.alertaDispensado.findMany({ where: { usuarioId: ctx.usuarioId } }),
  ])

  const ajustesPorResidente = new Map<string, typeof ajustes>()
  for (const ajuste of ajustes) {
    const lista = ajustesPorResidente.get(ajuste.residenteId) ?? []
    lista.push(ajuste)
    ajustesPorResidente.set(ajuste.residenteId, lista)
  }

  const foiDispensado = new Set(
    dispensados.map((d) => `${d.sinalVitalId}|${d.medida}`)
  )

  const alertas: AlertaVital[] = []
  // Conta as seguidas por residente e medida, andando da mais recente para a
  // mais antiga. Uma aferição dentro da faixa zera a contagem.
  const seguidasPor = new Map<string, number>()

  for (const afericao of afericoes) {
    const ajustesDele = (ajustesPorResidente.get(afericao.residenteId) ?? []).map((a) => ({
      medida: a.medida,
      minimo: a.minimo === null ? null : Number(a.minimo),
      maximo: a.maximo === null ? null : Number(a.maximo),
    }))

    for (const medida of MEDIDAS_VITAIS) {
      const bruto = afericao[CAMPO_DA_MEDIDA[medida] as keyof typeof afericao]
      if (bruto === null || bruto === undefined) continue

      const valor = Number(bruto)
      const faixa = faixaVigente(medida, ajustesDele)
      const chave = `${afericao.residenteId}|${medida}`

      if (!foraDaFaixa(valor, faixa)) {
        seguidasPor.set(chave, 0)
        continue
      }

      const seguidas = (seguidasPor.get(chave) ?? 0) + 1
      seguidasPor.set(chave, seguidas)

      if (foiDispensado.has(`${afericao.id}|${medida}`)) continue

      alertas.push({
        sinalVitalId: afericao.id,
        residenteId: afericao.residenteId,
        residenteNome:
          afericao.residente.nomeSocial || afericao.residente.nomeCompleto,
        medida,
        valor,
        faixa,
        aferidoEm: afericao.aferidoEm,
        seguidas,
      })
    }
  }

  return alertas
}

/**
 * Dispensa **uma medida de uma aferição, para um usuário**.
 *
 * Existir é estar dispensado; não há booleano a manter. Não apaga nada e não
 * altera o prontuário: a aferição continua onde está, com o valor que tem.
 */
export async function dispensarAlerta(
  ctx: Ctx,
  sinalVitalId: string,
  medida: MedidaVital
): Promise<void> {
  exigirPapel(ctx, 'AlertaDispensado', 'COORDENACAO', 'SAUDE')

  const sinal = await prisma.sinalVital.findUnique({
    where: { id: sinalVitalId },
    select: { residenteId: true },
  })
  if (!sinal) return

  await prisma.$transaction(async (tx) => {
    // Clicar duas vezes é normal, e a resposta certa é "já está dispensado".
    const criado = await tx.alertaDispensado.createMany({
      data: [{ usuarioId: ctx.usuarioId, sinalVitalId, medida }],
      skipDuplicates: true,
    })
    if (criado.count === 0) return

    await registrarAuditoria(tx, ctx, {
      acao: 'ATUALIZAR',
      entidade: 'AlertaDispensado',
      entidadeId: sinalVitalId,
      residenteId: sinal.residenteId,
      diff: { medida: { de: null, para: medida } },
    })
  })
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/alertas-vitais.test.ts`
Esperado: PASS, 11 testes.

- [ ] **Passo 5: Commitar**

```bash
npx tsc --noEmit && npx eslint
git add src/modules/health/alertas-vitais.ts src/modules/health/alertas-vitais.test.ts
git commit -m "Deriva os alertas de sinal vital fora de faixa"
```

---

### Task 5: Os alertas entram nas pendências

**Files:**
- Modify: `src/modules/health/pendencias.ts` (o tipo `Pendencias` e a função `listarPendencias`)
- Test: `src/modules/health/pendencias.test.ts` (acrescentar um `describe`)

**Interfaces:**
- Consumes: `listarAlertasVitais(ctx)` e `type AlertaVital` da Task 4.
- Produces: `Pendencias` ganha `alertas: AlertaVital[]` e `totalAlertas: number`.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescente ao fim de `src/modules/health/pendencias.test.ts`:

```typescript
describe('listarPendencias — alertas de sinal vital', () => {
  it('traz o alerta junto de exames e consultas', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date(),
      pressaoSistolica: 200,
    })

    const pendencias = await listarPendencias(ctx)
    expect(pendencias.alertas.some((a) => a.residenteId === residente.id)).toBe(true)
    expect(pendencias.totalAlertas).toBeGreaterThan(0)
  })

  it('os alertas vêm primeiro na sequência paginada', async () => {
    // A ordem é decisão da spec (§6): se a página encher, o que cai para a
    // seguinte é exame agendado, nunca sinal vital.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await registrarSinalVital(ctx, {
      residenteId: residente.id,
      aferidoEm: new Date(),
      pressaoSistolica: 200,
    })
    await registrarExame(ctx, {
      residenteId: residente.id,
      tipo: 'Hemograma da ordem',
      dataSolicitacao: new Date('2026-07-01'),
    })

    const primeira = await listarPendencias(ctx, { pagina: 1, por: 20 })
    expect(primeira.alertas.length, 'alertas ocupam a página antes dos exames')
      .toBeGreaterThan(0)
  })
})
```

Acrescente o import no topo do arquivo:

```typescript
import { registrarSinalVital } from './sinais-vitais.service'
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/pendencias.test.ts`
Esperado: FAIL — `pendencias.alertas` é `undefined`.

- [ ] **Passo 3: Implementação mínima**

Em `src/modules/health/pendencias.ts`:

1. Acrescente o import:

```typescript
import { listarAlertasVitais, type AlertaVital } from './alertas-vitais'
```

2. No tipo `Pendencias`, acrescente:

```typescript
  /**
   * Vêm **antes** de exames e consultas na sequência paginada: se a página
   * encher, o que cai para a seguinte é exame agendado, e nunca sinal vital.
   */
  alertas: AlertaVital[]
  totalAlertas: number
```

3. Em `listarPendencias`, no ramo **sem** paginação, carregue os alertas junto e devolva-os inteiros:

```typescript
  const alertas = await listarAlertasVitais(ctx)
```

devolvendo `alertas`, `totalAlertas: alertas.length`, e somando `alertas.length` ao `total`.

4. No ramo **com** paginação, os alertas entram na frente da sequência. Substitua o cálculo de `cabemDeExames` por este bloco:

```typescript
  const todosAlertas = await listarAlertasVitais(ctx)
  const totalAlertas = todosAlertas.length

  const cabemDeAlertas = Math.max(0, Math.min(por, totalAlertas - deslocamento))
  const alertas = todosAlertas.slice(deslocamento, deslocamento + cabemDeAlertas)

  // O deslocamento dos exames é o que sobra depois de passar por todos os
  // alertas; o das consultas, depois de alertas e exames.
  const deslocamentoExames = Math.max(0, deslocamento - totalAlertas)
  const cabemDeExames = Math.max(
    0,
    Math.min(por - cabemDeAlertas, totalExames - deslocamentoExames)
  )
```

e ajuste o `skip` dos exames para `deslocamentoExames`, o das consultas para
`Math.max(0, deslocamento - totalAlertas - totalExames)`, o `take` das consultas
para `por - cabemDeAlertas - cabemDeExames`, e o `total` para
`totalAlertas + totalExames + totalConsultas`.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx dotenv -e .env.test -- vitest run src/modules/health/pendencias.test.ts`
Esperado: PASS — os 8 que já existiam mais os 2 novos.

- [ ] **Passo 5: Commitar**

```bash
npx tsc --noEmit && npx eslint
git add src/modules/health/pendencias.ts src/modules/health/pendencias.test.ts
git commit -m "Poe os alertas de sinal vital na frente das pendencias"
```

---

### Task 6: A seção na tela, com o botão de dispensar

**Files:**
- Create: `src/app/(app)/pendencias/acoes.ts`
- Modify: `src/app/(app)/pendencias/page.tsx`
- Test: `tests/e2e/alertas-vitais.spec.ts`

**Interfaces:**
- Consumes: `listarPendencias(ctx, { pagina, por })` da Task 5; `dispensarAlerta(ctx, sinalVitalId, medida)` da Task 4; `ROTULO_MEDIDA` da Task 1.
- Produces: Server Action `acaoDispensarAlerta(_estado, dados: FormData)`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `tests/e2e/alertas-vitais.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * A travessia que só a tela prova: o alerta aparece, é dispensado, e continua
 * existindo para outro usuário.
 *
 * O residente e a aferição são criados direto pelo Prisma — cadastrá-los pela
 * interface levaria minutos e não testaria nada que `prontuario.spec.ts` já
 * não teste. O prefixo permite apagá-los no fim.
 */
const PREFIXO = 'ZZAlerta'
const prisma = new PrismaClient()

test.beforeAll(async () => {
  await prisma.sinalVital.deleteMany({
    where: { residente: { nomeCompleto: { startsWith: PREFIXO } } },
  })
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })

  const residente = await prisma.residente.create({
    data: {
      nomeCompleto: `${PREFIXO} Maria`,
      dataNascimento: new Date('1940-01-01'),
      sexo: 'FEMININO',
      dataAdmissao: new Date('2026-01-01'),
    },
  })
  await prisma.sinalVital.create({
    data: { residenteId: residente.id, aferidoEm: new Date(), pressaoSistolica: 200 },
  })
})

test.afterAll(async () => {
  await prisma.alertaDispensado.deleteMany({
    where: { sinalVital: { residente: { nomeCompleto: { startsWith: PREFIXO } } } },
  })
  await prisma.sinalVital.deleteMany({
    where: { residente: { nomeCompleto: { startsWith: PREFIXO } } },
  })
  await prisma.residente.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } })
  await prisma.$disconnect()
})

test('o alerta aparece nas pendências e some ao ser dispensado', async ({ page }) => {
  await page.goto('/pendencias')

  const linha = page.locator('li', { hasText: `${PREFIXO} Maria` })
  await expect(linha).toContainText('Pressão sistólica')
  await expect(linha).toContainText('200')

  await linha.getByRole('button', { name: 'Dispensar' }).click()

  await expect(page.locator('li', { hasText: `${PREFIXO} Maria` })).toHaveCount(0)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/alertas-vitais.spec.ts --project=autenticado`
Esperado: FAIL — a linha do residente não existe na tela.

- [ ] **Passo 3: Criar a Server Action**

Crie `src/app/(app)/pendencias/acoes.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { obterCtx } from '@/modules/auth/sessao'
import { dispensarAlerta } from '@/modules/health/alertas-vitais'
import type { MedidaVital } from '@/modules/health/faixas'
import { MEDIDAS_VITAIS } from '@/modules/health/faixas'

export type EstadoAcao = { erro?: string }

export async function acaoDispensarAlerta(
  _estado: EstadoAcao,
  dados: FormData
): Promise<EstadoAcao> {
  const ctx = await obterCtx()

  const sinalVitalId = String(dados.get('sinalVitalId') ?? '')
  const medidaBruta = String(dados.get('medida') ?? '')

  // A medida vem do formulário e pode ser qualquer coisa. Só passa adiante se
  // for uma das sete — um valor estranho não pode virar linha no banco.
  const medida = MEDIDAS_VITAIS.find((m) => m === medidaBruta) as MedidaVital | undefined
  if (!sinalVitalId || !medida) return { erro: 'Alerta inválido' }

  await dispensarAlerta(ctx, sinalVitalId, medida)
  revalidatePath('/pendencias')
  return {}
}
```

- [ ] **Passo 4: Acrescentar a seção à tela**

Em `src/app/(app)/pendencias/page.tsx`, acrescente os imports:

```typescript
import { ROTULO_MEDIDA } from '@/modules/health/faixas'
import { formatarDataHora } from '@/lib/ptbr'
import { acaoDispensarAlerta } from './acoes'
import { Botao } from '@/components/ui/botao'
```

E a seção **antes** do `<Cartao>` de exames:

```tsx
<Cartao>
  <h2 className="mb-3 font-medium text-forte">
    Sinais vitais fora de faixa ({resultado.alertas.length} de {resultado.totalAlertas})
  </h2>
  <ul className="divide-y">
    {resultado.alertas.map((alerta) => (
      <li
        key={`${alerta.sinalVitalId}-${alerta.medida}`}
        className="flex items-start justify-between gap-3 py-2 text-suporte"
      >
        <span>
          <Link
            href={`/residentes/${alerta.residenteId}/prontuario`}
            className="font-medium text-forte underline"
          >
            {alerta.residenteNome}
          </Link>
          <span className="block text-medio">
            {ROTULO_MEDIDA[alerta.medida]} {alerta.valor} (faixa{' '}
            {alerta.faixa.minimo ?? '—'}–{alerta.faixa.maximo ?? '—'})
          </span>
          <span className="block text-apoio">
            {formatarDataHora(alerta.aferidoEm)}
            {/* Uma vez pede atenção; quatro seguidas pedem ajuste de faixa. */}
            {alerta.seguidas > 1 && ` · fora há ${alerta.seguidas} aferições seguidas`}
          </span>
        </span>
        <form action={acaoDispensarAlerta.bind(null, {})}>
          <input type="hidden" name="sinalVitalId" value={alerta.sinalVitalId} />
          <input type="hidden" name="medida" value={alerta.medida} />
          <Botao variante="secundario">Dispensar</Botao>
        </form>
      </li>
    ))}
    {resultado.alertas.length === 0 && (
      <li className="py-2 text-suporte text-apoio">
        Nenhum sinal vital fora de faixa nos últimos 7 dias.
      </li>
    )}
  </ul>
</Cartao>
```

- [ ] **Passo 5: Rodar e ver passar**

Run: `npx playwright test tests/e2e/alertas-vitais.spec.ts --project=autenticado`
Esperado: PASS.

- [ ] **Passo 6: Conferir que nada quebrou**

```bash
npx tsc --noEmit && npx eslint
npm test
npx playwright test
```

Esperado: unidade e E2E verdes. Se algum teste de `/pendencias` falhar por
contagem, é a seção nova entrando na sequência — ajuste a expectativa dele, e
não a ordem da spec.

- [ ] **Passo 7: Commitar**

```bash
git add src/app/\(app\)/pendencias tests/e2e/alertas-vitais.spec.ts
git commit -m "Mostra os alertas de sinal vital nas pendencias, com dispensar"
```

---

### Task 7: A tela de faixas do residente

**Files:**
- Create: `src/app/(app)/residentes/[id]/faixas/page.tsx`
- Modify: `src/app/(app)/pendencias/acoes.ts` (acrescentar `acaoDefinirFaixa`)
- Modify: `src/app/(app)/residentes/[id]/prontuario/page.tsx` (link para a tela)

**Interfaces:**
- Consumes: `listarFaixas(ctx, residenteId)` e `definirFaixa(ctx, residenteId, medida, faixa)` da Task 3; `MEDIDAS_VITAIS`, `ROTULO_MEDIDA`, `FAIXAS_DO_SISTEMA` da Task 1.
- Produces: rota `/residentes/[id]/faixas`.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescente a `tests/e2e/alertas-vitais.spec.ts`:

```typescript
test('ajustar a faixa do residente tira o alerta dele', async ({ page }) => {
  // O hipertenso conhecido: a coordenação sobe a faixa e o alerta diário some,
  // sem afrouxar a faixa de todo mundo.
  const residente = await prisma.residente.findFirstOrThrow({
    where: { nomeCompleto: { startsWith: PREFIXO } },
  })

  await page.goto(`/residentes/${residente.id}/faixas`)
  await page.getByLabel('Pressão sistólica — mínimo').fill('90')
  await page.getByLabel('Pressão sistólica — máximo').fill('210')
  await page.getByRole('button', { name: 'Salvar faixas' }).click()
  await expect(page.getByRole('status')).toContainText('Registro salvo')

  await page.goto('/pendencias')
  await expect(page.locator('li', { hasText: `${PREFIXO} Maria` })).toHaveCount(0)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/alertas-vitais.spec.ts --project=autenticado`
Esperado: FAIL — a rota `/residentes/<id>/faixas` devolve 404.

- [ ] **Passo 3: A ação**

Acrescente a `src/app/(app)/pendencias/acoes.ts`:

```typescript
import { definirFaixa } from '@/modules/health/faixas.service'

/**
 * Grava todas as faixas de um residente numa submissão. Campo vazio quer dizer
 * "sem limite deste lado", e não "zero" — `Number('')` é 0, e um mínimo de zero
 * silenciaria a medida sem ninguém pedir.
 */
export async function acaoDefinirFaixa(
  _estado: EstadoAcao,
  dados: FormData
): Promise<EstadoAcao> {
  const ctx = await obterCtx()
  const residenteId = String(dados.get('residenteId') ?? '')
  if (!residenteId) return { erro: 'Residente inválido' }

  const numeroOuNulo = (campo: string): number | null => {
    const bruto = String(dados.get(campo) ?? '').trim()
    if (bruto === '') return null
    const numero = Number(bruto.replace(',', '.'))
    return Number.isFinite(numero) ? numero : null
  }

  try {
    for (const medida of MEDIDAS_VITAIS) {
      await definirFaixa(ctx, residenteId, medida, {
        minimo: numeroOuNulo(`${medida}_minimo`),
        maximo: numeroOuNulo(`${medida}_maximo`),
      })
    }
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : 'Não foi possível salvar' }
  }

  revalidatePath('/pendencias')
  revalidatePath(`/residentes/${residenteId}/faixas`)
  return {}
}
```

- [ ] **Passo 4: A tela**

Crie `src/app/(app)/residentes/[id]/faixas/page.tsx`:

```tsx
import Link from 'next/link'
import { obterCtx } from '@/modules/auth/sessao'
import { obterResidente } from '@/modules/residents/residentes.service'
import { listarFaixas } from '@/modules/health/faixas.service'
import { FAIXAS_DO_SISTEMA, MEDIDAS_VITAIS, ROTULO_MEDIDA } from '@/modules/health/faixas'
import { FormularioFaixas } from '@/components/formulario-faixas'

/**
 * As faixas de referência de um residente.
 *
 * Campo vazio quer dizer "use a do sistema"; preenchido, o valor vence. O
 * placeholder mostra a faixa do sistema para que quem ajusta saiba de onde
 * está partindo.
 */
export default async function PaginaFaixas({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await obterCtx()
  const [residente, ajustes] = await Promise.all([
    obterResidente(ctx, id),
    listarFaixas(ctx, id),
  ])

  const linhas = MEDIDAS_VITAIS.map((medida) => {
    const ajuste = ajustes.find((a) => a.medida === medida)
    return {
      medida,
      rotulo: ROTULO_MEDIDA[medida],
      sistema: FAIXAS_DO_SISTEMA[medida],
      minimo: ajuste?.minimo ?? null,
      maximo: ajuste?.maximo ?? null,
    }
  })

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-secao font-semibold text-forte">
          Faixas de referência — {residente.nomeSocial || residente.nomeCompleto}
        </h1>
        <p className="text-suporte text-apoio">
          Deixe em branco para usar a faixa do sistema, mostrada em cinza.
        </p>
      </div>

      <FormularioFaixas residenteId={id} linhas={linhas} />

      <Link href={`/residentes/${id}/prontuario`} className="text-suporte underline">
        Voltar ao prontuário
      </Link>
    </section>
  )
}
```

E o componente `src/components/formulario-faixas.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { acaoDefinirFaixa, type EstadoAcao } from '@/app/(app)/pendencias/acoes'
import { Botao } from '@/components/ui/botao'

type Linha = {
  medida: string
  rotulo: string
  sistema: { minimo: number | null; maximo: number | null }
  minimo: number | null
  maximo: number | null
}

export function FormularioFaixas({
  residenteId,
  linhas,
}: {
  residenteId: string
  linhas: Linha[]
}) {
  const [estado, acao] = useActionState<EstadoAcao, FormData>(acaoDefinirFaixa, {})

  return (
    <form action={acao} className="cartao space-y-3 p-4">
      <input type="hidden" name="residenteId" value={residenteId} />

      {linhas.map((linha) => (
        <div key={linha.medida} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
          <span className="text-suporte text-firme">{linha.rotulo}</span>
          <input
            name={`${linha.medida}_minimo`}
            defaultValue={linha.minimo ?? ''}
            placeholder={String(linha.sistema.minimo ?? '—')}
            aria-label={`${linha.rotulo} — mínimo`}
            className="w-24 rounded border border-borda px-3 py-2 text-corpo"
          />
          <input
            name={`${linha.medida}_maximo`}
            defaultValue={linha.maximo ?? ''}
            placeholder={String(linha.sistema.maximo ?? '—')}
            aria-label={`${linha.rotulo} — máximo`}
            className="w-24 rounded border border-borda px-3 py-2 text-corpo"
          />
        </div>
      ))}

      {estado.erro && (
        <p role="alert" className="text-suporte text-perigo">
          {estado.erro}
        </p>
      )}
      {!estado.erro && Object.keys(estado).length === 0 && (
        <p role="status" className="text-suporte text-sucesso">
          Registro salvo.
        </p>
      )}

      <Botao>Salvar faixas</Botao>
    </form>
  )
}
```

**Atenção:** o `role="status"` acima aparece antes da primeira submissão. Se o
E2E do Passo 1 passar sem clicar, troque a condição por um campo explícito de
sucesso no `EstadoAcao` (`{ salvo?: boolean }`) e teste por ele.

- [ ] **Passo 5: O link no prontuário**

Em `src/app/(app)/residentes/[id]/prontuario/page.tsx`, junto dos outros links do cabeçalho:

```tsx
<Link href={`/residentes/${id}/faixas`} className="text-suporte underline">
  Faixas de referência
</Link>
```

- [ ] **Passo 6: Rodar e ver passar**

Run: `npx playwright test tests/e2e/alertas-vitais.spec.ts --project=autenticado`
Esperado: PASS, 2 testes.

- [ ] **Passo 7: Rodar tudo antes de fechar**

```bash
npx tsc --noEmit && npx eslint
npm test
npx playwright test
```

- [ ] **Passo 8: Commitar**

```bash
git add src/app/\(app\)/residentes/\[id\]/faixas src/components/formulario-faixas.tsx src/app/\(app\)/pendencias/acoes.ts src/app/\(app\)/residentes/\[id\]/prontuario/page.tsx tests/e2e/alertas-vitais.spec.ts
git commit -m "Acrescenta a tela de faixas de referencia do residente"
```

---

### Task 8: Fechar com o registro de pendências

**Files:**
- Create: `docs/operacao/pendencias-alerta-sinal-vital.md`
- Modify: `docs/operacao/pendencias-fase-2a.md` (item 2 passa a resolvido)
- Modify: `README.md` (a contagem de documentos de pendências)

- [ ] **Passo 1: Marcar o item da Fase 2A como resolvido**

Em `docs/operacao/pendencias-fase-2a.md`, na tabela, troque a linha do item 2 por:

```markdown
| 2. Sinal vital fora de faixa não alerta | resolvido | 28/08/2026 |
```

E acrescente ao fim da seção `## 2.` uma subseção `### Resolvido em 28/08/2026`
dizendo: que a espera era pela 2B e pela Fase 3, ambas fechadas; que a decisão
de faixas de normalidade com ajuste por residente foi do Lar, com o custo do
ruído à vista; e que o alerta ficou em `/pendencias` em vez de tela própria.

- [ ] **Passo 2: Escrever o documento de pendências**

Crie `docs/operacao/pendencias-alerta-sinal-vital.md`, no formato dos outros
seis, com ao menos estes itens:

1. **Os números das faixas do sistema são proposta** — aberto, esperando a
   equipe de saúde. Onde se resolve: `src/modules/health/faixas.ts`.
2. **A janela de sete dias** — aberto, deliberado. Revisitar se a equipe aferir
   com menos frequência do que uma vez por semana.
3. **Não há tela que meça se o alerta virou ruído** — aberto, deliberado. O
   número (dispensados sem ajuste de faixa depois) é consultável na trilha.
4. **Peso continua fora** — aberto, deliberado, e é o item 3 da Fase 2A.
5. **Alerta sobre a ausência de aferição** — fora de escopo, e provavelmente
   mais grave: "ninguém mediu a pressão da dona Maria esta semana".

- [ ] **Passo 3: Atualizar a contagem no README**

Em `README.md`, na linha que diz "Hoje são seis", troque para sete e acrescente
"o alerta de sinal vital" à lista.

- [ ] **Passo 4: Commitar**

```bash
git add docs README.md
git commit -m "Registra as pendencias do alerta de sinal vital"
```

---

## Auto-revisão

**Cobertura da spec:**

| Seção da spec | Tarefa |
|---|---|
| §2 quem vê, fronteira de papel | 3, 4 (o `exigirPapel` de cada serviço) |
| §3.1 faixas do sistema | 1 |
| §3.2 ajuste por residente | 2 (tabela), 3 (serviço), 7 (tela) |
| §3.3 peso fora | 1, com teste que o afirma |
| §4 derivado, não materializado | 4 |
| §4.1 janela de sete dias | 4 |
| §5 dispensar | 2 (tabela), 4 (serviço), 6 (botão) |
| §6 onde aparece, e a ordem na paginação | 5, 6 |
| §7 o número que mede o ruído | 8, item 3 — registrado como não construído |
| §8 modelo de dados | 2 |
| §9 testes | 1, 3, 4, 5, 6, 7 |
| §10 fora de escopo | 8, itens 4 e 5 |
| §11 números em aberto | 8, item 1 |

**Nomes conferidos entre tarefas:** `MedidaVital`, `Faixa`, `MEDIDAS_VITAIS`,
`CAMPO_DA_MEDIDA`, `ROTULO_MEDIDA`, `FAIXAS_DO_SISTEMA`, `foraDaFaixa` e
`faixaVigente` nascem na Task 1 e são consumidos com esses nomes nas 3, 4, 6 e
7. `listarFaixas`/`definirFaixa` nascem na 3 e aparecem na 7.
`listarAlertasVitais`/`dispensarAlerta`/`AlertaVital` nascem na 4 e aparecem
na 5 e na 6. `DIAS_DA_JANELA` nasce na 4 e é citado na 8.

**Riscos que o executor deve saber:**

- **A Task 5 mexe em aritmética de fatia que já tinha uma armadilha.** A
  paginação de `/pendencias` foi escrita para duas listas; passa a ter três. Os
  três deslocamentos precisam ser encadeados, e o teste da Task 5 é o que
  prova. Se ele passar por acaso, confira quebrando `deslocamentoExames` de
  propósito.
- **A Task 4 lê todas as aferições da janela de todos os residentes.** É o custo
  aceito na §4 da spec, e é irrelevante em trinta residentes. Se um dia doer,
  mede-se antes de otimizar.
- **`Decimal` do Prisma não é `number`.** Toda leitura de `minimo`, `maximo` e
  `temperatura` passa por `Number(...)` antes de comparar. Esquecer disso faz a
  comparação silenciosamente errada, e não um erro de tipo.
