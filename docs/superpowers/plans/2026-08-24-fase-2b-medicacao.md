# Fase 2B — Medicação: plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos
> usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o controle de medicação — esquema medicamentoso, mapa do turno
com todos os residentes, registro dose a dose e relatório de aderência —
sabendo distinguir "sem registro" de "não administrada".

**Arquitetura:** duas entidades novas e **dois módulos puros** que não tocam no
banco: `turno.ts` (as três janelas do dia, incluindo a da noite que atravessa a
meia-noite) e `doses.ts` (as doses previstas, derivadas do esquema). É neles
que moram os bugs de verdade, e é por isso que são testados sem Postgres. O
resto — serviços, mapa do turno, aderência, telas — consome os dois.

**Pilha:** Next.js 15 (App Router, Server Actions), React 19, Prisma,
PostgreSQL 18, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-fase-2b-medicacao-design.md` — leia
antes da primeira tarefa. O design geral está em
`docs/superpowers/specs/2026-08-18-lar-idosos-design.md`, e a fase anterior em
`2026-08-23-fase-2a-prontuario-design.md`.

## Restrições globais

- **Idioma:** identificadores, comentários, mensagens de erro e rótulos em
  português do Brasil. Datas `dd/mm/aaaa`, horários `HH:mm`.
- **Permissão na camada de serviço:** toda função exportada começa com
  `exigirPapel(ctx, '<Entidade>', 'COORDENACAO', 'SAUDE')`. ADMINISTRATIVO é
  recusado em todas. Cada recusa tem teste.
- **Auditoria dentro da transação**, com `registrarAuditoria(tx, ctx, …)`.
- **Exclusão é lógica.** Prescrição não é apagada nem editada no lugar: é
  suspensa (R5).
- **TDD:** o teste é escrito primeiro e visto falhar pelo motivo certo.
- **Verificação antes de commitar:** `npx tsc --noEmit`, `npx eslint` e
  `npm test` verdes. Teste único:
  `npx dotenv -e .env.test -- npx vitest run <arquivo>`.
- **Campo opcional usa `.nullish()`**, nunca `.optional()`.
- **Migrations por `prisma migrate diff`**, nunca `migrate dev`: o repositório
  tem uma migration antiga com checksum divergente, e `migrate dev` pede reset
  do banco. Receita no Passo 4 da Tarefa 1.
- **Commits em português, sem acentos no assunto**, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/turno.ts` | As três janelas do dia e a navegação entre elas. Puro. |
| `src/modules/health/doses.ts` | Derivação das doses previstas a partir do esquema. Puro. |
| `src/modules/health/medicacoes.service.ts` | Prescrever, suspender, prescrever substituta, listar |
| `src/modules/health/administracao.service.ts` | Registrar administração, com a regra do registro tardio |
| `src/modules/health/mapa-do-turno.ts` | Leitura institucional: doses × registros de uma janela |
| `src/modules/health/aderencia.ts` | O relatório, por residente e período |
| `src/app/(app)/turno/page.tsx` | A tela mais usada do sistema |
| `src/app/(app)/turno/acoes.ts` | Server Actions do registro de dose |
| `src/components/mapa-do-turno.tsx` | As doses agrupadas por horário |
| `src/components/formularios-medicacao.tsx` | Prescrever, suspender, registrar |

`turno.ts` vai em `src/lib`, e não em `src/modules/health`, porque as
anotações de saúde da 2A também têm turno: a divisão do dia é do sistema, não
do módulo de medicação. A Tarefa 2 move para lá o `turnoDaHora` que hoje está
escondido dentro de `prontuario/acoes.ts`.

**Modificados:** `prisma/schema.prisma`, `src/modules/audit/auditoria.service.ts`
(união `EntidadeAuditada`), `src/app/(app)/auditoria/page.tsx` (rótulos),
`src/app/(app)/layout.tsx` (menu), `src/components/cabecalho-clinico.tsx`
(medicações ativas), `src/app/(app)/residentes/[id]/prontuario/page.tsx`
(seção de prescrições, aderência e o quarto botão).

---

