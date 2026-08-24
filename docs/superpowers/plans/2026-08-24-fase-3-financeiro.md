# Fase 3 — Financeiro e prestação de contas: plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos
> usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** substituir o processo da planilha de prestação de contas —
cadastros, lançamentos, fechamento mensal com saldo derivado, e a exportação em
`.xlsx` (o que vai ao órgão) e em PDF (arquivo interno e assinatura).

**Arquitetura:** oito entidades num módulo `financeiro` novo, e **um documento
abstrato renderizado duas vezes**. `documento-prestacao.ts` monta a prestação
como estrutura e calcula todos os totais; `xlsx-prestacao.ts` e
`pdf-prestacao.ts` são renderizadores finos que recebem números prontos. O
layout do `.xlsx` é extraído do modelo real do órgão para um módulo de código.

**Pilha:** Next.js 15, React 19, Prisma, PostgreSQL 18, Zod, Vitest, Playwright,
**exceljs** e **pdfkit** (as duas primeiras dependências de produção desde a
Fase 1).

**Spec:** `docs/superpowers/specs/2026-08-24-fase-3-financeiro-design.md` — leia
antes da primeira tarefa. A análise do modelo real está em
`2026-08-18-modelo-prestacao-contas.md`, e o design geral em
`2026-08-18-lar-idosos-design.md`.

## Restrições globais

- **Idioma:** identificadores, comentários, mensagens e rótulos em português do
  Brasil. Datas `dd/mm/aaaa`, moeda `R$ 0.000,00`.
- **Permissão na camada de serviço:** toda função exportada começa com
  `exigirPapel(ctx, '<Entidade>', 'COORDENACAO', 'ADMINISTRATIVO')`. **SAUDE é
  recusado em todas.** Fechar e reabrir prestação são só de COORDENACAO. Cada
  recusa tem teste.
- **Auditoria dentro da transação.** Gerar `.xlsx` ou PDF audita `EXPORTAR`.
- **Dinheiro é `Decimal(12,2)`**, nunca `Float`. Ao ler, `Number(valor)` — o
  `Decimal` do Prisma não é número em JavaScript.
- **Exclusão é lógica.** Lançamento errado é cancelado com motivo, não apagado.
- **TDD:** o teste é escrito primeiro e visto falhar pelo motivo certo.
- **Verificação antes de commitar:** `npx tsc --noEmit`, `npx eslint` e
  `npm test` verdes.
- **Campo opcional usa `.nullish()`**, nunca `.optional()`.
- **Migrations por `prisma migrate diff`**, nunca `migrate dev` (o repositório
  tem migration antiga com checksum divergente). Receita no Passo 4 da Tarefa 1.
- **`docs/convenio/` nunca entra no git.** É exemplo preenchido com dado real, e
  o repositório é público.