## Tarefa 1: Schema das duas entidades e a migration

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/<carimbo>_medicacao_fase_2b/migration.sql`
- Modificar: `src/modules/audit/auditoria.service.ts`
- Modificar: `src/app/(app)/auditoria/page.tsx`
- Teste: `tests/fundacao.test.ts`

**Interfaces:**
- Produz: os modelos `Medicacao` e `AdministracaoMedicacao`; os enums
  `ViaMedicacao`, `TipoMedicacao`, `StatusAdministracao`, `MotivoNaoAdministracao`;
  e os dois valores novos de `EntidadeAuditada`.

- [ ] **Passo 1: Escrever o teste que falha**

Em `tests/fundacao.test.ts`, acrescentar:

```ts
it('tem as tabelas de medicação, com a restrição que impede dupla marcação', async () => {
  const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('medicacoes', 'administracoes_medicacao')
  `
  expect(tabelas).toHaveLength(2)

  // A R4 em forma de constraint: é ela que impede duas pessoas com a tela do
  // turno aberta de marcarem a mesma dose duas vezes.
  const unicas = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'administracoes_medicacao'
      AND indexdef LIKE '%UNIQUE%medicacaoId%horarioPrevisto%'
  `
  expect(unicas.length).toBeGreaterThan(0)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run tests/fundacao.test.ts`
Esperado: FALHA — `expected [] to have a length of 2`.

- [ ] **Passo 3: Acrescentar os modelos ao schema**

Em `prisma/schema.prisma`, no fim:

```prisma
enum ViaMedicacao {
  ORAL
  SUBLINGUAL
  IM
  EV
  SC
  TOPICA
  INALATORIA
  OFTALMICA
  OTOLOGICA
  RETAL
}

enum TipoMedicacao {
  HORARIO_FIXO
  SE_NECESSARIO
}

enum StatusAdministracao {
  ADMINISTRADA
  RECUSADA
  NAO_ADMINISTRADA
}

enum MotivoNaoAdministracao {
  IDOSO_HOSPITALIZADO
  IDOSO_AUSENTE
  MEDICAMENTO_EM_FALTA
  SUSPENSA_MEDICO
  RECUSA_IDOSO
  OUTRO
}

model Medicacao {
  id                  String        @id @default(cuid())
  residenteId         String
  residente           Residente     @relation(fields: [residenteId], references: [id])
  farmaco             String
  concentracao        String?
  formaFarmaceutica   String?
  dose                String
  via                 ViaMedicacao
  tipo                TipoMedicacao
  // Listas nativas do Postgres, não texto separado por vírgula: a derivação
  // itera sobre elas, e um parser de string seria um lugar a mais para errar.
  horarios            String[]
  diasSemana          Int[]
  instrucoes          String?
  prescritorNome      String?
  prescritorConselho  String?
  // DateTime, e não Date: com precisão de dia, uma prescrição suspensa às 10h
  // ainda derivaria a dose das 14h.
  dataInicio          DateTime
  dataFim             DateTime?
  ativa               Boolean       @default(true)
  motivoSuspensao     String?
  substituiMedicacaoId String?
  criadoEm            DateTime      @default(now())
  atualizadoEm        DateTime      @updatedAt
  criadoPorId         String?

  administracoes      AdministracaoMedicacao[]

  @@index([residenteId, ativa])
  @@index([substituiMedicacaoId])
  @@map("medicacoes")
}

model AdministracaoMedicacao {
  id              String                  @id @default(cuid())
  medicacaoId     String
  medicacao       Medicacao               @relation(fields: [medicacaoId], references: [id])
  residenteId     String
  residente       Residente               @relation(fields: [residenteId], references: [id])
  // A INSTÂNCIA da dose (24/08 às 08:00), não o horário do esquema. Nulo para
  // SE_NECESSARIO — e o Postgres trata nulos como distintos na restrição
  // única, que é o que permite registrar "se necessário" quantas vezes for.
  horarioPrevisto DateTime?
  registradoEm    DateTime                @default(now())
  status          StatusAdministracao
  motivo          MotivoNaoAdministracao?
  observacao      String?
  criadoEm        DateTime                @default(now())
  criadoPorId     String?

  // A R4: impede dupla marcação da mesma dose quando duas pessoas abrem a
  // tela do turno ao mesmo tempo.
  @@unique([medicacaoId, horarioPrevisto])
  @@index([residenteId, horarioPrevisto])
  @@index([horarioPrevisto])
  @@map("administracoes_medicacao")
}
```

Em `model Residente`, junto das relações que já existem:

```prisma
  medicacoes            Medicacao[]
  administracoes        AdministracaoMedicacao[]
```

- [ ] **Passo 4: Gerar e aplicar a migration**

```bash
CARIMBO=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${CARIMBO}_medicacao_fase_2b"
mkdir -p "$DIR"
npx dotenv -e .env -- npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$DIR/migration.sql"
npx dotenv -e .env -- npx prisma migrate deploy
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma generate
```

Ponha no topo do `migration.sql` um comentário dizendo por que ela foi gerada
por `migrate diff` e não por `migrate dev` — a migration
`20260820213908_documento_funcionario_fk` teve os comentários editados depois
de aplicada, e `migrate dev` pede reset do banco de desenvolvimento.

- [ ] **Passo 5: Acrescentar as duas a `EntidadeAuditada`**

Em `src/modules/audit/auditoria.service.ts`, no fim da união:

```ts
  // Fase 2B — medicação.
  | 'Medicacao'
  | 'AdministracaoMedicacao'
```

- [ ] **Passo 6: Rodar o typecheck e ver a tela de auditoria quebrar**

Rodar: `npx tsc --noEmit`
Esperado: FALHA em `src/app/(app)/auditoria/page.tsx` — `Record<EntidadeAuditada, string>`
sem as duas chaves novas. É a rede funcionando.

- [ ] **Passo 7: Dar rótulo às duas**

Em `ROTULO_ENTIDADE`:

```ts
  Medicacao: 'Medicação',
  AdministracaoMedicacao: 'Administração de medicação',
```

- [ ] **Passo 8: Verificar e commitar**

```bash
npx tsc --noEmit && npx eslint && npm test
git add prisma/ src/ tests/
git commit -m "Acrescenta o schema de medicacao da Fase 2B"
```

---

## Tarefa 2: As janelas do turno

**Arquivos:**
- Criar: `src/lib/turno.ts`
- Criar: `src/lib/turno.test.ts`
- Modificar: `src/app/(app)/residentes/[id]/prontuario/acoes.ts` (usar o módulo)

**Interfaces:**
- Produz:
  - `export type NomeTurno = 'MANHA' | 'TARDE' | 'NOITE'`
  - `export type JanelaTurno = { turno: NomeTurno; inicio: Date; fim: Date }`
  - `export function janelaDoTurno(referencia: Date): JanelaTurno`
  - `export function turnoAnterior(janela: JanelaTurno): JanelaTurno`
  - `export function turnoSeguinte(janela: JanelaTurno): JanelaTurno`
  - `export function turnoDaHora(momento: Date): NomeTurno`
  - `export const ROTULO_TURNO: Record<NomeTurno, string>`

- [ ] **Passo 1: Escrever os testes que falham**

Em `src/lib/turno.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { janelaDoTurno, turnoAnterior, turnoSeguinte, turnoDaHora } from './turno'

describe('janelaDoTurno', () => {
  it('devolve a manhã entre 6h e 14h', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T09:30:00'))
    expect(janela.turno).toBe('MANHA')
    expect(janela.inicio).toEqual(new Date('2026-08-24T06:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-24T14:00:00'))
  })

  it('põe as 14:00 na tarde, não na manhã', () => {
    // O fim da janela é exclusivo. Sem isso a dose das 14:00 apareceria nos
    // dois turnos, e alguém a daria duas vezes.
    expect(janelaDoTurno(new Date('2026-08-24T14:00:00')).turno).toBe('TARDE')
  })

  it('às 2h devolve a noite que começou no dia anterior', () => {
    // O caso que mais erra numa implementação ingênua: a janela da noite
    // atravessa a meia-noite, e às 2h da manhã do dia 25 o turno em curso
    // começou às 22h do dia 24.
    const janela = janelaDoTurno(new Date('2026-08-25T02:00:00'))
    expect(janela.turno).toBe('NOITE')
    expect(janela.inicio).toEqual(new Date('2026-08-24T22:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('às 23h devolve a noite que termina no dia seguinte', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    expect(janela.inicio).toEqual(new Date('2026-08-24T22:00:00'))
    expect(janela.fim).toEqual(new Date('2026-08-25T06:00:00'))
  })
})

describe('turnoAnterior e turnoSeguinte', () => {
  it('a manhã vem depois da noite que começou ontem', () => {
    const manha = janelaDoTurno(new Date('2026-08-25T09:00:00'))
    const anterior = turnoAnterior(manha)

    expect(anterior.turno).toBe('NOITE')
    expect(anterior.inicio).toEqual(new Date('2026-08-24T22:00:00'))
  })

  it('a noite é seguida pela manhã do dia seguinte', () => {
    const noite = janelaDoTurno(new Date('2026-08-24T23:00:00'))
    const seguinte = turnoSeguinte(noite)

    expect(seguinte.turno).toBe('MANHA')
    expect(seguinte.inicio).toEqual(new Date('2026-08-25T06:00:00'))
  })

  it('ida e volta devolvem a mesma janela', () => {
    const janela = janelaDoTurno(new Date('2026-08-24T15:00:00'))
    const voltando = turnoAnterior(turnoSeguinte(janela))

    expect(voltando.inicio).toEqual(janela.inicio)
    expect(voltando.fim).toEqual(janela.fim)
  })
})

describe('turnoDaHora', () => {
  it('classifica as bordas', () => {
    expect(turnoDaHora(new Date('2026-08-24T06:00:00'))).toBe('MANHA')
    expect(turnoDaHora(new Date('2026-08-24T13:59:00'))).toBe('MANHA')
    expect(turnoDaHora(new Date('2026-08-24T14:00:00'))).toBe('TARDE')
    expect(turnoDaHora(new Date('2026-08-24T21:59:00'))).toBe('TARDE')
    expect(turnoDaHora(new Date('2026-08-24T22:00:00'))).toBe('NOITE')
    expect(turnoDaHora(new Date('2026-08-24T05:59:00'))).toBe('NOITE')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run src/lib/turno.test.ts`
Esperado: FALHA ao carregar `./turno`.

- [ ] **Passo 3: Escrever o módulo**

```ts
/**
 * A divisão do dia em turnos, que é do sistema e não de um módulo: as
 * anotações de saúde da 2A já a usavam, e a tela do turno da 2B passa a usar.
 * Uma segunda divisão para a mesma equipe seria duas respostas para "em que
 * turno isso aconteceu?".
 *
 * Manhã 6h–14h, tarde 14h–22h, noite 22h–6h. Não é a divisão de escala do
 * Lar — é a que a equipe usa ao dizer "no turno da noite ela…".
 *
 * **Fim exclusivo.** A dose das 14:00 pertence à tarde e a nenhum outro turno;
 * fosse inclusivo, ela apareceria nas duas telas e alguém a daria duas vezes.
 *
 * **A noite atravessa a meia-noite**, e é o caso que mais erra: às 2h da
 * manhã, o turno em curso começou às 22h do dia anterior.
 *
 * Hora local, sem horário de verão — o Brasil não tem desde 2019. Se voltar a
 * ter, é aqui que precisa ser revisto.
 */
const INICIO_MANHA = 6
const INICIO_TARDE = 14
const INICIO_NOITE = 22
```

`janelaDoTurno` monta a janela a partir da hora da referência; quando a hora é
menor que `INICIO_MANHA`, o início é `INICIO_NOITE` do **dia anterior**.
`turnoAnterior` e `turnoSeguinte` deslocam pela duração da janela vizinha, e
não por oito horas fixas — as três janelas têm oito horas hoje, mas depender
disso amarraria a navegação à coincidência.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 8 testes.

- [ ] **Passo 5: Passar o prontuário a usar o módulo**

`src/app/(app)/residentes/[id]/prontuario/acoes.ts` tem hoje um `turnoDaHora`
local, com o mesmo critério. Substitua pelo import de `@/lib/turno` e apague a
cópia. Os testes E2E do prontuário precisam continuar verdes **sem alteração**
— é isso que prova que o critério não mudou.

- [ ] **Passo 6: Verificar e commitar**

```bash
npx tsc --noEmit && npx eslint && npm test
git add src/lib/turno.ts src/lib/turno.test.ts "src/app/(app)/residentes/"
git commit -m "Extrai as janelas de turno para src/lib"
```

---

## Tarefa 3: A derivação das doses

**Arquivos:**
- Criar: `src/modules/health/doses.ts`
- Criar: `src/modules/health/doses.test.ts`

**Interfaces:**
- Consome: `JanelaTurno` (Tarefa 2) — mas aceita qualquer `{ inicio, fim }`.
- Produz:

```ts
export type PrescricaoParaDerivacao = {
  id: string
  residenteId: string
  tipo: 'HORARIO_FIXO' | 'SE_NECESSARIO'
  horarios: string[]
  diasSemana: number[]
  dataInicio: Date
  dataFim: Date | null
}

export type DosePrevista = {
  medicacaoId: string
  residenteId: string
  horarioPrevisto: Date
}

export function dosesPrevistas(
  prescricoes: PrescricaoParaDerivacao[],
  janela: { inicio: Date; fim: Date }
): DosePrevista[]
```

- [ ] **Passo 1: Escrever os testes que falham**

Em `src/modules/health/doses.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dosesPrevistas, type PrescricaoParaDerivacao } from './doses'

function prescricao(
  campos: Partial<PrescricaoParaDerivacao> = {}
): PrescricaoParaDerivacao {
  return {
    id: 'med_1',
    residenteId: 'res_1',
    tipo: 'HORARIO_FIXO',
    horarios: ['08:00'],
    diasSemana: [],
    dataInicio: new Date('2026-01-01T00:00:00'),
    dataFim: null,
    ...campos,
  }
}

const MANHA = {
  inicio: new Date('2026-08-24T06:00:00'),
  fim: new Date('2026-08-24T14:00:00'),
}

describe('dosesPrevistas', () => {
  it('deriva uma dose por horário dentro da janela', () => {
    const doses = dosesPrevistas([prescricao({ horarios: ['08:00', '12:00'] })], MANHA)

    expect(doses.map((d) => d.horarioPrevisto)).toEqual([
      new Date('2026-08-24T08:00:00'),
      new Date('2026-08-24T12:00:00'),
    ])
  })

  it('inclui o instante do início e exclui o do fim', () => {
    // Fim exclusivo: a dose das 14:00 é da tarde. Fosse inclusivo, ela
    // apareceria nos dois turnos e alguém a daria duas vezes.
    const doses = dosesPrevistas([prescricao({ horarios: ['06:00', '14:00'] })], MANHA)

    expect(doses).toHaveLength(1)
    expect(doses[0].horarioPrevisto).toEqual(new Date('2026-08-24T06:00:00'))
  })

  it('atravessa a meia-noite na janela da noite', () => {
    const noite = {
      inicio: new Date('2026-08-24T22:00:00'),
      fim: new Date('2026-08-25T06:00:00'),
    }

    const doses = dosesPrevistas([prescricao({ horarios: ['22:00', '02:00'] })], noite)

    expect(doses.map((d) => d.horarioPrevisto)).toEqual([
      new Date('2026-08-24T22:00:00'),
      new Date('2026-08-25T02:00:00'),
    ])
  })

  it('usa o dia da semana do instante, não o da janela', () => {
    // 24/08/2026 é segunda (1); 25/08 é terça (2). Numa janela que atravessa
    // a meia-noite os dois diferem, e é o do instante que manda.
    const noite = {
      inicio: new Date('2026-08-24T22:00:00'),
      fim: new Date('2026-08-25T06:00:00'),
    }

    const soTerca = dosesPrevistas(
      [prescricao({ horarios: ['22:00', '02:00'], diasSemana: [2] })],
      noite
    )

    expect(soTerca).toHaveLength(1)
    expect(soTerca[0].horarioPrevisto).toEqual(new Date('2026-08-25T02:00:00'))
  })

  it('não deriva nada para SE_NECESSARIO', () => {
    const doses = dosesPrevistas([prescricao({ tipo: 'SE_NECESSARIO' })], MANHA)
    expect(doses).toEqual([])
  })

  it('não deriva dose anterior ao início da vigência', () => {
    const doses = dosesPrevistas(
      [prescricao({ dataInicio: new Date('2026-08-24T10:00:00') })],
      MANHA
    )
    expect(doses).toEqual([])
  })

  it('não deriva dose posterior à suspensão, no mesmo dia', () => {
    // O motivo de `dataFim` ser DateTime: suspensa às 10h, a dose das 12h não
    // existe — e o relatório não a acusa como "sem registro".
    const doses = dosesPrevistas(
      [
        prescricao({
          horarios: ['08:00', '12:00'],
          dataFim: new Date('2026-08-24T10:00:00'),
        }),
      ],
      MANHA
    )

    expect(doses).toHaveLength(1)
    expect(doses[0].horarioPrevisto).toEqual(new Date('2026-08-24T08:00:00'))
  })

  it('ignora `ativa` — quem manda é a vigência', () => {
    // Filtrar por `ativa` apagaria as doses passadas de uma prescrição
    // suspensa ontem, e o relatório do mês passado mudaria sozinho. Por isso
    // `ativa` nem entra em `PrescricaoParaDerivacao`.
    const suspensaDepois = prescricao({ dataFim: new Date('2026-08-30T00:00:00') })
    expect(dosesPrevistas([suspensaDepois], MANHA)).toHaveLength(1)
  })

  it('ordena por horário e agrupa prescrições diferentes', () => {
    const doses = dosesPrevistas(
      [
        prescricao({ id: 'med_1', horarios: ['12:00'] }),
        prescricao({ id: 'med_2', residenteId: 'res_2', horarios: ['08:00'] }),
      ],
      MANHA
    )

    expect(doses.map((d) => d.medicacaoId)).toEqual(['med_2', 'med_1'])
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar `./doses`.

- [ ] **Passo 3: Escrever o módulo**

O laço percorre as **datas que a janela toca** (uma ou duas), e para cada uma
combina com cada `HH:mm`:

```ts
/**
 * As doses previstas, derivadas do esquema. Puro de propósito: não toca no
 * banco, e é a única parte do sistema que dá para exercitar exaustivamente sem
 * Postgres — virada da meia-noite, dias da semana, bordas da vigência.
 *
 * `AdministracaoMedicacao` persiste somente o que aconteceu; a dose prevista
 * não existe em tabela nenhuma. É o que impede o sistema de escrever "não
 * administrada" sobre uma dose que pode ter sido dada e apenas não marcada.
 */
function datasQueAJanelaToca(janela: { inicio: Date; fim: Date }): Date[] {
  const dias: Date[] = []
  const cursor = new Date(janela.inicio)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= janela.fim) {
    dias.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}
```

Para cada prescrição de `tipo === 'HORARIO_FIXO'`, para cada data, para cada
`HH:mm`, monta o instante e o inclui quando:
`instante >= janela.inicio && instante < janela.fim` **e**
(`diasSemana.length === 0 || diasSemana.includes(instante.getDay())`) **e**
`instante >= dataInicio` **e** (`dataFim === null || instante <= dataFim`).

Ordena por `horarioPrevisto`, desempatando por `medicacaoId` para a ordem ser
estável.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 9 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/doses.ts src/modules/health/doses.test.ts
git commit -m "Acrescenta a derivacao das doses previstas"
```

---

## Tarefa 4: Prescrever, suspender e substituir

**Arquivos:**
- Criar: `src/modules/health/medicacoes.service.ts`
- Criar: `src/modules/health/medicacoes.service.test.ts`

**Interfaces:**
- Produz:
  - `prescrever(ctx, dados): Promise<Medicacao>`
  - `suspenderMedicacao(ctx, id, motivo): Promise<Medicacao>`
  - `prescreverSubstituta(ctx, idAnterior, dados): Promise<Medicacao>`
  - `listarMedicacoes(ctx, residenteId): Promise<Medicacao[]>`
  - `listarMedicacoesAtivas(ctx, residenteId): Promise<Medicacao[]>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('prescrever', () => {
  it('grava o esquema e audita', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      concentracao: '50 mg',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00', '20:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-24T08:00:00'),
      prescritorNome: 'Dr. Antônio Lima',
    })

    expect(medicacao.ativa).toBe(true)
    expect(medicacao.horarios).toEqual(['08:00', '20:00'])

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Medicacao', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa horário fora do formato HH:mm', async () => {
    // O formato é contrato com a derivação: "8h" não vira dose nenhuma, e a
    // falha apareceria como medicação que nunca aparece no turno.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      prescrever(ctx, {
        residenteId: residente.id,
        farmaco: 'Losartana',
        dose: '1 comprimido',
        via: 'ORAL',
        tipo: 'HORARIO_FIXO',
        horarios: ['8h'],
        diasSemana: [],
        dataInicio: new Date(),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa HORARIO_FIXO sem nenhum horário', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      prescrever(ctx, {
        residenteId: residente.id,
        farmaco: 'Losartana',
        dose: '1 comprimido',
        via: 'ORAL',
        tipo: 'HORARIO_FIXO',
        horarios: [],
        diasSemana: [],
        dataInicio: new Date(),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      prescrever(ctx, {
        residenteId: residente.id,
        farmaco: 'Losartana',
        dose: '1 comprimido',
        via: 'ORAL',
        tipo: 'HORARIO_FIXO',
        horarios: ['08:00'],
        diasSemana: [],
        dataInicio: new Date(),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('suspenderMedicacao', () => {
  it('encerra a vigência no instante da suspensão, não no fim do dia', async () => {
    // É o que impede a dose das 14h de existir quando o médico suspendeu às
    // 10h — e de o relatório acusá-la como "sem registro".
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    const antes = Date.now()
    const suspensa = await suspenderMedicacao(ctx, medicacao.id, 'Suspensa pelo médico')

    expect(suspensa.ativa).toBe(false)
    expect(suspensa.motivoSuspensao).toBe('Suspensa pelo médico')
    expect(suspensa.dataFim!.getTime()).toBeGreaterThanOrEqual(antes)
  })

  it('exige motivo', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date(),
    })

    await expect(suspenderMedicacao(ctx, medicacao.id, '')).rejects.toThrow(ErroValidacao)
  })
})

describe('prescreverSubstituta', () => {
  it('liga a nova à anterior e exige que a anterior esteja suspensa', async () => {
    // A R5 em duas etapas: a substituta só existe depois da suspensão, e é
    // esse caminho — não o formulário comum — que grava o elo.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const anterior = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    await expect(
      prescreverSubstituta(ctx, anterior.id, {
        residenteId: residente.id,
        farmaco: 'Losartana',
        dose: '2 comprimidos',
        via: 'ORAL',
        tipo: 'HORARIO_FIXO',
        horarios: ['08:00'],
        diasSemana: [],
        dataInicio: new Date(),
      })
    ).rejects.toThrow(ErroValidacao)

    await suspenderMedicacao(ctx, anterior.id, 'Dose ajustada')

    const nova = await prescreverSubstituta(ctx, anterior.id, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '2 comprimidos',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date(),
    })

    expect(nova.substituiMedicacaoId).toBe(anterior.id)
    expect(nova.dose).toBe('2 comprimidos')
  })
})

describe('listarMedicacoesAtivas', () => {
  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(listarMedicacoesAtivas(ctx, residente.id)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

Siga o formato de `src/modules/health/exames.service.ts`. O schema Zod valida
os horários com regexp, e a mensagem precisa dizer o formato:

```ts
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/

const medicacaoSchema = z
  .object({
    // … campos …
    horarios: z.array(z.string().regex(HORARIO, 'Horário deve estar no formato HH:mm')),
    diasSemana: z.array(z.number().int().min(0).max(6)),
  })
  .refine((d) => d.tipo === 'SE_NECESSARIO' || d.horarios.length > 0, {
    message: 'Medicação de horário fixo precisa de ao menos um horário',
  })
```

`prescreverSubstituta` recusa com `ErroValidacao` quando a anterior ainda está
`ativa`: a substituição é o segundo passo de dois, e permitir o atalho
desfaria a decisão da §1.2 da spec.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 8 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/medicacoes.service.ts src/modules/health/medicacoes.service.test.ts
git commit -m "Acrescenta prescrever, suspender e prescrever substituta"
```

---

## Tarefa 5: Registrar a administração

**Arquivos:**
- Criar: `src/modules/health/administracao.service.ts`
- Criar: `src/modules/health/administracao.service.test.ts`

**Interfaces:**
- Consome: `janelaDoTurno` (Tarefa 2).
- Produz:
  - `registrarAdministracao(ctx, dados): Promise<AdministracaoMedicacao>`
  - `listarAdministracoes(ctx, janela): Promise<AdministracaoMedicacao[]>`
  - `ehRegistroTardio(horarioPrevisto: Date | null, registradoEm: Date): boolean`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('registrarAdministracao', () => {
  it('registra a dose do turno corrente sem exigir nada além do status', async () => {
    // O "um toque" da §5.2: no turno corrente, marcar administrada é um
    // clique, sem campo nenhum.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)
    const agora = new Date()

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: agora,
      status: 'ADMINISTRADA',
    })

    expect(registro.status).toBe('ADMINISTRADA')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'AdministracaoMedicacao', acao: 'CRIAR' },
    })
    expect(log.residenteId).toBe(residente.id)
  })

  it('recusa registro de turno passado sem observação', async () => {
    // A decisão da §1.1: registro tardio é livre, e exige justificativa.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('aceita registro de turno passado com observação', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    const registro = await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status: 'ADMINISTRADA',
      observacao: 'Dose dada no plantão, registrada só agora.',
    })

    expect(registro.observacao).toContain('registrada só agora')
  })

  it('exige motivo quando não foi administrada', async () => {
    // "Não administrada" sem motivo é meia informação: quem lê o prontuário
    // depois precisa saber se faltou remédio ou se o idoso estava internado.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'NAO_ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('impede dupla marcação da mesma dose', async () => {
    // A R4 em ação: duas pessoas com a tela do turno aberta ao mesmo tempo.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx)
    const dose = new Date()

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: dose,
      status: 'ADMINISTRADA',
    })

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: dose,
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('deixa registrar SE_NECESSARIO quantas vezes for preciso', async () => {
    // `horarioPrevisto` nulo, e o Postgres trata nulos como distintos na
    // restrição única — que é o comportamento que "se necessário" pede.
    const ctx = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(ctx, {
      tipo: 'SE_NECESSARIO',
      horarios: [],
    })

    for (let i = 0; i < 3; i += 1) {
      await registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: null,
        status: 'ADMINISTRADA',
        observacao: 'Queixa de dor.',
      })
    }

    const registros = await prisma.administracaoMedicacao.findMany({
      where: { medicacaoId: medicacao.id },
    })
    expect(registros).toHaveLength(3)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const saude = await ctxComPapel('SAUDE')
    const { residente, medicacao } = await prescricaoDeTeste(saude)
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(),
        status: 'ADMINISTRADA',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('ehRegistroTardio', () => {
  it('é falso dentro do turno da dose e verdadeiro fora dele', () => {
    const dose = new Date('2026-08-24T08:00:00')
    expect(ehRegistroTardio(dose, new Date('2026-08-24T09:00:00'))).toBe(false)
    expect(ehRegistroTardio(dose, new Date('2026-08-24T15:00:00'))).toBe(true)
  })

  it('SE_NECESSARIO nunca é tardia', () => {
    // Sem `horarioPrevisto` não há turno de referência: ela é registrada
    // quando acontece.
    expect(ehRegistroTardio(null, new Date())).toBe(false)
  })
})
```

O helper `prescricaoDeTeste(ctx, campos?)` cria residente e prescrição, e mora
no próprio arquivo de teste.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

A colisão da restrição única chega como `PrismaClientKnownRequestError` com
código `P2002`, e precisa virar mensagem de gente:

```ts
try {
  // … create …
} catch (erro) {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
    // Duas pessoas com a tela do turno aberta ao mesmo tempo. A mensagem diz
    // o que aconteceu, e não "violação de restrição única".
    throw new ErroValidacao('Esta dose já foi registrada por outra pessoa')
  }
  throw erro
}
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 9 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/administracao.service.ts src/modules/health/administracao.service.test.ts
git commit -m "Acrescenta o registro de administracao, com a regra do tardio"
```

---

## Tarefa 6: O mapa do turno

**Arquivos:**
- Criar: `src/modules/health/mapa-do-turno.ts`
- Criar: `src/modules/health/mapa-do-turno.test.ts`

**Interfaces:**
- Consome: `dosesPrevistas` (Tarefa 3), `JanelaTurno` (Tarefa 2),
  `ehRegistroTardio` (Tarefa 5).
- Produz:

```ts
export type EstadoDose =
  | 'PREVISTA' | 'ATRASADA' | 'SEM_REGISTRO'
  | 'ADMINISTRADA' | 'RECUSADA' | 'NAO_ADMINISTRADA'

export type DoseDoTurno = {
  medicacaoId: string
  residenteId: string
  residenteNome: string
  farmaco: string
  dose: string
  via: string
  instrucoes: string | null
  horarioPrevisto: Date
  estado: EstadoDose
  motivo: string | null
  observacao: string | null
  registroTardio: boolean
}

export type MapaDoTurno = {
  janela: JanelaTurno
  doses: DoseDoTurno[]
  seNecessario: {
    medicacaoId: string
    residenteId: string
    residenteNome: string
    farmaco: string
    dose: string
    via: string
    instrucoes: string | null
  }[]
}

export const MINUTOS_PARA_ATRASO = 30

export async function montarMapaDoTurno(
  ctx: Ctx,
  janela: JanelaTurno,
  agora?: Date
): Promise<MapaDoTurno>
```

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('montarMapaDoTurno', () => {
  it('cruza as doses derivadas com o que foi registrado', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })
    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00', '12:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date('2026-08-24T08:00:00'),
      status: 'ADMINISTRADA',
      observacao: 'Registro retroativo de teste.',
    })

    const mapa = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T09:00:00')),
      new Date('2026-08-24T09:00:00')
    )

    expect(mapa.doses).toHaveLength(2)
    expect(mapa.doses[0].estado).toBe('ADMINISTRADA')
    expect(mapa.doses[0].residenteNome).toBe('Maria das Dores')
    // A das 12:00 ainda não venceu às 9h.
    expect(mapa.doses[1].estado).toBe('PREVISTA')
  })

  it('marca como ATRASADA a dose vencida há mais de 30 minutos', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    const quaseAtrasada = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T08:20:00')),
      new Date('2026-08-24T08:20:00')
    )
    expect(quaseAtrasada.doses[0].estado).toBe('PREVISTA')

    const atrasada = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T08:40:00')),
      new Date('2026-08-24T08:40:00')
    )
    expect(atrasada.doses[0].estado).toBe('ATRASADA')
  })

  it('usa SEM_REGISTRO quando o turno já acabou, nunca NAO_ADMINISTRADA', async () => {
    // O ponto da fase inteira: a dose pode ter sido dada e apenas não
    // marcada, e afirmar o contrário grava mentira no prontuário.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    const mapa = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T09:00:00')),
      new Date('2026-08-25T09:00:00')
    )

    expect(mapa.doses[0].estado).toBe('SEM_REGISTRO')
  })

  it('separa as SE_NECESSARIO das doses do turno', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Dipirona',
      dose: '20 gotas',
      via: 'ORAL',
      tipo: 'SE_NECESSARIO',
      horarios: [],
      diasSemana: [],
      dataInicio: new Date('2026-08-01T00:00:00'),
    })

    const mapa = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T09:00:00')),
      new Date('2026-08-24T09:00:00')
    )

    expect(mapa.doses).toHaveLength(0)
    expect(mapa.seNecessario.map((m) => m.farmaco)).toEqual(['Dipirona'])
  })

  it('atravessa residentes, agrupando por horário e não por pessoa', async () => {
    // A equipe percorre o corredor às 08:00 dando os remédios das 08:00 de
    // todo mundo — não abre uma ficha por vez.
    const ctx = await ctxComPapel('SAUDE')
    const primeira = await criarResidenteDeTeste({ nomeCompleto: 'Ana' })
    const segunda = await criarResidenteDeTeste({ nomeCompleto: 'Bruno' })

    for (const [residente, horario] of [
      [segunda, '12:00'],
      [primeira, '08:00'],
    ] as const) {
      await prescrever(ctx, {
        residenteId: residente.id,
        farmaco: 'Losartana',
        dose: '1 comprimido',
        via: 'ORAL',
        tipo: 'HORARIO_FIXO',
        horarios: [horario],
        diasSemana: [],
        dataInicio: new Date('2026-08-01T00:00:00'),
      })
    }

    const mapa = await montarMapaDoTurno(
      ctx,
      janelaDoTurno(new Date('2026-08-24T09:00:00')),
      new Date('2026-08-24T09:00:00')
    )

    expect(mapa.doses.map((d) => d.residenteNome)).toEqual(['Ana', 'Bruno'])
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      montarMapaDoTurno(ctx, janelaDoTurno(new Date()))
    ).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo**

Uma consulta traz as prescrições cuja vigência intersecta a janela — com o
residente junto, via `include`, para não haver N+1 numa tela aberta dezenas de
vezes por dia:

```ts
const prescricoes = await prisma.medicacao.findMany({
  where: {
    dataInicio: { lte: janela.fim },
    OR: [{ dataFim: null }, { dataFim: { gte: janela.inicio } }],
  },
  include: { residente: { select: { id: true, nomeCompleto: true, nomeSocial: true } } },
})
```

Outra traz os registros da janela. Depois `dosesPrevistas` deriva, e o cruzamento
é um `Map` por `${medicacaoId}|${horarioPrevisto.toISOString()}`.

O estado sai desta ordem — registrado vence tudo, e "sem registro" só existe
depois do fim da janela:

```ts
// A distinção que dá razão à fase: enquanto o turno corre, a dose vencida é
// ATRASADA — alguém ainda pode dá-la. Passado o fim da janela, ela vira
// SEM_REGISTRO, e nunca NAO_ADMINISTRADA: a dose pode ter sido dada e apenas
// não marcada, e escrever o contrário é gravar mentira no prontuário.
function estadoDaDose(registro, horarioPrevisto, janela, agora): EstadoDose {
  if (registro) return registro.status
  if (agora >= janela.fim) return 'SEM_REGISTRO'
  const atrasoMs = agora.getTime() - horarioPrevisto.getTime()
  return atrasoMs > MINUTOS_PARA_ATRASO * 60_000 ? 'ATRASADA' : 'PREVISTA'
}
```

`seNecessario` lista as prescrições `SE_NECESSARIO` com `ativa: true` cuja
vigência cobre `agora`.

`exigirPapel(ctx, 'Medicacao', 'COORDENACAO', 'SAUDE')` na primeira linha. Não
audita `VISUALIZAR`: a tela é aberta dezenas de vezes por dia pela mesma
pessoa, e cada administração — essa sim auditada — já dá o rastro.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 6 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/mapa-do-turno.ts src/modules/health/mapa-do-turno.test.ts
git commit -m "Acrescenta o mapa do turno, cruzando doses derivadas e registros"
```

---

## Tarefa 7: A tela do turno

**Arquivos:**
- Criar: `src/app/(app)/turno/page.tsx`
- Criar: `src/app/(app)/turno/acoes.ts`
- Criar: `src/components/mapa-do-turno.tsx`
- Criar: `src/components/formularios-medicacao.tsx`
- Modificar: `src/app/(app)/layout.tsx` (menu)
- Criar: `tests/e2e/turno.spec.ts`

**Interfaces:**
- Consome: `montarMapaDoTurno` (Tarefa 6), `janelaDoTurno`, `turnoAnterior`,
  `turnoSeguinte` (Tarefa 2), `registrarAdministracao` (Tarefa 5).
- Produz: a rota `/turno`; `acaoRegistrarDose`, `acaoRegistrarSeNecessario`.

- [ ] **Passo 1: Escrever o E2E que falha**

Em `tests/e2e/turno.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a tela do turno lista a dose e a marca como administrada em um toque', async ({
  page,
}) => {
  const nome = `Idosa Turno ${Date.now()}`
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1937-03-03')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-03')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await page.getByRole('link', { name: 'Prontuário' }).click()

  const farmaco = `Losartana ${Date.now()}`
  const secao = page.locator('details').filter({ hasText: 'Medicações' })
  await secao.locator('summary').first().click()
  await secao.getByLabel('Fármaco').fill(farmaco)
  await secao.getByLabel('Dose').fill('1 comprimido')
  await secao.getByLabel('Via').selectOption('ORAL')
  await secao.getByLabel('Tipo').selectOption('HORARIO_FIXO')
  // Um horário dentro do turno corrente, para a dose aparecer sem navegação.
  await secao.getByLabel('Horários').fill(horarioDoTurnoCorrente())
  await secao.getByRole('button', { name: 'Prescrever' }).click()

  await page.goto('/turno')
  const linha = page.locator('li', { hasText: farmaco })
  await expect(linha).toContainText(nome)

  await linha.getByRole('button', { name: 'Administrada' }).click()
  await expect(page.locator('li', { hasText: farmaco })).toContainText('Administrada')
})
```

`horarioDoTurnoCorrente()` é um helper no próprio arquivo: devolve `HH:mm` de
uma hora dentro da janela em curso, para o teste não depender do relógio da
máquina cair num turno específico.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx playwright test tests/e2e/turno.spec.ts`
Esperado: FALHA — não existe seção "Medicações" no prontuário.

- [ ] **Passo 3: Escrever a tela**

`/turno` mostra a janela corrente por padrão, com `?turno=anterior` e
`?turno=seguinte` navegando — query string, como o filtro da linha do tempo,
sem estado de cliente.

As doses agrupadas por horário, cada grupo um bloco com o `HH:mm` no topo.
Dentro, uma linha por dose com residente, fármaco, dose, via e instruções.

Três botões por dose no turno corrente: **Administrada** (um toque, sem
formulário), **Recusada** e **Não administrada** (abrem o motivo). Fora do
turno corrente, os três abrem também o campo de observação, obrigatório — a
decisão da §1.1 da spec.

O destaque do atraso é `border-amber-500 bg-amber-50`, o mesmo da consulta
atrasada em `/pendencias`.

- [ ] **Passo 4: Acrescentar a seção de medicações ao prontuário**

Em `src/app/(app)/residentes/[id]/prontuario/page.tsx`, a seção "Medicações",
com a lista das prescrições (ativas em destaque, suspensas em cinza com o
motivo) e o formulário de prescrever. Cada ativa ganha "Suspender"; cada
suspensa recém-criada ganha "Prescrever substituta", com os campos
pré-preenchidos — é o caminho que grava `substituiMedicacaoId`.

- [ ] **Passo 5: Acrescentar o item de menu**