- **Commits em português, sem acentos no assunto**, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/financeiro/instituicao.service.ts` | `ConfiguracaoInstituicao` e `ContaBancaria` |
| `src/modules/financeiro/cadastros.service.ts` | `OrigemReceita`, `CategoriaDespesa`, `Fornecedor` |
| `src/modules/financeiro/lancamentos.service.ts` | `Lancamento`: criar, cancelar, conciliar, listar |
| `src/modules/financeiro/contribuicoes.service.ts` | `ContribuicaoResidente` e a proposta mensal |
| `src/modules/financeiro/prestacoes.service.ts` | Abrir, saldo anterior, ajuste, fechar, reabrir |
| `src/modules/financeiro/documento-prestacao.ts` | O documento abstrato. Puro: calcula, não desenha |
| `src/modules/financeiro/layout-prestacao.ts` | Merges, larguras e rótulos extraídos do modelo real |
| `src/modules/financeiro/xlsx-prestacao.ts` | Renderizador `.xlsx` |
| `src/modules/financeiro/pdf-prestacao.ts` | Renderizador PDF |
| `src/app/api/prestacoes/[id]/[formato]/route.ts` | Download autenticado, com auditoria `EXPORTAR` |
| `src/app/(app)/financeiro/page.tsx` | Lançamentos |
| `src/app/(app)/financeiro/prestacoes/page.tsx` | Prestações por conta e competência |
| `src/app/(app)/financeiro/cadastros/page.tsx` | Contas, fornecedores, origens, categorias, instituição |
| `src/app/(app)/financeiro/contribuicoes/page.tsx` | A proposta mensal |
| `src/app/(app)/financeiro/acoes.ts` | Server Actions do módulo |
| `src/components/formularios-financeiro.tsx` | Os formulários |

Serviços separados por assunto, e não um `financeiro.service.ts` único: o
arquivo único passaria de mil linhas antes da metade da fase. Os três
renderizadores (`documento`, `xlsx`, `pdf`) são separados porque a única coisa
que compartilham é o tipo do documento — e é assim que a mudança de layout de um
não toca no outro.

**Modificados:** `prisma/schema.prisma`, `package.json` (as duas dependências),
`src/modules/audit/auditoria.service.ts`, `src/app/(app)/auditoria/page.tsx`,
`src/app/(app)/layout.tsx`, `src/app/(app)/residentes/[id]/page.tsx`
(contribuição vigente na ficha).

---

## Tarefa 1: Schema das oito entidades e a migration

**Arquivos:**
- Modificar: `prisma/schema.prisma`, `package.json`
- Criar: `prisma/migrations/<carimbo>_financeiro_fase_3/migration.sql`
- Modificar: `src/modules/audit/auditoria.service.ts`,
  `src/app/(app)/auditoria/page.tsx`
- Teste: `tests/fundacao.test.ts`

**Interfaces:**
- Produz: os modelos `ConfiguracaoInstituicao`, `ContaBancaria`,
  `OrigemReceita`, `CategoriaDespesa`, `Fornecedor`, `Lancamento`,
  `PrestacaoContas`, `ContribuicaoResidente`; os enums `TipoConta`,
  `NaturezaLancamento`, `StatusLancamento`, `FormaPagamento`,
  `TipoDocumentoFornecedor`, `StatusPrestacao`; e os oito valores novos de
  `EntidadeAuditada`.

- [ ] **Passo 1: Escrever o teste que falha**

Em `tests/fundacao.test.ts`:

```ts
it('tem as tabelas do financeiro, com a prestação única por conta e competência', async () => {
  const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'configuracao_instituicao', 'contas_bancarias', 'origens_receita',
        'categorias_despesa', 'fornecedores', 'lancamentos',
        'prestacoes_contas', 'contribuicoes_residente'
      )
  `
  expect(tabelas).toHaveLength(8)

  // Uma prestação por conta e por mês: é o que impede duas prestações
  // concorrentes do mesmo período, cada uma com um saldo diferente.
  const unicas = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'prestacoes_contas'
      AND indexdef LIKE '%UNIQUE%contaBancariaId%anoCompetencia%mesCompetencia%'
  `
  expect(unicas.length).toBeGreaterThan(0)
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx dotenv -e .env.test -- npx vitest run tests/fundacao.test.ts`
Esperado: FALHA — `expected [] to have a length of 8`.

- [ ] **Passo 3: Instalar as duas dependências**

```bash
npm install exceljs pdfkit
npm install --save-dev @types/pdfkit
```

`exceljs` traz os próprios tipos; `pdfkit` não.

- [ ] **Passo 4: Acrescentar os modelos ao schema**

Em `prisma/schema.prisma`, no fim:

```prisma
enum TipoConta {
  CORRENTE
  POUPANCA
  APLICACAO
}

enum NaturezaLancamento {
  RECEITA
  DESPESA
}

enum StatusLancamento {
  PREVISTO
  REALIZADO
  CANCELADO
}

enum FormaPagamento {
  PIX
  TED
  CHEQUE
  DEBITO
  OUTRO
}

enum TipoDocumentoFornecedor {
  CNPJ
  CPF
}

enum StatusPrestacao {
  ABERTA
  FECHADA
}

/// Registro único. Alimenta a capa, o ofício, os rodapés de assinatura e a
/// declaração de encerramento — sem ele, esses textos seriam constantes
/// espalhadas pelo código de exportação.
model ConfiguracaoInstituicao {
  id                String   @id @default(cuid())
  razaoSocial       String
  cnpj              String
  enderecoCompleto  String
  cidade            String
  uf                String   @db.Char(2)
  orgaoDestinatario String
  nomePresidente    String
  nomeTesoureiro    String
  criadoEm          DateTime @default(now())
  atualizadoEm      DateTime @updatedAt
  criadoPorId       String?

  @@map("configuracao_instituicao")
}

/// A conta é o eixo do módulo: cada lançamento pertence a uma, e cada
/// prestação cobre uma conta num mês.
model ContaBancaria {
  id              String    @id @default(cuid())
  banco           String
  agencia         String
  numeroConta     String
  tipo            TipoConta
  titular         String
  saldoInicial    Decimal   @db.Decimal(12, 2)
  dataSaldoInicial DateTime @db.Date
  prestaContas    Boolean   @default(true)
  ativa           Boolean   @default(true)
  criadoEm        DateTime  @default(now())
  atualizadoEm    DateTime  @updatedAt
  criadoPorId     String?

  lancamentos     Lancamento[]
  prestacoes      PrestacaoContas[]

  @@index([ativa])
  @@map("contas_bancarias")
}

/// `nome` é uso interno; `rotuloPrestacao` é o texto que sai no documento. A
/// contribuição dos residentes é origem própria internamente e sai como
/// "Doação" no documento, somando com as demais — nenhum nome de idoso entra
/// na prestação.
model OrigemReceita {
  id              String   @id @default(cuid())
  nome            String
  rotuloPrestacao String
  exigeResidente  Boolean  @default(false)
  ativa           Boolean  @default(true)
  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt
  criadoPorId     String?

  lancamentos     Lancamento[]

  @@index([ativa])
  @@map("origens_receita")
}

model CategoriaDespesa {
  id           String   @id @default(cuid())
  nome         String
  ativa        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  criadoPorId  String?

  lancamentos  Lancamento[]

  @@index([ativa])
  @@map("categorias_despesa")
}

/// Substitui o XLOOKUP da planilha, que hoje aponta para uma referência
/// quebrada.
model Fornecedor {
  id            String                  @id @default(cuid())
  nome          String
  documento     String
  tipoDocumento TipoDocumentoFornecedor
  telefone      String?
  email         String?
  ativo         Boolean                 @default(true)
  criadoEm      DateTime                @default(now())
  atualizadoEm  DateTime                @updatedAt
  criadoPorId   String?

  lancamentos   Lancamento[]

  @@index([ativo])
  @@map("fornecedores")
}

model Lancamento {
  id                    String             @id @default(cuid())
  natureza              NaturezaLancamento
  descricao             String
  valor                 Decimal            @db.Decimal(12, 2)
  data                  DateTime           @db.Date
  contaBancariaId       String
  contaBancaria         ContaBancaria      @relation(fields: [contaBancariaId], references: [id])
  status                StatusLancamento   @default(REALIZADO)
  /// Preenchido no fechamento: é o que congela o conjunto entregue ao órgão e
  /// impede que um lançamento posterior mude, em silêncio, um documento já
  /// protocolado.
  prestacaoContasId     String?
  prestacaoContas       PrestacaoContas?   @relation(fields: [prestacaoContasId], references: [id])
  documentoId           String?
  documento             Documento?         @relation(fields: [documentoId], references: [id])
  motivoCancelamento    String?
  observacao            String?
  /// A conciliação é manual, contra o extrato.
  conciliado            Boolean            @default(false)
  conciliadoEm          DateTime?

  origemReceitaId       String?
  origemReceita         OrigemReceita?     @relation(fields: [origemReceitaId], references: [id])
  residenteId           String?
  residente             Residente?         @relation(fields: [residenteId], references: [id])
  pagadorNome           String?
  pagadorDocumento      String?

  fornecedorId          String?
  fornecedor            Fornecedor?        @relation(fields: [fornecedorId], references: [id])
  categoriaDespesaId    String?
  categoriaDespesa      CategoriaDespesa?  @relation(fields: [categoriaDespesaId], references: [id])
  formaPagamento        FormaPagamento?
  numeroDocumentoFiscal String?

  criadoEm              DateTime           @default(now())
  atualizadoEm          DateTime           @updatedAt
  criadoPorId           String?

  @@index([contaBancariaId, data])
  @@index([prestacaoContasId])
  @@index([residenteId, data])
  @@map("lancamentos")
}

model PrestacaoContas {
  id                    String          @id @default(cuid())
  contaBancariaId       String
  contaBancaria         ContaBancaria   @relation(fields: [contaBancariaId], references: [id])
  mesCompetencia        Int
  anoCompetencia        Int
  saldoAnterior         Decimal         @db.Decimal(12, 2)
  saldoAnteriorAjustado Decimal?        @db.Decimal(12, 2)
  justificativaAjuste   String?
  observacoes           String          @default("")
  status                StatusPrestacao @default(ABERTA)
  fechadaEm             DateTime?
  fechadaPorId          String?
  reabertaEm            DateTime?
  reabertaPorId         String?
  motivoReabertura      String?
  criadoEm              DateTime        @default(now())
  atualizadoEm          DateTime        @updatedAt
  criadoPorId           String?

  lancamentos           Lancamento[]

  /// Uma prestação por conta e por mês: impede duas prestações concorrentes do
  /// mesmo período, cada uma com um saldo diferente.
  @@unique([contaBancariaId, anoCompetencia, mesCompetencia])
  @@index([anoCompetencia, mesCompetencia])
  @@map("prestacoes_contas")
}

/// Com vigência porque a contribuição é percentual sobre o benefício (art. 35,
/// §2º da Lei 10.741/2003), e o benefício é reajustado todo ano. Guardar apenas
/// "valor da mensalidade" quebraria na primeira virada de exercício.
model ContribuicaoResidente {
  id                 String    @id @default(cuid())
  residenteId        String
  residente          Residente @relation(fields: [residenteId], references: [id])
  percentual         Decimal   @db.Decimal(5, 2)
  valorBaseBeneficio Decimal   @db.Decimal(12, 2)
  vigenciaInicio     DateTime  @db.Date
  vigenciaFim        DateTime? @db.Date
  observacao         String?
  criadoEm           DateTime  @default(now())
  atualizadoEm       DateTime  @updatedAt
  criadoPorId        String?

  @@index([residenteId, vigenciaInicio])
  @@map("contribuicoes_residente")
}
```

Em `model Residente`, junto das relações existentes:

```prisma
  lancamentos           Lancamento[]
  contribuicoes         ContribuicaoResidente[]
```

Em `model Documento`:

```prisma
  lancamentos          Lancamento[]
```

- [ ] **Passo 5: Gerar e aplicar a migration**

```bash
CARIMBO=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${CARIMBO}_financeiro_fase_3"
mkdir -p "$DIR"
npx dotenv -e .env -- npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$DIR/migration.sql"
npx dotenv -e .env -- npx prisma migrate deploy
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma generate
```

Ponha no topo do `migration.sql` um comentário explicando a restrição única de
`prestacoes_contas` e por que a migration foi gerada por `diff`.

- [ ] **Passo 6: Acrescentar as oito a `EntidadeAuditada` e ver o typecheck quebrar**

Em `src/modules/audit/auditoria.service.ts`, no fim da união:

```ts
  // Fase 3 — financeiro.
  | 'ConfiguracaoInstituicao'
  | 'ContaBancaria'
  | 'OrigemReceita'
  | 'CategoriaDespesa'
  | 'Fornecedor'
  | 'Lancamento'
  | 'PrestacaoContas'
  | 'ContribuicaoResidente'
```

Rodar `npx tsc --noEmit`: FALHA em `auditoria/page.tsx`, faltando as oito
chaves em `Record<EntidadeAuditada, string>`. É a rede funcionando.

- [ ] **Passo 7: Dar rótulo às oito**

```ts
  ConfiguracaoInstituicao: 'Dados da instituição',
  ContaBancaria: 'Conta bancária',
  OrigemReceita: 'Origem de receita',
  CategoriaDespesa: 'Categoria de despesa',
  Fornecedor: 'Fornecedor',
  Lancamento: 'Lançamento',
  PrestacaoContas: 'Prestação de contas',
  ContribuicaoResidente: 'Contribuição do residente',
```

- [ ] **Passo 8: Verificar e commitar**

```bash
npx tsc --noEmit && npx eslint && npm test
git add prisma/ src/ tests/ package.json package-lock.json
git commit -m "Acrescenta o schema do financeiro da Fase 3"
```

---

## Tarefa 2: Instituição e contas bancárias

**Arquivos:**
- Criar: `src/modules/financeiro/instituicao.service.ts`
- Criar: `src/modules/financeiro/instituicao.service.test.ts`

**Interfaces:**
- Produz:
  - `salvarConfiguracaoInstituicao(ctx, dados): Promise<ConfiguracaoInstituicao>`
  - `obterConfiguracaoInstituicao(ctx): Promise<ConfiguracaoInstituicao | null>`
  - `criarContaBancaria(ctx, dados): Promise<ContaBancaria>`
  - `listarContasBancarias(ctx): Promise<ContaBancaria[]>`
  - `desativarContaBancaria(ctx, id): Promise<void>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('salvarConfiguracaoInstituicao', () => {
  it('cria na primeira vez e atualiza nas seguintes', async () => {
    // Registro único: sem esta regra, duas configurações coexistiriam e a
    // exportação escolheria uma sem critério.
    const ctx = await ctxComPapel('COORDENACAO')

    await salvarConfiguracaoInstituicao(ctx, dadosInstituicao)
    await salvarConfiguracaoInstituicao(ctx, {
      ...dadosInstituicao,
      nomeTesoureiro: 'Outro Tesoureiro',
    })

    const total = await prisma.configuracaoInstituicao.count()
    expect(total).toBe(1)

    const config = await obterConfiguracaoInstituicao(ctx)
    expect(config?.nomeTesoureiro).toBe('Outro Tesoureiro')
  })

  it('recusa CNPJ com dígito verificador inválido', async () => {
    const ctx = await ctxComPapel('COORDENACAO')

    await expect(
      salvarConfiguracaoInstituicao(ctx, { ...dadosInstituicao, cnpj: '11.222.333/0001-00' })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    // A fronteira espelhada da 2A: lá o administrativo não vê prontuário;
    // aqui a saúde não vê dinheiro.
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      salvarConfiguracaoInstituicao(ctx, dadosInstituicao)
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('criarContaBancaria', () => {
  it('grava o saldo inicial como Decimal e audita', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const conta = await criarContaBancaria(ctx, {
      banco: 'Banco do Brasil',
      agencia: '1234-5',
      numeroConta: '98765-4',
      tipo: 'CORRENTE',
      titular: 'Lar dos Idosos',
      saldoInicial: 15000.5,
      dataSaldoInicial: new Date('2026-01-01'),
    })

    // `Decimal` não é número em JavaScript: comparar direto dá falso negativo
    // silencioso, o mesmo cuidado que `calcularDiff` toma com `beneficioValor`.
    expect(Number(conta.saldoInicial)).toBe(15000.5)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'ContaBancaria', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(conta.id)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarContaBancaria(ctx, {
        banco: 'Banco do Brasil',
        agencia: '1234-5',
        numeroConta: '98765-4',
        tipo: 'CORRENTE',
        titular: 'Lar dos Idosos',
        saldoInicial: 0,
        dataSaldoInicial: new Date('2026-01-01'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})
```

`dadosInstituicao` é uma constante no topo do arquivo de teste, com um CNPJ
válido — use `11.222.333/0001-81`, que passa no dígito verificador.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar `./instituicao.service`.

- [ ] **Passo 3: Escrever o serviço**

Formato de `src/modules/health/cabecalho.service.ts`. O CNPJ usa
`validarCnpj` de `@/lib/ptbr`, que já existe desde a Fase 1 e nunca tinha
chamador — foi escrito para este momento.

`salvarConfiguracaoInstituicao` faz `findFirst` e decide entre `create` e
`update`: é registro único, e uma segunda linha faria a exportação escolher uma
sem critério.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 5 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/
git commit -m "Acrescenta a configuracao da instituicao e as contas bancarias"
```

---

## Tarefa 3: Origens, categorias e fornecedores

**Arquivos:**
- Criar: `src/modules/financeiro/cadastros.service.ts`
- Criar: `src/modules/financeiro/cadastros.service.test.ts`

**Interfaces:**
- Produz:
  - `criarOrigemReceita(ctx, dados)`, `listarOrigensReceita(ctx)`
  - `criarCategoriaDespesa(ctx, dados)`, `listarCategoriasDespesa(ctx)`
  - `criarFornecedor(ctx, dados)`, `listarFornecedores(ctx)`
  - `desativarOrigemReceita(ctx, id)`, `desativarCategoriaDespesa(ctx, id)`,
    `desativarFornecedor(ctx, id)`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('criarOrigemReceita', () => {
  it('guarda o rótulo do documento separado do nome interno', async () => {
    // O ponto central do desenho de receitas: a contribuição dos residentes é
    // origem própria internamente, mas sai como "Doação" no documento,
    // somando com as demais. Nenhum nome de idoso entra na prestação.
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const origem = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })

    expect(origem.nome).toBe('Contribuição de residente')
    expect(origem.rotuloPrestacao).toBe('Doação')
    expect(origem.exigeResidente).toBe(true)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarOrigemReceita(ctx, { nome: 'Doação', rotuloPrestacao: 'Doação' })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('criarFornecedor', () => {
  it('valida o CPF e normaliza para dígitos', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    const fornecedor = await criarFornecedor(ctx, {
      nome: 'José da Silva',
      documento: '529.982.247-25',
      tipoDocumento: 'CPF',
    })

    expect(fornecedor.documento).toBe('52998224725')
  })

  it('recusa CNPJ inválido', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')

    await expect(
      criarFornecedor(ctx, {
        nome: 'Empresa X',
        documento: '11.222.333/0001-00',
        tipoDocumento: 'CNPJ',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      criarFornecedor(ctx, {
        nome: 'Empresa X',
        documento: '11.222.333/0001-81',
        tipoDocumento: 'CNPJ',
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('listarCategoriasDespesa', () => {
  it('traz só as ativas, em ordem alfabética', async () => {
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    await criarCategoriaDespesa(ctx, { nome: 'Energia' })
    const antiga = await criarCategoriaDespesa(ctx, { nome: 'Água e esgoto' })
    await criarCategoriaDespesa(ctx, { nome: 'Salário' })
    await desativarCategoriaDespesa(ctx, antiga.id)

    const lista = await listarCategoriasDespesa(ctx)
    expect(lista.map((c) => c.nome)).toEqual(['Energia', 'Salário'])
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

`validarCpf` e `validarCnpj` de `@/lib/ptbr`, escolhidos por `tipoDocumento`.
`somenteDigitos` normaliza antes de gravar, como `residentes.schema.ts` já faz
com o CPF do residente.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 6 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/cadastros.service.ts src/modules/financeiro/cadastros.service.test.ts
git commit -m "Acrescenta origens, categorias e fornecedores"
```

---

## Tarefa 4: Lançamentos

**Arquivos:**
- Criar: `src/modules/financeiro/lancamentos.service.ts`
- Criar: `src/modules/financeiro/lancamentos.service.test.ts`

**Interfaces:**
- Produz:
  - `lancarReceita(ctx, dados): Promise<Lancamento>`
  - `lancarDespesa(ctx, dados): Promise<Lancamento>`
  - `cancelarLancamento(ctx, id, motivo): Promise<Lancamento>`
  - `conciliarLancamento(ctx, id): Promise<Lancamento>`
  - `listarLancamentos(ctx, filtros): Promise<Lancamento[]>` onde
    `filtros = { contaBancariaId?, de?, ate?, natureza? }`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('lancarReceita', () => {
  it('grava com origem e audita', async () => {
    const { ctx, conta, origem } = await cenario()

    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de mantimentos convertida',
      valor: 250,
      data: new Date('2026-08-10'),
    })

    expect(lancamento.natureza).toBe('RECEITA')
    expect(Number(lancamento.valor)).toBe(250)

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'Lancamento', acao: 'CRIAR' },
    })
    expect(log.entidadeId).toBe(lancamento.id)
  })

  it('exige residente quando a origem exige', async () => {
    // A origem "Contribuição de residente" tem `exigeResidente`: sem o
    // vínculo, o extrato individual não fecharia e ninguém perceberia.
    const { ctx, conta } = await cenario()
    const origem = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })

    await expect(
      lancarReceita(ctx, {
        contaBancariaId: conta.id,
        origemReceitaId: origem.id,
        descricao: 'Contribuição de agosto',
        valor: 500,
        data: new Date('2026-08-05'),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa valor zero ou negativo', async () => {
    const { ctx, conta, origem } = await cenario()

    await expect(
      lancarReceita(ctx, {
        contaBancariaId: conta.id,
        origemReceitaId: origem.id,
        descricao: 'Lançamento sem valor',
        valor: 0,
        data: new Date('2026-08-10'),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { conta, origem } = await cenario()
    const ctx = await ctxComPapel('SAUDE')

    await expect(
      lancarReceita(ctx, {
        contaBancariaId: conta.id,
        origemReceitaId: origem.id,
        descricao: 'Doação',
        valor: 100,
        data: new Date('2026-08-10'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('lancarDespesa', () => {
  it('exige fornecedor, categoria e forma de pagamento', async () => {
    // As três aparecem no documento entregue ao órgão: credor e CNPJ na aba
    // de despesas, categoria na conciliação, forma de pagamento na coluna
    // CH/OB. Faltando qualquer uma, a prestação sai incompleta.
    const { ctx, conta, fornecedor } = await cenario()

    await expect(
      lancarDespesa(ctx, {
        contaBancariaId: conta.id,
        fornecedorId: fornecedor.id,
        descricao: 'Conta de luz',
        valor: 800,
        data: new Date('2026-08-15'),
      } as never)
    ).rejects.toThrow(ErroValidacao)
  })
})

describe('conciliarLancamento', () => {
  it('marca o lançamento como conciliado, com a data', async () => {
    // A conciliação é manual, contra o extrato do banco. Sem a data, ninguém
    // sabe se a conferência é de ontem ou de três meses atrás.
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 100,
      data: new Date('2026-08-10'),
    })

    const conciliado = await conciliarLancamento(ctx, lancamento.id)

    expect(conciliado.conciliado).toBe(true)
    expect(conciliado.conciliadoEm).not.toBeNull()
  })

  it('nega ao papel SAUDE', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 100,
      data: new Date('2026-08-10'),
    })
    const saude = await ctxComPapel('SAUDE')

    await expect(conciliarLancamento(saude, lancamento.id)).rejects.toThrow(ErroPermissao)
  })
})

describe('cancelarLancamento', () => {
  it('não apaga: marca CANCELADO com motivo e audita', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação lançada em dobro',
      valor: 100,
      data: new Date('2026-08-10'),
    })

    const cancelado = await cancelarLancamento(ctx, lancamento.id, 'Lançado em duplicidade')

    expect(cancelado.status).toBe('CANCELADO')
    expect(cancelado.motivoCancelamento).toBe('Lançado em duplicidade')
  })

  it('exige motivo', async () => {
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 100,
      data: new Date('2026-08-10'),
    })

    await expect(cancelarLancamento(ctx, lancamento.id, '')).rejects.toThrow(ErroValidacao)
  })

  it('recusa cancelar lançamento já em prestação fechada', async () => {
    // É o congelamento: um lançamento que já foi ao órgão não muda sem a
    // prestação ser reaberta.
    const { ctx, conta, origem } = await cenario()
    const lancamento = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação',
      valor: 100,
      data: new Date('2026-08-10'),
    })
    await prisma.lancamento.update({
      where: { id: lancamento.id },
      data: { prestacaoContas: { create: prestacaoFechadaDeTeste(conta.id) } },
    })

    await expect(
      cancelarLancamento(ctx, lancamento.id, 'Tentativa de mexer no que já foi')
    ).rejects.toThrow(ErroValidacao)
  })
})
```

O helper `cenario()` cria ctx ADMINISTRATIVO, conta, origem, categoria e
fornecedor, e mora no próprio arquivo de teste.
`prestacaoFechadaDeTeste(contaId)` devolve o objeto de criação de uma prestação
com `status: 'FECHADA'`.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

Dois schemas Zod, um por natureza, porque os campos obrigatórios diferem —
receita exige `origemReceitaId`, despesa exige `fornecedorId`,
`categoriaDespesaId` e `formaPagamento`. Um schema único com tudo opcional
aceitaria uma despesa sem categoria, e o defeito só apareceria na conciliação.

A checagem de `exigeResidente` mora no corpo da função: depende da origem
gravada, e schema não enxerga o banco.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 8 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/lancamentos.service.ts src/modules/financeiro/lancamentos.service.test.ts
git commit -m "Acrescenta os lancamentos de receita e despesa"
```

---

## Tarefa 5: Contribuição do residente e a proposta mensal

**Arquivos:**
- Criar: `src/modules/financeiro/contribuicoes.service.ts`
- Criar: `src/modules/financeiro/contribuicoes.service.test.ts`

**Interfaces:**
- Consome: `lancarReceita` (Tarefa 4).
- Produz:
  - `definirContribuicao(ctx, dados): Promise<ContribuicaoResidente>`
  - `obterContribuicaoVigente(ctx, residenteId, em?): Promise<ContribuicaoResidente | null>`
  - `montarPropostaMensal(ctx, ano, mes): Promise<PropostaContribuicao[]>` onde

```ts
export type PropostaContribuicao = {
  residenteId: string
  residenteNome: string
  percentual: number
  valorBaseBeneficio: number
  valorCalculado: number
  jaLancado: boolean
  lancamentoId: string | null
}
```

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('definirContribuicao', () => {
  it('encerra a vigente ao definir outra, em vez de editar no lugar', async () => {
    // A contribuição é percentual sobre o benefício, e o benefício é
    // reajustado todo ano. Editar no lugar apagaria quanto o residente pagou
    // no exercício anterior.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    const primeira = await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1518,
      vigenciaInicio: new Date('2027-01-01'),
    })

    const encerrada = await prisma.contribuicaoResidente.findUniqueOrThrow({
      where: { id: primeira.id },
    })
    expect(encerrada.vigenciaFim).not.toBeNull()

    const vigente = await obterContribuicaoVigente(ctx, residente.id, new Date('2027-06-01'))
    expect(Number(vigente?.valorBaseBeneficio)).toBe(1518)
  })

  it('recusa percentual acima de 70', async () => {
    // O art. 35, §2º da Lei 10.741/2003 limita a participação do idoso a 70%
    // do benefício. Aceitar mais seria o sistema ajudar a descumprir a lei.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirContribuicao(ctx, {
        residenteId: residente.id,
        percentual: 80,
        valorBaseBeneficio: 1412,
        vigenciaInicio: new Date('2026-01-01'),
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    const residente = await criarResidenteDeTeste()

    await expect(
      definirContribuicao(ctx, {
        residenteId: residente.id,
        percentual: 70,
        valorBaseBeneficio: 1412,
        vigenciaInicio: new Date('2026-01-01'),
      })
    ).rejects.toThrow(ErroPermissao)
  })
})

describe('montarPropostaMensal', () => {
  it('calcula o valor e mostra quem já foi lançado', async () => {
    // O sistema propõe, não lança: inventar dinheiro que pode não ter chegado
    // é pior que exigir a conferência.
    const { ctx, conta, origemContribuicao } = await cenario()
    const residente = await criarResidenteDeTeste({ nomeCompleto: 'Maria das Dores' })
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-01-01'),
    })

    const antes = await montarPropostaMensal(ctx, 2026, 8)
    expect(antes).toHaveLength(1)
    expect(antes[0].residenteNome).toBe('Maria das Dores')
    expect(antes[0].valorCalculado).toBe(988.4)
    expect(antes[0].jaLancado).toBe(false)

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origemContribuicao.id,
      residenteId: residente.id,
      descricao: 'Contribuição de agosto',
      valor: 988.4,
      data: new Date('2026-08-05'),
    })

    const depois = await montarPropostaMensal(ctx, 2026, 8)
    expect(depois[0].jaLancado).toBe(true)
    expect(depois[0].lancamentoId).not.toBeNull()
  })

  it('não propõe para residente sem contribuição vigente no mês', async () => {
    const { ctx } = await cenario()
    const residente = await criarResidenteDeTeste()
    await definirContribuicao(ctx, {
      residenteId: residente.id,
      percentual: 70,
      valorBaseBeneficio: 1412,
      vigenciaInicio: new Date('2026-09-01'),
    })

    expect(await montarPropostaMensal(ctx, 2026, 8)).toHaveLength(0)
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(montarPropostaMensal(ctx, 2026, 8)).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

`definirContribuicao` encerra a vigente (`vigenciaFim = vigenciaInicio da nova
menos um dia`) dentro da mesma transação, como `prescreverSubstituta` faz com a
medicação — pelo mesmo motivo: o histórico é o que a fiscalização lê.

O valor é `percentual / 100 × valorBaseBeneficio`, arredondado a dois decimais
com `Math.round(v * 100) / 100`. **Não use `toFixed` para calcular** — ele
devolve string e arredonda por representação binária.

`jaLancado` sai de uma consulta por `residenteId` mais mês da `data`, com
`status` diferente de `CANCELADO`.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 6 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/contribuicoes.service.ts src/modules/financeiro/contribuicoes.service.test.ts
git commit -m "Acrescenta a contribuicao do residente e a proposta mensal"
```

---

## Tarefa 6: Prestação — abrir, saldo anterior e ajuste

**Arquivos:**
- Criar: `src/modules/financeiro/prestacoes.service.ts`
- Criar: `src/modules/financeiro/prestacoes.service.test.ts`

**Interfaces:**
- Produz:
  - `abrirPrestacao(ctx, contaBancariaId, ano, mes): Promise<PrestacaoContas>`
  - `calcularSaldoAnterior(ctx, contaBancariaId, ano, mes): Promise<number>`
  - `ajustarSaldoAnterior(ctx, id, valor, justificativa): Promise<PrestacaoContas>`
  - `obterPrestacao(ctx, id): Promise<PrestacaoContas>`
  - `listarPrestacoes(ctx, filtros): Promise<PrestacaoContas[]>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('calcularSaldoAnterior', () => {
  it('na primeira prestação da conta, vem do saldo inicial', async () => {
    const { ctx, conta } = await cenario()

    const saldo = await calcularSaldoAnterior(ctx, conta.id, 2026, 8)
    expect(saldo).toBe(15000)
  })

  it('nas seguintes, vem do saldo disponível da anterior fechada', async () => {
    // É o que elimina a recontagem manual: hoje alguém copia o saldo final do
    // mês anterior torcendo para não errar.
    const { ctx, conta, origem } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de julho',
      valor: 1000,
      data: new Date('2026-07-10'),
    })
    const julho = await abrirPrestacao(ctx, conta.id, 2026, 7)
    // Fechada direto no banco: `fecharPrestacao` só nasce na Tarefa 7, e o que
    // este teste exercita é a leitura do saldo, não o ato de fechar.
    await prisma.prestacaoContas.update({
      where: { id: julho.id },
      data: { status: 'FECHADA', fechadaEm: new Date() },
    })

    const saldo = await calcularSaldoAnterior(ctx, conta.id, 2026, 8)
    expect(saldo).toBe(16000)
  })

  it('ignora prestação anterior ainda aberta', async () => {
    // Saldo de prestação aberta ainda pode mudar. Herdá-lo daria um saldo
    // inicial que se move sozinho.
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de julho',
      valor: 1000,
      data: new Date('2026-07-10'),
    })
    await abrirPrestacao(ctx, conta.id, 2026, 7)

    expect(await calcularSaldoAnterior(ctx, conta.id, 2026, 8)).toBe(15000)
  })
})

describe('abrirPrestacao', () => {
  it('grava o saldo anterior derivado e nasce ABERTA', async () => {
    const { ctx, conta } = await cenario()

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    expect(prestacao.status).toBe('ABERTA')
    expect(Number(prestacao.saldoAnterior)).toBe(15000)
  })

  it('recusa a segunda prestação da mesma conta e competência', async () => {
    const { ctx, conta } = await cenario()
    await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(abrirPrestacao(ctx, conta.id, 2026, 8)).rejects.toThrow(ErroValidacao)
  })

  it('nega ao papel SAUDE', async () => {
    const { conta } = await cenario()
    const ctx = await ctxComPapel('SAUDE')

    await expect(abrirPrestacao(ctx, conta.id, 2026, 8)).rejects.toThrow(ErroPermissao)
  })
})

describe('ajustarSaldoAnterior', () => {
  it('exige justificativa e preserva o valor derivado', async () => {
    // O derivado continua no campo original: a divergência fica registrada
    // com autor e motivo, em vez de ser sobrescrita em silêncio.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(
      ajustarSaldoAnterior(ctx, prestacao.id, 14800, '')
    ).rejects.toThrow(ErroValidacao)

    const ajustada = await ajustarSaldoAnterior(
      ctx,
      prestacao.id,
      14800,
      'Tarifa bancária lançada pelo banco fora do extrato de julho'
    )

    expect(Number(ajustada.saldoAnterior)).toBe(15000)
    expect(Number(ajustada.saldoAnteriorAjustado)).toBe(14800)
    expect(ajustada.justificativaAjuste).toContain('Tarifa bancária')
  })
})
```

`cenario()` cria ctx ADMINISTRATIVO, uma conta com `saldoInicial: 15000`, uma
origem e uma categoria.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o serviço**

`calcularSaldoAnterior` procura a prestação **fechada** imediatamente anterior
da mesma conta; achando, soma saldo (ajustado, se houver) + receitas − despesas
`REALIZADO` daquela competência; não achando, devolve `ContaBancaria.saldoInicial`.

A restrição única do banco já impede a prestação duplicada; o serviço a
antecipa com mensagem de gente, e trata `P2002` como
`ErroValidacao('Já existe prestação desta conta nesta competência')` — o mesmo
padrão de `registrarAdministracao` na Fase 2B.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 7 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/prestacoes.service.ts src/modules/financeiro/prestacoes.service.test.ts
git commit -m "Acrescenta a abertura da prestacao e o saldo anterior derivado"
```

---

## Tarefa 7: Fechar e reabrir

**Arquivos:**
- Modificar: `src/modules/financeiro/prestacoes.service.ts`
- Modificar: `src/modules/financeiro/prestacoes.service.test.ts`

**Interfaces:**
- Produz:
  - `fecharPrestacao(ctx, id): Promise<PrestacaoContas>`
  - `reabrirPrestacao(ctx, id, motivo): Promise<PrestacaoContas>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('fecharPrestacao', () => {
  it('congela os lançamentos REALIZADO da competência', async () => {
    // É o que impede um lançamento posterior de mudar, em silêncio, um
    // documento já protocolado no órgão.
    const { ctx, conta, origem } = await cenario()
    const dentro = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de agosto',
      valor: 500,
      data: new Date('2026-08-10'),
    })
    const fora = await lancarReceita(ctx, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de setembro',
      valor: 700,
      data: new Date('2026-09-02'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await fecharPrestacao(ctx, prestacao.id)

    const congelado = await prisma.lancamento.findUniqueOrThrow({ where: { id: dentro.id } })
    const solto = await prisma.lancamento.findUniqueOrThrow({ where: { id: fora.id } })

    expect(congelado.prestacaoContasId).toBe(prestacao.id)
    expect(solto.prestacaoContasId).toBeNull()
  })

  it('fecha um mês sem movimento', async () => {
    // Prestação de saldo zero é um fato. Exigir lançamento empurraria alguém
    // a inventar um.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const fechada = await fecharPrestacao(ctx, prestacao.id)
    expect(fechada.status).toBe('FECHADA')
  })

  it('nega ao papel ADMINISTRATIVO: fechar é ato de coordenação', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(fecharPrestacao(ctx, prestacao.id)).rejects.toThrow(ErroPermissao)
  })

  it('recusa fechar o que já está fechado', async () => {
    const { conta } = await cenario()
    const coordenacao = await ctxComPapel('COORDENACAO')
    const prestacao = await abrirPrestacao(coordenacao, conta.id, 2026, 8)
    await fecharPrestacao(coordenacao, prestacao.id)

    await expect(fecharPrestacao(coordenacao, prestacao.id)).rejects.toThrow(ErroValidacao)
  })
})

describe('reabrirPrestacao', () => {
  it('exige motivo, solta os lançamentos e registra quem reabriu', async () => {
    const { conta, origem } = await cenario()
    const coordenacao = await ctxComPapel('COORDENACAO')
    const lancamento = await lancarReceita(coordenacao, {
      contaBancariaId: conta.id,
      origemReceitaId: origem.id,
      descricao: 'Doação de agosto',
      valor: 500,
      data: new Date('2026-08-10'),
    })
    const prestacao = await abrirPrestacao(coordenacao, conta.id, 2026, 8)
    await fecharPrestacao(coordenacao, prestacao.id)

    await expect(reabrirPrestacao(coordenacao, prestacao.id, '')).rejects.toThrow(ErroValidacao)

    const reaberta = await reabrirPrestacao(
      coordenacao,
      prestacao.id,
      'Nota fiscal de julho chegou atrasada'
    )

    expect(reaberta.status).toBe('ABERTA')
    expect(reaberta.motivoReabertura).toContain('atrasada')
    expect(reaberta.reabertaPorId).toBe(coordenacao.usuarioId)

    const solto = await prisma.lancamento.findUniqueOrThrow({ where: { id: lancamento.id } })
    expect(solto.prestacaoContasId).toBeNull()
  })

  it('leva o motivo para o diff da auditoria', async () => {
    // O documento protocolado não pode mudar em silêncio: a trilha é onde
    // fica o histórico completo, inclusive de reaberturas sucessivas.
    const { conta } = await cenario()
    const coordenacao = await ctxComPapel('COORDENACAO')
    const prestacao = await abrirPrestacao(coordenacao, conta.id, 2026, 8)
    await fecharPrestacao(coordenacao, prestacao.id)
    await reabrirPrestacao(coordenacao, prestacao.id, 'Nota fiscal atrasada')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'PrestacaoContas', acao: 'ATUALIZAR', entidadeId: prestacao.id },
      orderBy: { criadoEm: 'desc' },
    })
    expect(JSON.stringify(log.diff)).toContain('Nota fiscal atrasada')
  })

  it('nega ao papel ADMINISTRATIVO', async () => {
    const { ctx, conta } = await cenario()
    const coordenacao = await ctxComPapel('COORDENACAO')
    const prestacao = await abrirPrestacao(coordenacao, conta.id, 2026, 8)
    await fecharPrestacao(coordenacao, prestacao.id)

    await expect(
      reabrirPrestacao(ctx, prestacao.id, 'Motivo qualquer')
    ).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — as funções não existem.

- [ ] **Passo 3: Escrever as duas funções**

`exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO')` nas duas — sem
ADMINISTRATIVO. Fechar e reabrir são atos institucionais.

O `updateMany` do fechamento casa por conta, mês da `data`, e
`status: 'REALIZADO'`: previsto e cancelado não vão ao órgão.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 8 testes novos.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/
git commit -m "Acrescenta fechar e reabrir a prestacao, com motivo registrado"
```

---

## Tarefa 8: O documento abstrato

**Arquivos:**
- Criar: `src/modules/financeiro/documento-prestacao.ts`
- Criar: `src/modules/financeiro/documento-prestacao.test.ts`

**Interfaces:**
- Produz: o tipo `DocumentoPrestacao` (conforme a §4 da spec) e
  `montarDocumentoPrestacao(ctx, prestacaoId): Promise<DocumentoPrestacao>`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('montarDocumentoPrestacao', () => {
  it('agrupa receitas pelo rótulo da prestação, não pelo nome interno', async () => {
    // O ponto do desenho: a contribuição sai como "Doação", somando com as
    // demais. Nenhum nome de idoso entra na prestação.
    const { ctx, conta } = await cenario()
    const doacao = await criarOrigemReceita(ctx, { nome: 'Doação', rotuloPrestacao: 'Doação' })
    const contribuicao = await criarOrigemReceita(ctx, {
      nome: 'Contribuição de residente',
      rotuloPrestacao: 'Doação',
      exigeResidente: true,
    })
    const residente = await criarResidenteDeTeste()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: doacao.id,
      descricao: 'Doação avulsa', valor: 300, data: new Date('2026-08-05'),
    })
    await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: contribuicao.id,
      residenteId: residente.id,
      descricao: 'Contribuição de agosto', valor: 988.4, data: new Date('2026-08-05'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.recebimentosPorOrigem).toEqual([
      { rotulo: 'Doação', valor: 1288.4 },
    ])
    // E nenhum nome de residente em lugar nenhum do documento.
    expect(JSON.stringify(documento)).not.toContain(residente.nomeCompleto)
  })

  it('calcula o saldo disponível a partir do saldo anterior', async () => {
    const { ctx, conta, origem, fornecedor, categoria } = await cenario()

    await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: origem.id,
      descricao: 'Doação', valor: 2000, data: new Date('2026-08-05'),
    })
    await lancarDespesa(ctx, {
      contaBancariaId: conta.id, fornecedorId: fornecedor.id,
      categoriaDespesaId: categoria.id, formaPagamento: 'PIX',
      descricao: 'Conta de luz', valor: 800, data: new Date('2026-08-15'),
    })

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.saldoAnterior).toBe(15000)
    expect(documento.conciliacao.totalReceitas).toBe(2000)
    expect(documento.conciliacao.totalDespesas).toBe(800)
    expect(documento.conciliacao.saldoDisponivel).toBe(16200)
  })

  it('usa o saldo ajustado quando existe, e leva a justificativa às observações', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    await ajustarSaldoAnterior(ctx, prestacao.id, 14800, 'Tarifa fora do extrato')

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.conciliacao.saldoAnterior).toBe(14800)
    expect(documento.encerramento.observacoes).toContain('Tarifa fora do extrato')
  })

  it('numera os itens em sequência, a partir de 1', async () => {
    // A coluna `Item` do modelo é sequencial por folha.
    const { ctx, conta, origem } = await cenario()
    for (const valor of [100, 200, 300]) {
      await lancarReceita(ctx, {
        contaBancariaId: conta.id, origemReceitaId: origem.id,
        descricao: `Doação de ${valor}`, valor, data: new Date('2026-08-05'),
      })
    }

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas.map((r) => r.item)).toEqual([1, 2, 3])
  })

  it('não inclui lançamento cancelado nem previsto', async () => {
    const { ctx, conta, origem } = await cenario()
    const cancelado = await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: origem.id,
      descricao: 'Doação duplicada', valor: 999, data: new Date('2026-08-05'),
    })
    await cancelarLancamento(ctx, cancelado.id, 'Lançado em duplicidade')

    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)
    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)

    expect(documento.receitas).toHaveLength(0)
    expect(documento.conciliacao.totalReceitas).toBe(0)
  })

  it('escreve o mês por extenso, em português', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const documento = await montarDocumentoPrestacao(ctx, prestacao.id)
    expect(documento.capa.mesPorExtenso).toBe('agosto')
  })

  it('recusa montar sem a configuração da instituição', async () => {
    // A capa, o ofício e as assinaturas saem dela. Sem ela o documento sairia
    // com lacunas onde deveria haver razão social e CNPJ.
    const ctx = await ctxComPapel('ADMINISTRATIVO')
    const conta = await criarContaBancaria(ctx, contaDeTeste)
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await expect(montarDocumentoPrestacao(ctx, prestacao.id)).rejects.toThrow(ErroValidacao)
  })
})
```

O `cenario()` desta tarefa **inclui** a configuração da instituição; o último
teste usa um cenário sem ela, de propósito.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo**

```ts
/**
 * A prestação como estrutura, sem saber nada de `.xlsx` nem de PDF.
 *
 * **É aqui que os totais são calculados, e em nenhum outro lugar.** Os dois
 * renderizadores recebem números prontos — é o que impede o `.xlsx` e o PDF de
 * divergirem no dia em que alguém corrigir um cálculo em só um deles.
 *
 * O agrupamento de receitas usa `OrigemReceita.rotuloPrestacao`, e não o texto
 * digitado: no Excel o `SUMIF` casa a descrição literal, e "Doação " com
 * espaço sobrando sai do subtotal sem avisar. Aqui é chave estrangeira.
 */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
```

Os valores saem de `Decimal` com `Number(...)` e são somados como número; o
arredondamento final usa `Math.round(v * 100) / 100`.

`observacoes` do encerramento concatena, nesta ordem: as observações digitadas
na prestação, a justificativa do ajuste de saldo (se houver) e o motivo da
reabertura (se houver). É o que faz a correção aparecer no documento regerado.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 7 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/documento-prestacao.ts src/modules/financeiro/documento-prestacao.test.ts
git commit -m "Acrescenta o documento abstrato da prestacao"
```

---

## Tarefa 9: Extrair o layout do modelo real

**Arquivos:**
- Criar: `scripts/extrair-layout-prestacao.ts`
- Criar: `src/modules/financeiro/layout-prestacao.ts` (gerado pelo script)
- Modificar: `README.md`

**Interfaces:**
- Produz:

```ts
export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  /** Rótulos fixos: célula → texto. Nunca dado de ninguém. */
  rotulos: Record<string, string>
  /** Onde começa e termina a faixa de dados que cresce com o volume. */
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }
}

export const LAYOUT: Record<
  '1-Capa' | '2-Contra-Capa' | '3-Despesas' | '4-Receitas' | '5-Conciliação' | '6-Encerramento',
  LayoutFolha
>
```

- [ ] **Passo 1: Escrever o script de extração**

`scripts/extrair-layout-prestacao.ts` lê
`docs/convenio/Modelo Prestação Contas.xlsx` com `exceljs` e emite o módulo.

**O que ele extrai:** nomes das folhas, faixas de merge, larguras de coluna, e
os textos de células que são **rótulo fixo** — cabeçalho de coluna, título de
seção, palavras como "Total". **O que ele nunca extrai:** as linhas de dado.

O critério é explícito no script, e precisa estar num comentário:

```ts
// O modelo é um exemplo PREENCHIDO, com fornecedores e valores reais, e o
// repositório é público. Só saem daqui células fora das faixas de dados —
// cabeçalhos, títulos e rótulos. Uma célula dentro da faixa de dados nunca é
// copiada, mesmo que pareça inofensiva.
```

- [ ] **Passo 2: Rodar o script e conferir o resultado à mão**

```bash
npx tsx scripts/extrair-layout-prestacao.ts > src/modules/financeiro/layout-prestacao.ts
```

**Leia o arquivo gerado inteiro antes de commitar.** Procure por nome de
pessoa, nome de empresa, CPF, CNPJ e valor monetário. Se encontrar qualquer um,
o critério do script está errado — conserte o script, não o arquivo gerado.

- [ ] **Passo 3: Escrever o teste que trava o critério**

Em `src/modules/financeiro/layout-prestacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LAYOUT } from './layout-prestacao'

describe('LAYOUT', () => {
  it('tem as seis folhas do modelo', () => {
    expect(Object.keys(LAYOUT)).toEqual([
      '1-Capa', '2-Contra-Capa', '3-Despesas',
      '4-Receitas', '5-Conciliação', '6-Encerramento',
    ])
  })

  it('não carrega documento de ninguém', () => {
    // O modelo é um exemplo preenchido e o repositório é público. Este teste
    // é a última barreira: se um CPF ou CNPJ escapar da extração, ele falha.
    const tudo = JSON.stringify(LAYOUT)
    expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    expect(tudo).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
    expect(tudo).not.toMatch(/\d{11,14}/)
  })

  it('sabe onde a faixa de dados cresce, nas folhas que crescem', () => {
    expect(LAYOUT['3-Despesas'].faixaDados).toBeDefined()
    expect(LAYOUT['4-Receitas'].faixaDados).toBeDefined()
  })
})
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 3 testes. Se o segundo falhar, **não relaxe o teste** — a
extração deixou passar dado real.

- [ ] **Passo 5: Documentar o procedimento**

No `README.md`, uma nota curta: o layout é gerado a partir do modelo em
`docs/convenio/`, que fica fora do git; para regerar, rodar o script; e o
arquivo gerado nunca deve conter dado — há teste para isso.

- [ ] **Passo 6: Commitar**

```bash
git add scripts/ src/modules/financeiro/layout-prestacao.ts src/modules/financeiro/layout-prestacao.test.ts README.md
git commit -m "Extrai o layout do modelo de prestacao para codigo"
```

---

## Tarefa 10: O renderizador `.xlsx`

**Arquivos:**
- Criar: `src/modules/financeiro/xlsx-prestacao.ts`
- Criar: `src/modules/financeiro/xlsx-prestacao.test.ts`

**Interfaces:**
- Consome: `DocumentoPrestacao` (Tarefa 8), `LAYOUT` (Tarefa 9).
- Produz: `gerarXlsxPrestacao(documento: DocumentoPrestacao): Promise<Buffer>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
import ExcelJS from 'exceljs'

async function reabrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('gerarXlsxPrestacao', () => {
  it('gera as seis folhas, na ordem do modelo', async () => {
    const wb = await reabrir(await gerarXlsxPrestacao(documentoDeTeste()))

    expect(wb.worksheets.map((f) => f.name)).toEqual([
      '1-Capa', '2-Contra-Capa', '3-Despesas',
      '4-Receitas', '5-Conciliação', '6-Encerramento',
    ])
  })

  it('grava valores calculados, e nenhuma fórmula', async () => {
    // O sistema é a fonte da verdade dos totais. As fórmulas do modelo são a
    // parte frágil: soma de faixa fixa, agrupamento por texto literal, e um
    // XLOOKUP que já aponta para #REF!.
    const wb = await reabrir(await gerarXlsxPrestacao(documentoDeTeste()))

    for (const folha of wb.worksheets) {
      folha.eachRow((linha) => {
        linha.eachCell((celula) => {
          expect(celula.formula).toBeUndefined()
        })
      })
    }
  })

  it('grava data como data, não como número de série', async () => {
    // No modelo atual elas aparecem como 45995.
    const documento = documentoDeTeste({
      despesas: [
        {
          item: 1, credor: 'Empresa X', documento: '11222333000181',
          formaPagamento: 'PIX', data: new Date('2026-08-15'), valor: 800,
        },
      ],
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))
    const folha = wb.getWorksheet('3-Despesas')!
    const celula = celulaDaPrimeiraData(folha)

    expect(celula.value).toBeInstanceOf(Date)
  })

  it('cresce além das 24 linhas do modelo quando o mês tem mais lançamentos', async () => {
    // O teto já foi atingido: hoje a equipe insere linhas e reajusta fórmulas
    // à mão.
    const despesas = Array.from({ length: 40 }, (_, i) => ({
      item: i + 1, credor: `Fornecedor ${i + 1}`, documento: '11222333000181',
      formaPagamento: 'PIX', data: new Date('2026-08-15'), valor: 100,
    }))
    const wb = await reabrir(await gerarXlsxPrestacao(documentoDeTeste({ despesas })))
    const folha = wb.getWorksheet('3-Despesas')!

    expect(folha.rowCount).toBeGreaterThan(40)
  })

  it('o total da folha bate com o do documento', async () => {
    const documento = documentoDeTeste({
      despesas: [
        { item: 1, credor: 'A', documento: '11222333000181', formaPagamento: 'PIX',
          data: new Date('2026-08-01'), valor: 300.25 },
        { item: 2, credor: 'B', documento: '11222333000181', formaPagamento: 'TED',
          data: new Date('2026-08-02'), valor: 499.75 },
      ],
    })
    const wb = await reabrir(await gerarXlsxPrestacao(documento))
    const folha = wb.getWorksheet('3-Despesas')!

    expect(valorDoTotal(folha)).toBe(800)
  })
})
```

`documentoDeTeste(sobrescritas?)` monta um `DocumentoPrestacao` completo no
próprio arquivo de teste — sem banco. `celulaDaPrimeiraData` e `valorDoTotal`
são helpers locais que varrem a folha procurando pela linha marcada.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o renderizador**

Para cada folha do `LAYOUT`: aplicar larguras, escrever os rótulos fixos nas
células que o layout indica, preencher a faixa de dados linha a linha, e
aplicar os merges — **os merges por último**, porque mesclar antes de escrever
perde o conteúdo das células secundárias.

Nas folhas que crescem, os merges da faixa de dados são replicados por linha,
deslocando o número: o layout guarda o padrão de uma linha, e o renderizador o
repete pelo volume real.

Formato de moeda `'#,##0.00'` e de data `'dd/mm/yyyy'` nas células
correspondentes.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 5 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/xlsx-prestacao.ts src/modules/financeiro/xlsx-prestacao.test.ts
git commit -m "Acrescenta o renderizador xlsx da prestacao"
```

---

## Tarefa 11: O renderizador PDF

**Arquivos:**
- Criar: `src/modules/financeiro/pdf-prestacao.ts`
- Criar: `src/modules/financeiro/pdf-prestacao.test.ts`

**Interfaces:**
- Consome: `DocumentoPrestacao` (Tarefa 8).
- Produz: `gerarPdfPrestacao(documento: DocumentoPrestacao): Promise<Buffer>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('gerarPdfPrestacao', () => {
  it('gera um PDF válido', async () => {
    const buffer = await gerarPdfPrestacao(documentoDeTeste())

    // Todo PDF começa com esta assinatura.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('tem uma página por seção do documento', async () => {
    const buffer = await gerarPdfPrestacao(documentoDeTeste())
    // O contador de páginas do PDF aparece no catálogo.
    const texto = buffer.toString('latin1')
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length

    expect(paginas).toBeGreaterThanOrEqual(6)
  })

  it('escreve a razão social e o mês por extenso', async () => {
    // O PDF não é pixel a pixel igual ao .xlsx, mas é o MESMO documento: o
    // conteúdo precisa estar lá.
    const documento = documentoDeTeste()
    const buffer = await gerarPdfPrestacao(documento)
    const texto = extrairTexto(buffer)

    expect(texto).toContain(documento.capa.razaoSocial)
    expect(texto).toContain('agosto')
  })

  it('não quebra com quarenta despesas', async () => {
    // A tabela precisa paginar sozinha, repetindo o cabeçalho.
    const despesas = Array.from({ length: 40 }, (_, i) => ({
      item: i + 1, credor: `Fornecedor ${i + 1}`, documento: '11222333000181',
      formaPagamento: 'PIX', data: new Date('2026-08-15'), valor: 100,
    }))

    const buffer = await gerarPdfPrestacao(documentoDeTeste({ despesas }))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(extrairTexto(buffer)).toContain('Fornecedor 40')
  })
})
```

`extrairTexto(buffer)` é um helper local: `pdfkit` escreve os textos em
segmentos `Tj`/`TJ` dentro de streams. Para o teste basta gerar o PDF **sem
compressão** (`new PDFDocument({ compress: false })` quando
`process.env.NODE_ENV === 'test'`) e varrer o buffer em `latin1` pelos
parênteses dos operadores de texto.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o renderizador**

Seis seções, uma por página, na ordem do `.xlsx`. Fontes padrão do PDF
(`Helvetica`, `Helvetica-Bold`), que cobrem os acentos do português — nenhum
arquivo de fonte a embarcar.

Tabelas com largura de coluna fixa, cabeçalho repetido quando a lista quebra de
página, totais em negrito, e blocos de assinatura ao pé das folhas que os têm
no modelo.

```ts
/**
 * O mesmo documento do `.xlsx`, desenhado para impressão e assinatura.
 *
 * **Não é pixel a pixel igual**, e não precisa ser: o que vai ao órgão é o
 * `.xlsx`. Este PDF serve ao arquivo interno, à conferência e à assinatura
 * física.
 *
 * `pdfkit`, e não conversão do `.xlsx`: converter com LibreOffice ou Chromium
 * daria fidelidade perfeita e custaria uns 400 MB na imagem Docker mais um
 * subprocesso, num VPS único.
 */
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/modules/financeiro/pdf-prestacao.ts src/modules/financeiro/pdf-prestacao.test.ts
git commit -m "Acrescenta o renderizador PDF da prestacao"
```

---

## Tarefa 12: O download autenticado, com auditoria

**Arquivos:**
- Criar: `src/app/api/prestacoes/[id]/[formato]/route.ts`
- Criar: `src/modules/financeiro/exportar.ts`
- Criar: `src/modules/financeiro/exportar.test.ts`

**Interfaces:**
- Consome: `montarDocumentoPrestacao`, `gerarXlsxPrestacao`, `gerarPdfPrestacao`.
- Produz:
  - `exportarPrestacao(ctx, id, formato: 'xlsx' | 'pdf'): Promise<{ buffer: Buffer; nomeArquivo: string; mimeType: string }>`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe('exportarPrestacao', () => {
  it('gera o .xlsx com nome de arquivo que diz conta e competência', async () => {
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    const { buffer, nomeArquivo, mimeType } = await exportarPrestacao(ctx, prestacao.id, 'xlsx')

    expect(nomeArquivo).toBe('prestacao-98765-4-2026-08.xlsx')
    expect(mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('audita EXPORTAR, com o formato no diff', async () => {
    // A ação existe no enum desde a Fase 1 e nunca tinha sido usada. É o
    // registro de que um documento saiu do sistema, com quem o gerou.
    const { ctx, conta } = await cenario()
    const prestacao = await abrirPrestacao(ctx, conta.id, 2026, 8)

    await exportarPrestacao(ctx, prestacao.id, 'pdf')

    const log = await prisma.logAuditoria.findFirstOrThrow({
      where: { entidade: 'PrestacaoContas', acao: 'EXPORTAR', entidadeId: prestacao.id },
    })
    expect(JSON.stringify(log.diff)).toContain('pdf')
  })

  it('nega ao papel SAUDE', async () => {
    const { conta } = await cenario()
    const admin = await ctxComPapel('ADMINISTRATIVO')
    const prestacao = await abrirPrestacao(admin, conta.id, 2026, 8)
    const ctx = await ctxComPapel('SAUDE')

    await expect(exportarPrestacao(ctx, prestacao.id, 'xlsx')).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA ao carregar o módulo.

- [ ] **Passo 3: Escrever o módulo e a rota**

A rota espelha `src/app/api/documentos/[id]/route.ts`, que já existe desde a
Fase 1: `obterCtx`, chama o serviço, e traduz `ErroPermissao` e
`ErroNaoEncontrado` em 404 — **os dois no mesmo código**, porque distinguir
entregaria a existência da prestação a quem não pode vê-la.

`Content-Disposition: attachment; filename="..."` com o nome que o serviço
devolve.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA, 3 testes.

- [ ] **Passo 5: Commitar**

```bash
git add src/app/api/prestacoes/ src/modules/financeiro/exportar.ts src/modules/financeiro/exportar.test.ts
git commit -m "Acrescenta o download autenticado da prestacao, auditado"
```

---

## Tarefa 13: A tela de lançamentos

**Arquivos:**
- Criar: `src/app/(app)/financeiro/page.tsx`, `src/app/(app)/financeiro/acoes.ts`
- Criar: `src/components/formularios-financeiro.tsx`
- Modificar: `src/app/(app)/layout.tsx`
- Criar: `tests/e2e/financeiro.spec.ts`

- [ ] **Passo 1: Escrever o E2E que falha**

Em `tests/e2e/financeiro.spec.ts`, um teste que cadastra conta, origem,
categoria e fornecedor pela tela de cadastros; lança uma receita e uma despesa;
e confere que as duas aparecem na lista com o valor formatado em `R$`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx playwright test tests/e2e/financeiro.spec.ts`
Esperado: FALHA — não existe `/financeiro`.

- [ ] **Passo 3: Escrever a tela e as ações**

Lista com filtro por conta, período e natureza, em query string — como
`/auditoria` e `/pendencias` já fazem. Receita e despesa em formulários
separados, dentro de `<details>`, porque os campos obrigatórios diferem.

Valores exibidos com `formatarMoeda` de `@/lib/ptbr`, que existe desde a Fase 1
e nunca tinha chamador.

Item de menu, depois de "Funcionários":

```ts
{ href: '/financeiro', rotulo: 'Financeiro', papeis: ['COORDENACAO', 'ADMINISTRATIVO'] },
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 5: Commitar**

```bash
git add "src/app/(app)/financeiro/" src/components/formularios-financeiro.tsx "src/app/(app)/layout.tsx" tests/e2e/financeiro.spec.ts
git commit -m "Acrescenta a tela de lancamentos"
```

---

## Tarefa 14: A tela de cadastros

**Arquivos:**
- Criar: `src/app/(app)/financeiro/cadastros/page.tsx`
- Modificar: `src/app/(app)/financeiro/acoes.ts`, `src/components/formularios-financeiro.tsx`

- [ ] **Passo 1: Escrever o E2E que falha**

Acrescentar a `tests/e2e/financeiro.spec.ts` um teste que preenche os dados da
instituição, confere que eles voltam preenchidos ao recarregar, e que um CNPJ
inválido é recusado com mensagem em pt-BR.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — não existe `/financeiro/cadastros`.

- [ ] **Passo 3: Escrever a tela**

Cinco seções `<details>`: dados da instituição (formulário único, pré-preenchido
com o que já existe), contas bancárias, origens de receita, categorias de
despesa e fornecedores. Cada lista com o seu formulário de criação e a ação de
desativar, no padrão que a ficha do residente já usa.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 5: Commitar**

```bash
git add "src/app/(app)/financeiro/" src/components/ tests/e2e/financeiro.spec.ts
git commit -m "Acrescenta a tela de cadastros do financeiro"
```

---

## Tarefa 15: A tela de prestações

**Arquivos:**
- Criar: `src/app/(app)/financeiro/prestacoes/page.tsx`
- Modificar: `src/app/(app)/financeiro/acoes.ts`, `src/components/formularios-financeiro.tsx`

- [ ] **Passo 1: Escrever o E2E que falha**

Acrescentar um teste que abre a prestação de uma conta numa competência,
confere o saldo anterior exibido, fecha a prestação, e baixa os dois arquivos
pelo endpoint — conferindo `status` 200 e o `content-type` de cada um.

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — não existe `/financeiro/prestacoes`.

- [ ] **Passo 3: Escrever a tela**

Lista por conta e competência. Cada prestação mostra o saldo anterior derivado
**com o botão de ajustar ao lado**, os totais, e o status. Aberta: botões de
ajustar saldo e fechar. Fechada: os dois links de download e o botão de
reabrir, este último com o campo de motivo.

O aviso de reabertura precisa dizer o que acontece: o documento pode ser
regerado diferente do que já foi protocolado, e a reabertura fica na trilha e
nas observações.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 5: Commitar**

```bash
git add "src/app/(app)/financeiro/" src/components/ tests/e2e/financeiro.spec.ts
git commit -m "Acrescenta a tela de prestacoes, com fechamento e download"
```

---

## Tarefa 16: Contribuições — a proposta e a ficha

**Arquivos:**
- Criar: `src/app/(app)/financeiro/contribuicoes/page.tsx`
- Modificar: `src/app/(app)/residentes/[id]/page.tsx`,
  `src/app/(app)/residentes/acoes.ts`, `src/components/formularios-ficha.tsx`

- [ ] **Passo 1: Escrever o E2E que falha**

Acrescentar um teste que define a contribuição de um residente pela ficha
(percentual e base), abre `/financeiro/contribuicoes` na competência, confere o
valor calculado, confirma o lançamento, e vê a linha passar a "já lançado".

- [ ] **Passo 2: Rodar e ver falhar**

Esperado: FALHA — não existe a seção de contribuição na ficha.

- [ ] **Passo 3: Escrever as duas telas**

Na ficha do residente, uma seção "Contribuição" com a vigente e o formulário
para definir outra — visível para COORDENACAO e ADMINISTRATIVO, escondida do
SAUDE, e barrada pelo serviço de qualquer forma.

Em `/financeiro/contribuicoes`, a proposta do mês: residente, percentual, base,
valor calculado, e um botão por linha que cria o lançamento. Quem já foi
lançado aparece marcado, sem botão.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: PASSA.

- [ ] **Passo 5: Commitar**

```bash
git add "src/app/(app)/" src/components/ tests/e2e/financeiro.spec.ts
git commit -m "Acrescenta a contribuicao na ficha e a proposta mensal"
```

---

## Tarefa 17: O perfil SAUDE recusado, o CSV do contador e a documentação

**Arquivos:**
- Modificar: `tests/e2e/saude.spec.ts`
- Criar: `src/modules/financeiro/csv-lancamentos.ts` e o seu teste
- Modificar: `src/app/api/prestacoes/[id]/[formato]/route.ts` (formato `csv`)
- Modificar: `README.md`
- Criar: `docs/operacao/pendencias-fase-3.md`

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/e2e/saude.spec.ts`: `/financeiro` digitada na URL é recusada em
pt-BR, o item de menu não aparece, e a recusa vira linha `ACESSO_NEGADO` na
trilha — conferida por um segundo contexto com a sessão da coordenação, como
`administrativo.spec.ts` já faz.

Em `src/modules/financeiro/csv-lancamentos.test.ts`:

```ts
describe('gerarCsvLancamentos', () => {
  it('escreve cabeçalho e uma linha por lançamento, com ponto e vírgula', async () => {
    // Ponto e vírgula, e não vírgula: o Excel em português usa a vírgula como
    // separador decimal, e um CSV com vírgula abre tudo numa coluna só.
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: origem.id,
      descricao: 'Doação', valor: 1234.56, data: new Date('2026-08-10'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })
    const linhas = csv.trim().split('\n')

    expect(linhas[0]).toContain('Data;Natureza;Descrição')
    expect(linhas[1]).toContain('10/08/2026')
    expect(linhas[1]).toContain('1234,56')
  })

  it('escapa o ponto e vírgula que aparecer na descrição', async () => {
    const { ctx, conta, origem } = await cenario()
    await lancarReceita(ctx, {
      contaBancariaId: conta.id, origemReceitaId: origem.id,
      descricao: 'Doação; com ponto e vírgula', valor: 100, data: new Date('2026-08-10'),
    })

    const csv = await gerarCsvLancamentos(ctx, { contaBancariaId: conta.id })
    expect(csv).toContain('"Doação; com ponto e vírgula"')
  })

  it('nega ao papel SAUDE', async () => {
    const ctx = await ctxComPapel('SAUDE')
    await expect(gerarCsvLancamentos(ctx, {})).rejects.toThrow(ErroPermissao)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar, depois passar**

Rodar: `npm test && npx playwright test`

- [ ] **Passo 3: Atualizar a documentação**

- `README.md`: a lista de módulos ganha o financeiro; a nota de que o `.xlsx` é
  o que vai ao órgão e o PDF serve ao arquivo interno; e o procedimento de
  regerar o layout.
- `docs/operacao/implantacao.md`: um passo novo — cadastrar os dados da
  instituição e as contas bancárias antes da primeira prestação, porque a
  exportação recusa sem eles.
- `docs/operacao/pendencias-fase-3.md`, no formato dos anteriores: entram as
  três questões da §13 da spec — a fidelidade do `.xlsx` que só se confirma
  abrindo os dois lado a lado, o PDF que não é pixel a pixel igual, e as
  categorias de despesa como lista aberta — mais o que surgir na execução.

- [ ] **Passo 4: Verificação final e commit**

```bash
npx tsc --noEmit && npx eslint && npm test && npx playwright test
git add -A
git commit -m "Fecha a Fase 3 com o CSV do contador e a fronteira do SAUDE"
```

---

## Ordem e dependências

```
1 (schema) ──┬── 2 (instituição, contas) ──┐
             ├── 3 (cadastros) ────────────┼── 4 (lançamentos) ──┬── 5 (contribuições) ──┐
             │                             │                     │                       │
             └─────────────────────────────┴── 6 (prestação) ── 7 (fechar) ── 8 (documento)
                                                                                  │
                              9 (layout) ──┬── 10 (xlsx) ──┐                      │
                                           └── 11 (pdf) ───┴── 12 (download) ─────┘
                                                                    │
                                          13 (lançamentos) ── 14 (cadastros) ── 15 (prestações) ── 16 (contribuições) ── 17
```

A Tarefa 9 (extração do layout) só depende da 1, e pode sair cedo — ela é a
única que toca no arquivo do órgão, e descobrir cedo que algo não extrai vale
mais que descobrir tarde. As telas (13-16) dependem de tudo o que exibem. A 17
é a última.