Em `src/app/(app)/layout.tsx`, **antes** de "Residentes": a §5.2 chama a tela
do turno de mais usada do sistema.

```ts
{ href: '/turno', rotulo: 'Turno', papeis: ['COORDENACAO', 'SAUDE'] },
```

- [ ] **Passo 6: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 7: Commitar**

```bash
npx tsc --noEmit && npx eslint && npm test && npx playwright test
git add "src/app/(app)/" src/components/ tests/e2e/turno.spec.ts
git commit -m "Acrescenta a tela do turno e a secao de medicacoes"
```

---

## Tarefa 8: O relatório de aderência

**Arquivos:**
- Criar: `src/modules/health/aderencia.ts`
- Criar: `src/modules/health/aderencia.test.ts`
- Modificar: `src/app/(app)/residentes/[id]/prontuario/page.tsx`
- Criar: `src/components/aderencia.tsx`

**Interfaces:**
- Consome: `dosesPrevistas` (Tarefa 3), `ehRegistroTardio` (Tarefa 5).
- Produz:

```ts
export type Aderencia = {
  previstas: number
  administradas: number
  recusadas: number
  naoAdministradas: number
  semRegistro: number
  registradasForaDoTurno: number
  porMotivo: Record<string, number>
  percentualSemRegistro: number
}

export async function calcularAderencia(
  ctx: Ctx,
  residenteId: string,
  periodo: { de: Date; ate: Date }
): Promise<Aderencia>
```

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('calcularAderencia', () => {
  it('conta uma dose em cada estado, e separa sem registro de não administrada', async () => {
    // A distinção que o relatório existe para mostrar: "sem registro" é falha
    // de anotação, "não administrada" é decisão de alguém, e somá-las
    // esconderia as duas.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00', '12:00', '16:00', '20:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-24T00:00:00'),
      dataFim: new Date('2026-08-24T23:59:00'),
    })

    const registrar = (hora: string, status: string, motivo?: string) =>
      registrarAdministracao(ctx, {
        medicacaoId: medicacao.id,
        residenteId: residente.id,
        horarioPrevisto: new Date(`2026-08-24T${hora}:00`),
        status,
        motivo,
        observacao: 'Registro retroativo de teste.',
      })

    await registrar('08:00', 'ADMINISTRADA')
    await registrar('12:00', 'RECUSADA')
    await registrar('16:00', 'NAO_ADMINISTRADA', 'MEDICAMENTO_EM_FALTA')
    // A das 20:00 fica sem registro.

    const aderencia = await calcularAderencia(ctx, residente.id, {
      de: new Date('2026-08-24T00:00:00'),
      ate: new Date('2026-08-25T00:00:00'),
    })

    expect(aderencia.previstas).toBe(4)
    expect(aderencia.administradas).toBe(1)
    expect(aderencia.recusadas).toBe(1)
    expect(aderencia.naoAdministradas).toBe(1)
    expect(aderencia.semRegistro).toBe(1)
    expect(aderencia.porMotivo.MEDICAMENTO_EM_FALTA).toBe(1)
    expect(aderencia.percentualSemRegistro).toBe(25)
  })

  it('conta as tardias dentro de administradas, e à parte', async () => {
    // Elas aconteceram — são medida de disciplina de registro, não de
    // administração.
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()
    const medicacao = await prescrever(ctx, {
      residenteId: residente.id,
      farmaco: 'Losartana',
      dose: '1 comprimido',
      via: 'ORAL',
      tipo: 'HORARIO_FIXO',
      horarios: ['08:00'],
      diasSemana: [],
      dataInicio: new Date('2026-08-24T00:00:00'),
      dataFim: new Date('2026-08-24T23:59:00'),
    })

    await registrarAdministracao(ctx, {
      medicacaoId: medicacao.id,
      residenteId: residente.id,
      horarioPrevisto: new Date('2026-08-24T08:00:00'),
      status: 'ADMINISTRADA',
      observacao: 'Dose dada no plantão, registrada só agora.',
    })

    const aderencia = await calcularAderencia(ctx, residente.id, {
      de: new Date('2026-08-24T00:00:00'),
      ate: new Date('2026-08-25T00:00:00'),
    })

    expect(aderencia.administradas).toBe(1)
    expect(aderencia.registradasForaDoTurno).toBe(1)
  })

  it('devolve zero e não divide por zero quando não há dose prevista', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    const aderencia = await calcularAderencia(ctx, residente.id, {
      de: new Date('2026-08-24T00:00:00'),
      ate: new Date('2026-08-25T00:00:00'),
    })

    expect(aderencia.previstas).toBe(0)
    expect(aderencia.percentualSemRegistro).toBe(0)
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      calcularAderencia(ctx, residente.id, {
        de: new Date('2026-08-24T00:00:00'),
        ate: new Date('2026-08-25T00:00:00'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo e o componente**

Mesma mecânica do mapa do turno, com a janela sendo o período: deriva, cruza,
conta. `percentualSemRegistro` é `previstas === 0 ? 0 : Math.round(semRegistro / previstas * 100)`.

O componente mostra os números e o percentual em destaque, com o período
padrão de 30 dias e um filtro de período em query string.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/health/aderencia.ts src/modules/health/aderencia.test.ts src/components/aderencia.tsx "src/app/(app)/residentes/"
git commit -m "Acrescenta o relatorio de aderencia"
```

---

## Tarefa 9: Medicações ativas no cabeçalho e o quarto botão

**Arquivos:**
- Modificar: `src/components/cabecalho-clinico.tsx`
- Modificar: `src/app/(app)/residentes/[id]/prontuario/page.tsx`
- Modificar: `tests/e2e/prontuario.spec.ts`

**Interfaces:**
- Consome: `listarMedicacoesAtivas` (Tarefa 4).

- [ ] **Passo 1: Escrever o E2E que falha**

Em `tests/e2e/prontuario.spec.ts`, um teste que prescreve uma medicação e
confere que ela aparece no cabeçalho clínico, com fármaco, dose e horários — o
bloco que a §4.4 da spec-mãe prevê e que a 2A deixou vazio de propósito.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — o cabeçalho não tem bloco de medicações.

- [ ] **Passo 3: Acrescentar o bloco ao cabeçalho**

`CabecalhoClinico` ganha a prop `medicacoesAtivas`, e o grid — construído na 2A
para receber mais um item sem rearranjo — ganha o sexto bloco: fármaco, dose e
horários, em ordem do primeiro horário do dia. Vazio mostra "Nenhuma medicação
ativa.", como os demais.

- [ ] **Passo 4: Acrescentar o quarto botão grande**

A §9 da spec-mãe prevê quatro botões — evolução, sinais vitais, intercorrência
e medicação — e a 2A entregou três. O quarto é um `Link` para `/turno`, e não
um formulário: registrar dose acontece na tela do turno, onde estão as doses
previstas.

Mude o grid de `grid-cols-3` para `grid-cols-2 sm:grid-cols-4`, para os quatro
caberem no telefone sem virar tira ilegível.

- [ ] **Passo 5: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 6: Commitar**

```bash
git add src/components/cabecalho-clinico.tsx "src/app/(app)/residentes/" tests/e2e/prontuario.spec.ts
git commit -m "Poe as medicacoes ativas no cabecalho e o quarto botao grande"
```

---

## Tarefa 10: O perfil SAUDE no turno, a recusa do ADMINISTRATIVO e a documentação

**Arquivos:**
- Modificar: `tests/e2e/saude.spec.ts`
- Modificar: `tests/e2e/administrativo.spec.ts`
- Modificar: `README.md`
- Criar: `docs/operacao/pendencias-fase-2b.md`

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/e2e/saude.spec.ts`, o caminho completo do plantão: abrir `/turno`,
administrar uma dose, recusar outra com motivo, e ver o resultado no relatório
de aderência do residente. É o único teste que percorre derivação, registro e
relatório de ponta a ponta.

Em `tests/e2e/administrativo.spec.ts`, acrescentar ao teste que já existe: a
rota `/turno` digitada na URL é recusada em pt-BR, e o menu não a oferece.

- [ ] **Passo 2: Rodar e ver falhar, depois passar**

Rodar: `npx playwright test`
Esperado: falham só os testes novos; implementados, os quatro projetos passam.

- [ ] **Passo 3: Atualizar a documentação**

- `README.md`: a lista de módulos ganha a medicação; a descrição diz que doses
  previstas são derivadas e que "sem registro" nunca vira "não administrada".
- `docs/operacao/pendencias-fase-2b.md`, no formato do de Fase 2A: entram as
  três questões que a §13 da spec deixou abertas — a justificativa obrigatória
  no registro tardio, a lacuna entre suspender e prescrever, e o custo da
  derivação em períodos longos — mais o que surgir na execução.

- [ ] **Passo 4: Verificação final e commit**

```bash
npx tsc --noEmit && npx eslint && npm test && npx playwright test
git add -A
git commit -m "Fecha a Fase 2B com o plantao de ponta a ponta"
```

---

## Ordem e dependências

```
1 (schema) ──┬── 2 (turno) ──┬── 3 (doses) ──┬── 6 (mapa) ── 7 (tela) ──┐
             │               │               │                          │
             ├── 4 (prescrever) ─────────────┼──────────────────────────┼── 9 ── 10
             └── 5 (administrar) ────────────┴── 8 (aderência) ─────────┘
```

As tarefas 2, 4 e 5 dependem só da 1; a 3 depende da 2 apenas pelo tipo da
janela. A 6 precisa de 3, 4 e 5. A 7 precisa da 6. A 8 precisa de 3, 4 e 5. A
9 precisa da 4 e da 7. A 10 é a última.

Os dois módulos puros — 2 e 3 — não tocam no banco e são os mais testados da
fase. Se alguma coisa aqui vai dar errado em produção, é neles, e é por isso
que eles vêm cedo e com teste exaustivo.
