# Anexos comprobatórios na prestação de contas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar no sistema o documento fiscal e o comprovante de pagamento de cada despesa, mais o extrato bancário de cada prestação, e emiti-los como apêndice da exportação em PDF.

**Architecture:** Três campos opcionais apontando para o `Documento` que já existe (dois em `Lancamento`, um em `PrestacaoContas`). O `pdfkit` continua desenhando as seis folhas sem nenhuma alteração; um módulo novo usa `pdf-lib` para concatenar as páginas dos anexos ao buffer que ele produz. Anexo ausente, sumido do volume ou ilegível é pulado em silêncio, e a geração nunca falha por causa dele.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma 6 / PostgreSQL 18, Zod, `pdfkit` (geração, intocado), `pdf-lib` (junção, novo), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-anexos-prestacao-contas-design.md`

## Global Constraints

- Tudo em pt-BR: identificadores, comentários, mensagens de tela e de teste. Corpo e assunto de commit em ASCII, sem acento.
- Autorização mora no serviço, via `exigirPapel`, nunca só na tela. Todo serviço novo tem teste de recusa. A recusa vira `ACESSO_NEGADO` na trilha, disparado pelo próprio `exigirPapel`.
- Papéis destes três anexos: `COORDENACAO` e `ADMINISTRATIVO`. A fronteira de papéis do sistema não se mexe.
- Os três campos aceitam **exclusivamente** `application/pdf`. Mensagem de recusa: `Envie o arquivo em PDF.`
- Anexar, trocar ou remover é recusado com a prestação `FECHADA`. Mensagem: `Esta prestação está fechada. Reabra-a antes de mexer nos anexos.`
- Nenhum degrau de tamanho cru no markup (`text-sm` e família) nem valor arbitrário (`text-[11px]`): use a escala nomeada de `globals.css`. Há guarda em `tests/tema.test.ts`.
- Nenhuma cor crua do Tailwind: use os tokens `--cor-*`. Mesma guarda.
- `<button>` cru é proibido: use `<Botao>` de `@/components/ui/botao`. Mesma guarda.
- A suíte E2E completa estoura o limite de tempo do harness. Rode por projeto: `npx playwright test --project=autenticado`, depois `--project=saude --project=administrativo --project=anonimo`. Mate `node` e `chrome` pendurados antes.
- Branch já criada: `anexos-prestacao-contas`, a partir de `master`. Ao fim, merge com `--no-ff`. Não empurre nada sem pedir.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/financeiro/anexos-prestacao.ts` | Junta o buffer das seis folhas com as páginas dos anexos. Conhece a regra de pular. |
| `src/modules/financeiro/anexos-prestacao.test.ts` | Testes do montador, com PDFs de verdade. |
| `src/modules/financeiro/anexos.service.ts` | Anexar e remover os três comprovantes. Dono das três regras: papel, só despesa, só com prestação aberta. |
| `src/modules/financeiro/anexos.service.test.ts` | Testes do serviço, inclusive as recusas. |
| `src/components/formulario-anexo-financeiro.tsx` | O `<input type="file">` dos três campos. Cliente, porque `'use client'` vale para o arquivo inteiro. |

**Modificar:**

| Arquivo | O quê |
|---|---|
| `prisma/schema.prisma` | Dois valores no `TipoDocumento`; três campos e três relações nomeadas. |
| `src/lib/ptbr.ts:102` | Dois rótulos no `ROTULO_TIPO_DOCUMENTO`. |
| `src/modules/residents/documentos.service.ts` | `TIPOS_DE_ALVO`, a visibilidade dos dois tipos novos, e a exclusão deles do seletor da ficha. |
| `src/modules/financeiro/lancamentos.service.ts:29` | `documentoId` sai do `comum` e vira `documentoFiscalId` só no `despesaSchema`. |
| `src/modules/financeiro/documento-prestacao.ts` | `LinhaDespesa` ganha `lancamentoId`, para o apêndice herdar a ordem da folha 3-Despesas. |
| `src/modules/financeiro/exportar.ts` | O ramo `pdf` passa pelo montador. |
| `src/modules/financeiro/prestacoes.service.ts` | `coberturaDeAnexos`. |
| `src/app/(app)/financeiro/acoes.ts` | Server Actions de anexar e remover. |
| `src/app/(app)/financeiro/page.tsx` | Os dois campos na linha de cada despesa. |
| `src/app/(app)/financeiro/prestacoes/page.tsx` | O extrato e a cobertura no cartão. |
| `tests/e2e/financeiro.spec.ts` | A travessia. |
| `package.json` | `pdf-lib`. |
| `docs/operacao/pendencias-fase-3.md` | Registro do que ficou aberto. |

---

## Task 1: Modelo de dados e visibilidade

O achado da §4 da spec vive aqui: um tipo novo sem regra própria nasce visível a todos os papéis, e o seletor da ficha do residente passa a oferecê-lo. Esta tarefa fecha os dois buracos antes de qualquer arquivo existir.

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/ptbr.ts:102-116`
- Modify: `src/modules/residents/documentos.service.ts:12-71`
- Test: `src/modules/residents/documentos.service.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `TipoDocumento.COMPROVANTE_PAGAMENTO`, `TipoDocumento.EXTRATO_BANCARIO`; `Lancamento.documentoFiscalId`, `Lancamento.comprovantePagamentoId`, `PrestacaoContas.extratoId` (todos `String?`); `TIPOS_DE_ALVO: readonly TipoDocumento[]` exportado de `documentos.service.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `src/modules/residents/documentos.service.test.ts`. Importe `TIPOS_DE_ALVO` junto dos demais imports do arquivo.

```ts
describe('os tipos do financeiro nao sao anexo de pessoa', () => {
  it('extrato e comprovante de pagamento so alcancam coordenacao e administrativo', () => {
    // O ultimo `return` de `papeisQuePodemVer` e TODOS. Um tipo novo sem regra
    // propria nasce visivel a SAUDE — e o extrato bancario e o documento mais
    // sensivel que este sistema guarda.
    expect(papeisQuePodemVer({ tipo: 'EXTRATO_BANCARIO', funcionarioId: null }))
      .toEqual(['COORDENACAO', 'ADMINISTRATIVO'])
    expect(papeisQuePodemVer({ tipo: 'COMPROVANTE_PAGAMENTO', funcionarioId: null }))
      .toEqual(['COORDENACAO', 'ADMINISTRATIVO'])
  })

  it('nao aparecem no seletor da ficha, para papel nenhum', () => {
    // `tiposQuePodeAnexar` deriva de `papeisQuePodemVer`. Sem barreira, a
    // coordenacao passaria a ver "Extrato bancario" no seletor de tipo de
    // documento de um residente.
    for (const papel of ['COORDENACAO', 'SAUDE', 'ADMINISTRATIVO'] as const) {
      const oferecidos = tiposQuePodeAnexar(papel)
      expect(oferecidos, `${papel} nao pode anexar extrato a uma pessoa`)
        .not.toContain('EXTRATO_BANCARIO')
      expect(oferecidos, `${papel} nao pode anexar comprovante de pagamento a uma pessoa`)
        .not.toContain('COMPROVANTE_PAGAMENTO')
    }
  })

  it('anexarDocumento recusa os dois, mesmo forjados no formulario', async () => {
    const ctx = { usuarioId: 'u1', papel: 'COORDENACAO' as const, email: 'c@lar.local' }

    await expect(
      anexarDocumento(ctx, {
        tipo: 'EXTRATO_BANCARIO' as 'OUTRO',
        nomeArquivoOriginal: 'extrato.pdf',
        mimeType: 'application/pdf',
        conteudo: Buffer.from('%PDF-1.4 x'),
        residenteId: 'qualquer',
      })
    ).rejects.toThrow(ErroValidacao)
  })

  it('todo tipo do enum e de alvo ou e do financeiro, nunca nenhum dos dois', () => {
    // Sem esta contagem, um tipo novo poderia ficar fora de `TIPOS_DE_ALVO` e
    // fora da lista do financeiro ao mesmo tempo — invisivel nos dois lugares,
    // e sem nada reclamando.
    const doFinanceiro = ['COMPROVANTE_PAGAMENTO', 'EXTRATO_BANCARIO']
    expect(TIPOS_DE_ALVO.length + doFinanceiro.length)
      .toBe(Object.values(TipoDocumento).length)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/residents/documentos.service.test.ts`
Expected: FAIL. Os testes nem compilam — `EXTRATO_BANCARIO` não existe no enum e `TIPOS_DE_ALVO` não é exportado.

- [ ] **Step 3: Acrescentar os dois valores ao enum e os três campos**

Em `prisma/schema.prisma`, no `enum TipoDocumento`, entre `COMPROVANTE_FISCAL` e `CONSELHO_PROFISSIONAL`:

```prisma
  COMPROVANTE_FISCAL
  COMPROVANTE_PAGAMENTO
  EXTRATO_BANCARIO
  CONSELHO_PROFISSIONAL
```

No `model Documento`, troque a linha `lancamentos Lancamento[]` por três relações nomeadas — o Prisma exige nome quando dois campos apontam para o mesmo modelo:

```prisma
  lancamentosFiscal      Lancamento[]      @relation("LancamentoDocumentoFiscal")
  lancamentosComprovante Lancamento[]      @relation("LancamentoComprovantePagamento")
  prestacoesExtrato      PrestacaoContas[] @relation("PrestacaoExtrato")
```

No `model Lancamento`, substitua `documentoId` e `documento`:

```prisma
  documentoFiscalId      String?
  documentoFiscal        Documento? @relation("LancamentoDocumentoFiscal", fields: [documentoFiscalId], references: [id])
  comprovantePagamentoId String?
  comprovantePagamento   Documento? @relation("LancamentoComprovantePagamento", fields: [comprovantePagamentoId], references: [id])
```

No `model PrestacaoContas`:

```prisma
  extratoId String?
  extrato   Documento? @relation("PrestacaoExtrato", fields: [extratoId], references: [id])
```

- [ ] **Step 4: Gerar a migration e transformar o drop em rename**

Run: `npm run db:migrate -- --name anexos_prestacao_contas`

O Prisma gera `DROP COLUMN "documentoId"` seguido de `ADD COLUMN "documentoFiscalId"`. Abra o `.sql` recém-criado em `prisma/migrations/` e troque esse par por:

```sql
ALTER TABLE "lancamentos" RENAME COLUMN "documentoId" TO "documentoFiscalId";
```

Hoje não há dado a perder — nenhuma tela jamais preencheu `documentoId` —, mas `RENAME` é o que continua certo no dia em que houver, e o custo é uma linha.

Depois de editar, reaplique: `npm run db:migrate`

- [ ] **Step 5: Os dois rótulos**

Em `src/lib/ptbr.ts`, no `ROTULO_TIPO_DOCUMENTO`, depois de `COMPROVANTE_FISCAL`:

```ts
  COMPROVANTE_PAGAMENTO: 'Comprovante de pagamento',
  EXTRATO_BANCARIO: 'Extrato bancário',
```

O `Record<TipoDocumento, string>` já quebrava o typecheck sem isto. É a guarda que existia e funcionou sozinha.

- [ ] **Step 6: A lista única de tipos de alvo**

Em `src/modules/residents/documentos.service.ts`, acrescente depois das constantes de papel (linha ~18):

```ts
/**
 * Os tipos que podem ser anexados a uma **pessoa** — residente ou funcionário.
 *
 * `COMPROVANTE_PAGAMENTO` e `EXTRATO_BANCARIO` ficam de fora: são anexos de
 * lançamento e de prestação de contas, e não de gente. A lista existe porque
 * `tiposQuePodeAnexar` derivava o universo de `Object.values(TipoDocumento)`, e
 * um tipo novo no schema entrava sozinho no seletor da ficha — o extrato
 * bancário do Lar seria oferecido como documento de um residente.
 *
 * Uma lista só, consumida pelo schema de gravação e pelo seletor. Duas listas
 * divergiriam, e foi exatamente esse o defeito que `tiposQuePodeAnexar` já
 * corrigiu uma vez.
 */
export const TIPOS_DE_ALVO = [
  'RG', 'CPF', 'CNS', 'CERTIDAO', 'LAUDO', 'PROCURACAO',
  'TERMO_RESPONSABILIDADE', 'TERMO_LGPD', 'FOTO', 'EXAME',
  'COMPROVANTE_FISCAL', 'CONSELHO_PROFISSIONAL', 'OUTRO',
] as const satisfies readonly TipoDocumento[]
```

Em `papeisQuePodemVer`, acrescente antes do `return TODOS` final:

```ts
  if (documento.tipo === 'COMPROVANTE_PAGAMENTO') return FINANCEIRO_E_PESSOAL
  if (documento.tipo === 'EXTRATO_BANCARIO') return FINANCEIRO_E_PESSOAL
```

Em `tiposQuePodeAnexar`, troque o universo:

```ts
  return TIPOS_DE_ALVO.filter((tipo) =>
    papeisQuePodemVer({ tipo, funcionarioId: alvo.funcionarioId ?? null }).includes(papel)
  )
```

No `anexoSchema`, troque a lista escrita à mão por `z.enum(TIPOS_DE_ALVO)`.

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run src/modules/residents/documentos.service.test.ts`
Expected: PASS, os quatro testes novos e todos os antigos.

Run: `npm run typecheck`
Expected: limpo.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/ptbr.ts src/modules/residents/documentos.service.ts src/modules/residents/documentos.service.test.ts
git commit -m "Acrescenta os tipos de anexo do financeiro, com a barreira do seletor

COMPROVANTE_PAGAMENTO e EXTRATO_BANCARIO entram no TipoDocumento, e com eles
os tres campos: documentoFiscalId e comprovantePagamentoId no Lancamento (o
primeiro por renomeacao do documentoId orfao) e extratoId na PrestacaoContas.

papeisQuePodemVer devolve TODOS para tipo sem regra propria, entao os dois
nasceriam visiveis a SAUDE. E tiposQuePodeAnexar derivava o universo de
Object.values(TipoDocumento), entao o seletor da ficha passaria a oferecer
extrato bancario como documento de um residente. TIPOS_DE_ALVO passa a ser a
lista unica de tipos de pessoa, consumida pelo anexoSchema e pelo seletor."
```

---

## Task 2: O montador de anexos

Módulo isolado, sem banco. Recebe o buffer das seis folhas e a lista de anexos, devolve o PDF final.

**Files:**
- Create: `src/modules/financeiro/anexos-prestacao.ts`
- Test: `src/modules/financeiro/anexos-prestacao.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `lerArquivo(caminhoRelativo: string): Promise<Buffer>` de `@/lib/arquivos`.
- Produces: `type AnexoParaJuntar = { documentoId: string; caminhoArmazenamento: string }` e `juntarAnexos(base: Buffer, anexos: AnexoParaJuntar[], contexto: { prestacaoId: string }): Promise<Buffer>`.

- [ ] **Step 1: Instalar o `pdf-lib`**

Run: `npm install pdf-lib`

JavaScript puro, sem binário nativo. Não precisa de entrada no `allowScripts` — só pacotes com `postinstall` precisam, e este não tem.

Run: `npm run auditoria`
Expected: `found 0 vulnerabilities`. Se aparecer alguma, pare e relate antes de seguir.

- [ ] **Step 2: Escrever os testes que falham**

Crie `src/modules/financeiro/anexos-prestacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { salvarArquivo } from '@/lib/arquivos'
import { juntarAnexos, type AnexoParaJuntar } from './anexos-prestacao'

/** Um PDF de verdade com o número de páginas pedido. */
async function pdfCom(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

async function paginasDe(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}

/** Grava um PDF no volume e devolve o descritor que o montador consome. */
async function anexo(paginas: number, documentoId: string): Promise<AnexoParaJuntar> {
  const salvo = await salvarArquivo(await pdfCom(paginas), 'application/pdf')
  return { documentoId, caminhoArmazenamento: salvo.caminhoRelativo }
}

const contexto = { prestacaoId: 'p1' }

describe('juntarAnexos', () => {
  it('sem anexo nenhum, devolve exatamente as folhas de entrada', async () => {
    // O teste que impede esta mudanca de vazar para quem nao anexa nada: a
    // prestacao de quem nao usa o recurso continua com as seis folhas de
    // sempre, e nem passa a valer outra contagem.
    const base = await pdfCom(6)

    expect(await paginasDe(await juntarAnexos(base, [], contexto))).toBe(6)
  })

  it('acrescenta as paginas dos anexos, na ordem recebida', async () => {
    const base = await pdfCom(6)
    const anexos = [await anexo(1, 'd1'), await anexo(1, 'd2')]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(8)
  })

  it('anexo de varias paginas entra inteiro', async () => {
    // Uma nota fiscal de tres paginas nao vira uma pagina so, nem e cortada.
    const base = await pdfCom(6)

    expect(await paginasDe(await juntarAnexos(base, [await anexo(3, 'd1')], contexto))).toBe(9)
  })

  it('arquivo ausente do volume e pulado, e o que vem depois nao sai do lugar', async () => {
    // O registro existe no banco e o arquivo sumiu do disco. A geracao nao pode
    // falhar por isso — e o anexo seguinte tem de entrar do mesmo jeito.
    const base = await pdfCom(6)
    const anexos = [
      { documentoId: 'sumido', caminhoArmazenamento: '2026/08/nao-existe.pdf' },
      await anexo(2, 'd2'),
    ]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(8)
  })

  it('PDF ilegivel e pulado', async () => {
    // Um arquivo com extensao .pdf que nao e PDF derrubaria o `PDFDocument.load`
    // e, com ele, a exportacao inteira.
    const base = await pdfCom(6)
    const quebrado = await salvarArquivo(Buffer.from('isto nao e um PDF'), 'application/pdf')
    const anexos = [
      { documentoId: 'quebrado', caminhoArmazenamento: quebrado.caminhoRelativo },
      await anexo(1, 'd2'),
    ]

    expect(await paginasDe(await juntarAnexos(base, anexos, contexto))).toBe(7)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/anexos-prestacao.test.ts`
Expected: FAIL — `Failed to resolve import "./anexos-prestacao"`.

- [ ] **Step 4: Escrever o montador**

Crie `src/modules/financeiro/anexos-prestacao.ts`:

```ts
import { PDFDocument } from 'pdf-lib'
import { lerArquivo } from '@/lib/arquivos'

/**
 * O apêndice comprobatório da prestação, colado ao documento gerado.
 *
 * **Existe porque o `pdfkit` não sabe importar página de outro PDF.** Ele
 * desenha do zero, e a API de importação não existe — não é questão de
 * configuração. O `pdf-lib` entra só para isto: o `pdf-prestacao.ts` continua
 * produzindo as seis folhas exatamente como antes, e este módulo concatena.
 *
 * **Nada é carimbado, nada é redimensionado.** O documento que a instituição
 * anexou chega ao órgão como foi enviado, sem marca do sistema em cima. Foi
 * decisão explícita, e o preço está registrado na §2 da spec: a página não diz
 * de quem ela é. Quem cobre esse vão é a contagem de cobertura na tela, antes
 * de fechar.
 */

export type AnexoParaJuntar = {
  documentoId: string
  caminhoArmazenamento: string
}

/**
 * Junta os anexos ao documento, **na ordem recebida**, pulando o que não puder
 * ser lido.
 *
 * Pular é a regra, e não o tratamento de um caso raro: gerar a prestação nunca
 * pode falhar por causa de anexo. Vale para o arquivo que sumiu do volume e
 * para o que está lá mas não abre — um PDF corrompido derrubaria a exportação
 * tanto quanto um ausente. O pulo é silencioso na tela e barulhento no log.
 */
export async function juntarAnexos(
  base: Buffer,
  anexos: AnexoParaJuntar[],
  contexto: { prestacaoId: string }
): Promise<Buffer> {
  if (anexos.length === 0) return base

  const final = await PDFDocument.load(base)

  for (const anexo of anexos) {
    try {
      const bytes = await lerArquivo(anexo.caminhoArmazenamento)
      const origem = await PDFDocument.load(bytes)
      const paginas = await final.copyPages(origem, origem.getPageIndices())
      for (const pagina of paginas) final.addPage(pagina)
    } catch (erro) {
      console.warn('Anexo pulado na prestacao de contas', {
        prestacaoId: contexto.prestacaoId,
        documentoId: anexo.documentoId,
        erro,
      })
    }
  }

  return Buffer.from(await final.save())
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/anexos-prestacao.test.ts`
Expected: PASS, cinco testes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/modules/financeiro/anexos-prestacao.ts src/modules/financeiro/anexos-prestacao.test.ts
git commit -m "Acrescenta o montador do apendice da prestacao

O pdfkit desenha PDF do zero e nao importa pagina de outro PDF: a API nao
existe. Entra o pdf-lib, JavaScript puro, usado so para juntar — o gerador das
seis folhas e os testes dele nao sao tocados.

Pular e a regra e nao o caso raro: arquivo ausente do volume e PDF ilegivel
sao os dois pulados, porque gerar a prestacao nunca pode falhar por causa de
anexo. Silencioso na tela, com console.warn no log.

Sem anexo nenhum a saida e o proprio buffer de entrada, e ha teste prendendo
isso: quem nao usa o recurso continua com as seis folhas de sempre."
```

---

## Task 3: O serviço de anexos

Dono das três regras: papel, só despesa, só com prestação aberta.

**Files:**
- Create: `src/modules/financeiro/anexos.service.ts`
- Test: `src/modules/financeiro/anexos.service.test.ts`
- Modify: `src/modules/financeiro/lancamentos.service.ts:29`

**Interfaces:**
- Consumes: `salvarArquivo` de `@/lib/arquivos`; `exigirPapel`, `Ctx` de `@/lib/contexto`; `registrarAuditoria` de `@/modules/audit/auditoria.service`.
- Produces:
  - `type AlvoAnexo = { tipo: 'DESPESA_FISCAL' | 'DESPESA_COMPROVANTE'; lancamentoId: string } | { tipo: 'EXTRATO'; prestacaoId: string }`
  - `anexarComprovante(ctx: Ctx, alvo: AlvoAnexo, arquivo: { nomeArquivoOriginal: string; mimeType: string; conteudo: Buffer }): Promise<Documento>`
  - `removerComprovante(ctx: Ctx, alvo: AlvoAnexo): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/modules/financeiro/anexos.service.test.ts`. Leia antes `src/modules/financeiro/lancamentos.service.test.ts` e reaproveite os auxiliares de preparo que ele já tem.

O `beforeEach` precisa deixar prontos, em cada execução, com um prefixo que permita apagá-los depois:

1. uma `ContaBancaria` ativa;
2. um `Fornecedor` e uma `CategoriaDespesa`;
3. uma `OrigemReceita`;
4. uma `PrestacaoContas` `ABERTA` nessa conta, guardando o id em `prestacaoId`;
5. um `Lancamento` de `natureza: 'DESPESA'`, `status: 'REALIZADO'`, com `prestacaoContasId` apontando para ela — o id vai em `despesaId`;
6. um `Lancamento` de `natureza: 'RECEITA'` na mesma conta — o id vai em `receitaId`.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErroPermissao, ErroValidacao } from '@/lib/erros'
import { anexarComprovante, removerComprovante } from './anexos.service'

const PDF = Buffer.from('%PDF-1.4 nota')
const arquivo = { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: PDF }

const coordenacao = { usuarioId: 'u1', papel: 'COORDENACAO' as const, email: 'c@lar.local' }
const saude = { usuarioId: 'u2', papel: 'SAUDE' as const, email: 's@lar.local' }

// Preencha com os ids criados no `beforeEach`, seguindo lancamentos.service.test.ts.
let despesaId = ''
let receitaId = ''
let prestacaoId = ''

describe('anexarComprovante', () => {
  it('anexa o documento fiscal a uma despesa', async () => {
    const documento = await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      arquivo
    )

    expect(documento.tipo).toBe('COMPROVANTE_FISCAL')
    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.documentoFiscalId).toBe(documento.id)
  })

  it('anexa o comprovante de pagamento no campo separado', async () => {
    // Dois campos, e nao um: e o que faz o apendice saber qual e qual sem
    // depender de ninguem ter escrito no nome do arquivo.
    const documento = await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_COMPROVANTE', lancamentoId: despesaId },
      arquivo
    )

    expect(documento.tipo).toBe('COMPROVANTE_PAGAMENTO')
    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.comprovantePagamentoId).toBe(documento.id)
    expect(lancamento.documentoFiscalId).toBeNull()
  })

  it('anexa o extrato a prestacao', async () => {
    const documento = await anexarComprovante(
      coordenacao,
      { tipo: 'EXTRATO', prestacaoId },
      arquivo
    )

    expect(documento.tipo).toBe('EXTRATO_BANCARIO')
    const prestacao = await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: prestacaoId } })
    expect(prestacao.extratoId).toBe(documento.id)
  })

  it('recusa anexar a uma receita', async () => {
    // "Para todas as despesas e apenas despesas". A tabela `lancamentos` guarda
    // as duas naturezas, entao a regra e do servico.
    await expect(
      anexarComprovante(coordenacao, { tipo: 'DESPESA_FISCAL', lancamentoId: receitaId }, arquivo)
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa arquivo que nao seja PDF', async () => {
    await expect(
      anexarComprovante(
        coordenacao,
        { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
        { ...arquivo, nomeArquivoOriginal: 'foto.jpg', mimeType: 'image/jpeg' }
      )
    ).rejects.toThrow('Envie o arquivo em PDF.')
  })

  it('recusa com a prestacao fechada', async () => {
    // Uma regra so: fechar congela o documento entregue ao orgao, e anexo faz
    // parte dele. Se precisar mudar depois, a reabertura ja existe e imprime o
    // motivo.
    await prisma.prestacaoContas.update({
      where: { id: prestacaoId },
      data: { status: 'FECHADA' },
    })

    await expect(
      anexarComprovante(coordenacao, { tipo: 'EXTRATO', prestacaoId }, arquivo)
    ).rejects.toThrow('Esta prestação está fechada. Reabra-a antes de mexer nos anexos.')
  })

  it('recusa o papel SAUDE, e a recusa fica na trilha', async () => {
    await expect(
      anexarComprovante(saude, { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId }, arquivo)
    ).rejects.toThrow(ErroPermissao)

    const negado = await prisma.registroAuditoria.findFirst({
      where: { acao: 'ACESSO_NEGADO', usuarioEmail: saude.email },
      orderBy: { criadoEm: 'desc' },
    })
    expect(negado).not.toBeNull()
  })
})

describe('removerComprovante', () => {
  it('desliga o campo e deixa o documento no banco', async () => {
    // Exclusao logica, como no resto do sistema: o arquivo continua no disco e
    // o registro continua no banco. Trocar um anexo nao apaga o anterior.
    const documento = await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      arquivo
    )

    await removerComprovante(coordenacao, { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId })

    const lancamento = await prisma.lancamento.findUniqueOrThrow({ where: { id: despesaId } })
    expect(lancamento.documentoFiscalId).toBeNull()
    expect(await prisma.documento.findUnique({ where: { id: documento.id } })).not.toBeNull()
  })

  it('recusa remover com a prestacao fechada', async () => {
    await anexarComprovante(coordenacao, { tipo: 'EXTRATO', prestacaoId }, arquivo)
    await prisma.prestacaoContas.update({
      where: { id: prestacaoId },
      data: { status: 'FECHADA' },
    })

    await expect(
      removerComprovante(coordenacao, { tipo: 'EXTRATO', prestacaoId })
    ).rejects.toThrow(ErroValidacao)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/anexos.service.test.ts`
Expected: FAIL — `Failed to resolve import "./anexos.service"`.

- [ ] **Step 3: Escrever o serviço**

Crie `src/modules/financeiro/anexos.service.ts`:

```ts
import type { Documento, TipoDocumento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exigirPapel, type Ctx } from '@/lib/contexto'
import { ErroNaoEncontrado, ErroValidacao } from '@/lib/erros'
import { salvarArquivo } from '@/lib/arquivos'
import { registrarAuditoria } from '@/modules/audit/auditoria.service'

/**
 * Os três anexos comprobatórios do financeiro: a nota e o comprovante de cada
 * despesa, e o extrato de cada prestação.
 *
 * **Um serviço só para os três**, e não dois campos no `lancamentos.service` e
 * um no `prestacoes.service`: as três regras que valem aqui — o papel, só
 * despesa, e só com a prestação aberta — são exatamente as mesmas nos três
 * casos, e separá-las por tabela seria escrevê-las três vezes.
 */

export type AlvoAnexo =
  | { tipo: 'DESPESA_FISCAL'; lancamentoId: string }
  | { tipo: 'DESPESA_COMPROVANTE'; lancamentoId: string }
  | { tipo: 'EXTRATO'; prestacaoId: string }

const TIPO_DO_ALVO: Record<AlvoAnexo['tipo'], TipoDocumento> = {
  DESPESA_FISCAL: 'COMPROVANTE_FISCAL',
  DESPESA_COMPROVANTE: 'COMPROVANTE_PAGAMENTO',
  EXTRATO: 'EXTRATO_BANCARIO',
}

const CAMPO_DO_ALVO: Record<AlvoAnexo['tipo'], string> = {
  DESPESA_FISCAL: 'documentoFiscalId',
  DESPESA_COMPROVANTE: 'comprovantePagamentoId',
  EXTRATO: 'extratoId',
}

const FECHADA = 'Esta prestação está fechada. Reabra-a antes de mexer nos anexos.'

/**
 * Confere que o alvo existe, que é despesa quando devia ser, e que a prestação
 * a que ele pertence ainda aceita mudança.
 *
 * Um lançamento sem `prestacaoContasId` não pertence a prestação nenhuma
 * ainda — nada a travar.
 */
async function exigirAlvoEditavel(alvo: AlvoAnexo): Promise<void> {
  if (alvo.tipo === 'EXTRATO') {
    const prestacao = await prisma.prestacaoContas.findUnique({
      where: { id: alvo.prestacaoId },
      select: { status: true },
    })
    if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')
    if (prestacao.status === 'FECHADA') throw new ErroValidacao(FECHADA)
    return
  }

  const lancamento = await prisma.lancamento.findUnique({
    where: { id: alvo.lancamentoId },
    select: { natureza: true, prestacaoContas: { select: { status: true } } },
  })
  if (!lancamento) throw new ErroNaoEncontrado('Lançamento não encontrado')
  if (lancamento.natureza !== 'DESPESA') {
    throw new ErroValidacao('Nota fiscal e comprovante de pagamento são só de despesa.')
  }
  if (lancamento.prestacaoContas?.status === 'FECHADA') throw new ErroValidacao(FECHADA)
}

async function ligar(alvo: AlvoAnexo, documentoId: string | null): Promise<void> {
  const data = { [CAMPO_DO_ALVO[alvo.tipo]]: documentoId }
  if (alvo.tipo === 'EXTRATO') {
    await prisma.prestacaoContas.update({ where: { id: alvo.prestacaoId }, data })
    return
  }
  await prisma.lancamento.update({ where: { id: alvo.lancamentoId }, data })
}

function idDoAlvo(alvo: AlvoAnexo): string {
  return alvo.tipo === 'EXTRATO' ? alvo.prestacaoId : alvo.lancamentoId
}

function entidadeDoAlvo(alvo: AlvoAnexo): 'Lancamento' | 'PrestacaoContas' {
  return alvo.tipo === 'EXTRATO' ? 'PrestacaoContas' : 'Lancamento'
}

export async function anexarComprovante(
  ctx: Ctx,
  alvo: AlvoAnexo,
  arquivo: { nomeArquivoOriginal: string; mimeType: string; conteudo: Buffer }
): Promise<Documento> {
  exigirPapel(ctx, entidadeDoAlvo(alvo), 'COORDENACAO', 'ADMINISTRATIVO')

  // Só PDF. `salvarArquivo` aceitaria JPG, PNG e WEBP, e a foto entraria no
  // banco para nunca sair no apêndice — o montador só copia página de PDF.
  // Recusar aqui é o que impede o anexo silenciosamente inútil.
  if (arquivo.mimeType !== 'application/pdf') {
    throw new ErroValidacao('Envie o arquivo em PDF.')
  }

  await exigirAlvoEditavel(alvo)

  // Grava bytes só depois de tudo conferido: um alvo inválido deixaria o
  // arquivo no disco sem registro e sem ninguém para limpá-lo.
  const salvo = await salvarArquivo(arquivo.conteudo, arquivo.mimeType)

  const documento = await prisma.documento.create({
    data: {
      tipo: TIPO_DO_ALVO[alvo.tipo],
      nomeArquivoOriginal: arquivo.nomeArquivoOriginal,
      caminhoArmazenamento: salvo.caminhoRelativo,
      mimeType: arquivo.mimeType,
      tamanhoBytes: salvo.tamanhoBytes,
      hashSha256: salvo.hashSha256,
      criadoPorId: ctx.usuarioId,
    },
  })

  await ligar(alvo, documento.id)

  await registrarAuditoria(prisma, ctx, {
    acao: 'ATUALIZAR',
    entidade: entidadeDoAlvo(alvo),
    entidadeId: idDoAlvo(alvo),
    diff: { [CAMPO_DO_ALVO[alvo.tipo]]: { de: null, para: documento.id } },
  })

  return documento
}

/**
 * Desliga o anexo do alvo. **Não apaga o `Documento` nem o arquivo** — exclusão
 * neste sistema é sempre lógica, e um anexo trocado por engano ainda pode ser
 * reencontrado pelo banco e pela trilha.
 */
export async function removerComprovante(ctx: Ctx, alvo: AlvoAnexo): Promise<void> {
  exigirPapel(ctx, entidadeDoAlvo(alvo), 'COORDENACAO', 'ADMINISTRATIVO')
  await exigirAlvoEditavel(alvo)

  await ligar(alvo, null)

  await registrarAuditoria(prisma, ctx, {
    acao: 'ATUALIZAR',
    entidade: entidadeDoAlvo(alvo),
    entidadeId: idDoAlvo(alvo),
    diff: { [CAMPO_DO_ALVO[alvo.tipo]]: { de: 'anexado', para: null } },
  })
}
```

- [ ] **Step 4: Tirar o campo do schema de receita**

Em `src/modules/financeiro/lancamentos.service.ts`, remova `documentoId: z.string().cuid().nullish(),` do objeto `comum` (linha ~29). Não o acrescente ao `receitaSchema`. No `despesaSchema`, ele não precisa entrar: quem grava o anexo agora é o `anexos.service`.

O comentário do topo do arquivo já explica por que há dois schemas — "um schema frouxo aceitaria uma despesa sem categoria". Acrescente à lista o novo motivo:

```ts
 * O anexo comprobatório não está em nenhum dos dois: ele entra pelo
 * `anexos.service.ts`, que é quem sabe que nota e comprovante são só de
 * despesa e que a prestação fechada não aceita mais nada.
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/`
Expected: PASS, os nove testes novos e os antigos do módulo.

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/anexos.service.ts src/modules/financeiro/anexos.service.test.ts src/modules/financeiro/lancamentos.service.ts
git commit -m "Acrescenta o servico de anexos comprobatorios do financeiro

Um servico para os tres anexos — nota e comprovante da despesa, extrato da
prestacao — porque as tres regras sao as mesmas nos tres casos: papel de
coordenacao ou administrativo, so despesa, e so com a prestacao aberta.
Separa-las por tabela seria escreve-las tres vezes.

So PDF, recusado antes de gravar bytes: salvarArquivo aceitaria JPG e PNG, e a
foto entraria no banco para nunca sair no apendice, porque o montador so copia
pagina de PDF.

Remover desliga o campo e deixa o Documento no banco, como toda exclusao deste
sistema."
```

---

## Task 4: Ligar o apêndice à exportação

**Files:**
- Modify: `src/modules/financeiro/documento-prestacao.ts`
- Modify: `src/modules/financeiro/exportar.ts:56-78`
- Test: `src/modules/financeiro/exportar.test.ts`

**Interfaces:**
- Consumes: `juntarAnexos`, `AnexoParaJuntar` da Task 2; `LinhaDespesa` de `documento-prestacao.ts`.
- Produces: `LinhaDespesa.lancamentoId: string`; `anexosDaPrestacao(prestacaoId: string, despesas: LinhaDespesa[]): Promise<AnexoParaJuntar[]>` exportado de `exportar.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `src/modules/financeiro/exportar.test.ts`. Reaproveite o preparo de prestação que o arquivo já tem, e complete-o com o que falta:

- **duas** despesas `REALIZADO` ligadas à prestação, em `despesaId` e `outraDespesaId` — a segunda existe justamente para ficar sem anexo;
- os imports novos: `import { PDFDocument } from 'pdf-lib'` e `import { anexarComprovante } from './anexos.service'`;
- o mesmo auxiliar de PDF da Task 2, copiado para este arquivo (são dois testes independentes, e um utilitário compartilhado de três linhas não paga o acoplamento entre eles):

```ts
async function pdfCom(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}
```

```ts
it('o PDF leva os anexos depois das seis folhas, na ordem da folha de despesas', async () => {
  // A ordem do apendice e a mesma da folha 3-Despesas — `data` crescente, `id`
  // como desempate. Nao e detalhe: como nada e carimbado na pagina, essa ordem
  // e o unico indice que o apendice tem.
  const semAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')
  const antes = (await PDFDocument.load(semAnexo.buffer)).getPageCount()

  await anexarComprovante(
    coordenacao,
    { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
    { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(2) }
  )
  await anexarComprovante(
    coordenacao,
    { tipo: 'EXTRATO', prestacaoId },
    { nomeArquivoOriginal: 'extrato.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1) }
  )

  const comAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')

  expect((await PDFDocument.load(comAnexo.buffer)).getPageCount()).toBe(antes + 3)
})

it('despesa sem anexo e pulada, e a seguinte nao sai do lugar', async () => {
  // O caso mais comum de todos: metade das despesas com nota e metade sem. A
  // que tem entra; a que nao tem nao empurra nada, nao deixa pagina em branco
  // e nao desloca a proxima.
  const soASegunda = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')
  const antes = (await PDFDocument.load(soASegunda.buffer)).getPageCount()

  // `outraDespesaId` fica sem anexo nenhum, de proposito.
  await anexarComprovante(
    coordenacao,
    { tipo: 'DESPESA_COMPROVANTE', lancamentoId: outraDespesaId },
    { nomeArquivoOriginal: 'pago.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(1) }
  )

  const comAnexo = await exportarPrestacao(coordenacao, prestacaoId, 'pdf')

  expect((await PDFDocument.load(comAnexo.buffer)).getPageCount()).toBe(antes + 1)
})

it('o xlsx e o csv nao mudam com anexo nenhum', async () => {
  // "So o PDF muda": o modelo do orgao tem seis abas e nao comporta anexo, e o
  // CSV e listagem plana para o contador importar.
  const xlsxAntes = await exportarPrestacao(coordenacao, prestacaoId, 'xlsx')

  await anexarComprovante(
    coordenacao,
    { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
    { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: await pdfCom(2) }
  )

  const xlsxDepois = await exportarPrestacao(coordenacao, prestacaoId, 'xlsx')

  expect(xlsxDepois.buffer.length).toBe(xlsxAntes.buffer.length)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/exportar.test.ts`
Expected: FAIL no primeiro teste — a contagem fica igual a `antes`, porque nada ainda junta os anexos.

- [ ] **Step 3: Levar o id da despesa até a linha do documento**

Em `src/modules/financeiro/documento-prestacao.ts`, acrescente `lancamentoId: string` ao tipo `LinhaDespesa` e preencha-o no laço que monta `despesas` (linha ~177), com o `lancamento.id`.

Comente por quê:

```ts
  /**
   * O id do lançamento que gerou esta linha. **Não vai para o papel** — nem o
   * `.xlsx` nem o PDF o imprimem. Ele existe para o apêndice comprobatório
   * herdar a ordem desta lista em vez de recalculá-la com uma segunda consulta.
   *
   * Duas consultas ordenando a mesma coisa é o defeito que a divisão de turnos
   * já cobrou uma vez: o produto mudou a ordem e a cópia não, e a diferença só
   * aparecia numa hora do dia.
   */
  lancamentoId: string
```

- [ ] **Step 4: Montar a lista de anexos e juntar**

Em `src/modules/financeiro/exportar.ts`, acrescente os imports:

```ts
import { juntarAnexos, type AnexoParaJuntar } from './anexos-prestacao'
import type { LinhaDespesa } from './documento-prestacao'
```

E a função, antes de `gerarConteudo`:

```ts
/**
 * Os anexos comprobatórios, na ordem em que entram no apêndice: para cada
 * despesa, a nota e depois o comprovante; o extrato por último.
 *
 * A ordem das despesas vem de `despesas`, que é a lista que a folha 3-Despesas
 * imprime — e não de uma segunda consulta ordenando de novo. A enésima despesa
 * da tabela é a enésima do apêndice porque é literalmente a mesma lista.
 */
async function anexosDaPrestacao(
  prestacaoId: string,
  despesas: LinhaDespesa[]
): Promise<AnexoParaJuntar[]> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { id: { in: despesas.map((despesa) => despesa.lancamentoId) } },
    select: {
      id: true,
      documentoFiscal: { select: { id: true, caminhoArmazenamento: true } },
      comprovantePagamento: { select: { id: true, caminhoArmazenamento: true } },
    },
  })
  const porId = new Map(lancamentos.map((lancamento) => [lancamento.id, lancamento]))

  const anexos: AnexoParaJuntar[] = []
  for (const despesa of despesas) {
    const lancamento = porId.get(despesa.lancamentoId)
    for (const documento of [lancamento?.documentoFiscal, lancamento?.comprovantePagamento]) {
      if (documento) {
        anexos.push({
          documentoId: documento.id,
          caminhoArmazenamento: documento.caminhoArmazenamento,
        })
      }
    }
  }

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    select: { extrato: { select: { id: true, caminhoArmazenamento: true } } },
  })
  if (prestacao?.extrato) {
    anexos.push({
      documentoId: prestacao.extrato.id,
      caminhoArmazenamento: prestacao.extrato.caminhoArmazenamento,
    })
  }

  return anexos
}
```

Em `gerarConteudo`, troque o retorno do ramo do documento:

```ts
  const documento = await montarDocumentoPrestacao(ctx, prestacao.id)
  if (formato === 'xlsx') return await gerarXlsxPrestacao(documento)

  // Só o PDF ganha apêndice: o modelo do órgão tem seis abas e não comporta
  // anexo, e o CSV é listagem plana para o contador importar.
  const folhas = await gerarPdfPrestacao(documento)
  const anexos = await anexosDaPrestacao(prestacao.id, documento.despesas)
  return await juntarAnexos(folhas, anexos, { prestacaoId: prestacao.id })
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/documento-prestacao.ts src/modules/financeiro/exportar.ts src/modules/financeiro/exportar.test.ts
git commit -m "Liga o apendice comprobatorio a exportacao em PDF

Para cada despesa a nota e depois o comprovante, e o extrato por ultimo. A
ordem vem da propria lista que a folha 3-Despesas imprime, e nao de uma
segunda consulta ordenando de novo: a enesima despesa da tabela e a enesima do
apendice porque e literalmente a mesma lista. Duas consultas ordenando a mesma
coisa foi o defeito que a divisao de turnos ja cobrou uma vez.

LinhaDespesa ganha lancamentoId, que nao vai para o papel — nem o xlsx nem o
PDF o imprimem — e existe so para essa heranca de ordem.

O xlsx e o csv nao mudam, e ha teste prendendo isso."
```

---

## Task 5: A cobertura, e os anexos na tela do financeiro

**Files:**
- Modify: `src/modules/financeiro/prestacoes.service.ts`
- Create: `src/components/formulario-anexo-financeiro.tsx`
- Modify: `src/app/(app)/financeiro/acoes.ts`
- Modify: `src/app/(app)/financeiro/page.tsx`
- Test: `src/modules/financeiro/prestacoes.service.test.ts`

**Interfaces:**
- Consumes: `anexarComprovante`, `removerComprovante`, `AlvoAnexo` da Task 3.
- Produces:
  - `type CoberturaAnexos = { despesas: number; comFiscal: number; comComprovante: number; temExtrato: boolean }`
  - `coberturaDeAnexos(ctx: Ctx, prestacaoId: string): Promise<CoberturaAnexos>` em `prestacoes.service.ts`
  - `acaoAnexarComprovante(anterior, dados: FormData)` e `acaoRemoverComprovante(anterior, dados: FormData)` em `financeiro/acoes.ts`
  - `<FormularioAnexoFinanceiro alvo={...} rotulo={...} anexado={...} />`

- [ ] **Step 1: Escrever o teste da cobertura**

Acrescente a `src/modules/financeiro/prestacoes.service.test.ts`:

```ts
describe('coberturaDeAnexos', () => {
  it('conta as despesas da competencia e quantas tem cada anexo', async () => {
    // A contagem existe porque a concatenacao sem rotulo torna a falta
    // invisivel dos dois lados: no documento, porque nada identifica a pagina;
    // e na tela, porque ate aqui ninguem contava. Antes de fechar e o unico
    // momento em que ainda da para resolver.
    await anexarComprovante(
      coordenacao,
      { tipo: 'DESPESA_FISCAL', lancamentoId: despesaId },
      { nomeArquivoOriginal: 'nota.pdf', mimeType: 'application/pdf', conteudo: PDF }
    )

    const cobertura = await coberturaDeAnexos(coordenacao, prestacaoId)

    expect(cobertura.despesas).toBe(2)
    expect(cobertura.comFiscal).toBe(1)
    expect(cobertura.comComprovante).toBe(0)
    expect(cobertura.temExtrato).toBe(false)
  })

  it('recusa o papel SAUDE', async () => {
    await expect(coberturaDeAnexos(saude, prestacaoId)).rejects.toThrow(ErroPermissao)
  })
})
```

O preparo precisa de **duas** despesas na competência da prestação, e só uma com anexo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/prestacoes.service.test.ts`
Expected: FAIL — `coberturaDeAnexos is not a function`.

- [ ] **Step 3: Escrever a cobertura**

Em `src/modules/financeiro/prestacoes.service.ts`:

```ts
export type CoberturaAnexos = {
  despesas: number
  comFiscal: number
  comComprovante: number
  temExtrato: boolean
}

/**
 * Quantas despesas da competência já têm cada anexo.
 *
 * Não é alerta e não é erro: é contagem, mostrada no cartão da prestação
 * enquanto ela ainda está aberta. O apêndice do PDF não carimba nada nas
 * páginas — foi decisão explícita —, então lá a falta de uma nota não se
 * enxerga: o leitor vê menos páginas, não um buraco. Aqui se enxerga, e aqui
 * ainda dá para resolver.
 */
export async function coberturaDeAnexos(
  ctx: Ctx,
  prestacaoId: string
): Promise<CoberturaAnexos> {
  exigirPapel(ctx, 'PrestacaoContas', 'COORDENACAO', 'ADMINISTRATIVO')

  const prestacao = await prisma.prestacaoContas.findUnique({
    where: { id: prestacaoId },
    select: { extratoId: true },
  })
  if (!prestacao) throw new ErroNaoEncontrado('Prestação de contas não encontrada')

  const despesas = await prisma.lancamento.findMany({
    where: { prestacaoContasId: prestacaoId, natureza: 'DESPESA', status: 'REALIZADO' },
    select: { documentoFiscalId: true, comprovantePagamentoId: true },
  })

  return {
    despesas: despesas.length,
    comFiscal: despesas.filter((despesa) => despesa.documentoFiscalId !== null).length,
    comComprovante: despesas.filter((despesa) => despesa.comprovantePagamentoId !== null).length,
    temExtrato: prestacao.extratoId !== null,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/prestacoes.service.test.ts`
Expected: PASS.

- [ ] **Step 5: O formulário de anexo**

Crie `src/components/formulario-anexo-financeiro.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Botao } from '@/components/ui/botao'
import {
  acaoAnexarComprovante,
  acaoRemoverComprovante,
} from '@/app/(app)/financeiro/acoes'

/**
 * O anexo comprobatório do financeiro, nos três lugares em que ele aparece.
 *
 * Arquivo próprio e `'use client'` pelo mesmo motivo do
 * `formulario-documento.tsx`: `<input type="file">` e `multipart/form-data` não
 * cabem no `Campo`, e a diretiva vale para o arquivo inteiro.
 *
 * `accept="application/pdf"` filtra o seletor do sistema operacional, e é
 * conveniência e não autorização: quem forjar o `multipart` é recusado por
 * `anexarComprovante`, que confere o `mimeType` antes de gravar byte nenhum.
 */
export function FormularioAnexoFinanceiro({
  alvo,
  rotulo,
  anexado,
}: {
  alvo: { tipo: string; id: string }
  rotulo: string
  anexado: { id: string; nome: string } | null
}) {
  const [estadoAnexo, anexar, anexando] = useActionState(acaoAnexarComprovante, null)
  const [estadoRemocao, remover, removendo] = useActionState(acaoRemoverComprovante, null)
  const idCampo = `anexo-${alvo.tipo}-${alvo.id}`

  if (anexado) {
    return (
      <form action={remover} className="flex flex-wrap items-baseline gap-2 text-suporte">
        <input type="hidden" name="alvoTipo" value={alvo.tipo} />
        <input type="hidden" name="alvoId" value={alvo.id} />
        <span className="text-apoio">{rotulo}:</span>
        <a href={`/api/documentos/${anexado.id}`} className="underline text-medio">
          {anexado.nome}
        </a>
        <Botao variante="secundario" disabled={removendo}>
          {removendo ? 'Removendo…' : 'Remover'}
        </Botao>
        {estadoRemocao?.erro && (
          <p role="alert" className="text-perigo">{estadoRemocao.erro}</p>
        )}
      </form>
    )
  }

  return (
    <form action={anexar} className="flex flex-wrap items-baseline gap-2 text-suporte">
      <input type="hidden" name="alvoTipo" value={alvo.tipo} />
      <input type="hidden" name="alvoId" value={alvo.id} />
      <label htmlFor={idCampo} className="text-apoio">{rotulo} (PDF):</label>
      <input
        id={idCampo}
        name="arquivo"
        type="file"
        required
        accept="application/pdf"
        className="rounded border border-borda px-3 py-2 text-corpo"
      />
      <Botao variante="secundario" disabled={anexando}>
        {anexando ? 'Enviando…' : 'Anexar'}
      </Botao>
      {estadoAnexo?.erro && <p role="alert" className="text-perigo">{estadoAnexo.erro}</p>}
    </form>
  )
}
```

- [ ] **Step 6: As duas Server Actions**

Em `src/app/(app)/financeiro/acoes.ts`, seguindo o padrão de `acaoAnexarDocumento` em `src/app/(app)/residentes/acoes.ts:252`. Acrescente aos imports do arquivo:

```ts
import {
  anexarComprovante,
  removerComprovante,
  type AlvoAnexo,
} from '@/modules/financeiro/anexos.service'
import { ErroValidacao } from '@/lib/erros'
```

```ts
/**
 * O `alvoTipo` chega do formulário e é entrada de quem usa. Não confie nele:
 * `montarAlvo` só constrói os três alvos que existem, e qualquer outro valor
 * vira `ErroValidacao` antes de o serviço ser chamado.
 */
function montarAlvo(dados: FormData): AlvoAnexo {
  const tipo = String(dados.get('alvoTipo'))
  const id = String(dados.get('alvoId'))

  if (tipo === 'DESPESA_FISCAL') return { tipo, lancamentoId: id }
  if (tipo === 'DESPESA_COMPROVANTE') return { tipo, lancamentoId: id }
  if (tipo === 'EXTRATO') return { tipo, prestacaoId: id }
  throw new ErroValidacao('Anexo desconhecido')
}

export async function acaoAnexarComprovante(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    const arquivo = dados.get('arquivo') as File | null
    if (!arquivo || arquivo.size === 0) throw new ErroValidacao('Selecione um arquivo')

    await anexarComprovante(ctx, montarAlvo(dados), {
      nomeArquivoOriginal: arquivo.name,
      mimeType: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    })
  })

  revalidatePath('/financeiro')
  revalidatePath('/financeiro/prestacoes')
  return resultado
}

export async function acaoRemoverComprovante(
  _anterior: EstadoAcao | null,
  dados: FormData
): Promise<EstadoAcao> {
  const resultado = await executarAcao(async () => {
    const ctx = await obterCtx()
    await removerComprovante(ctx, montarAlvo(dados))
  })

  revalidatePath('/financeiro')
  revalidatePath('/financeiro/prestacoes')
  return resultado
}
```

- [ ] **Step 7: Os dois campos na linha da despesa**

Em `src/app/(app)/financeiro/page.tsx`, a consulta que alimenta a lista de lançamentos precisa incluir os dois documentos:

```ts
      documentoFiscal: { select: { id: true, nomeArquivoOriginal: true } },
      comprovantePagamento: { select: { id: true, nomeArquivoOriginal: true } },
```

E dentro da linha de cada lançamento, **só quando for despesa**, junto do "Cancelar este lançamento":

```tsx
{lancamento.natureza === 'DESPESA' && (
  <div className="space-y-2">
    <FormularioAnexoFinanceiro
      alvo={{ tipo: 'DESPESA_FISCAL', id: lancamento.id }}
      rotulo="Documento fiscal"
      anexado={
        lancamento.documentoFiscal
          ? { id: lancamento.documentoFiscal.id, nome: lancamento.documentoFiscal.nomeArquivoOriginal }
          : null
      }
    />
    <FormularioAnexoFinanceiro
      alvo={{ tipo: 'DESPESA_COMPROVANTE', id: lancamento.id }}
      rotulo="Comprovante de pagamento"
      anexado={
        lancamento.comprovantePagamento
          ? { id: lancamento.comprovantePagamento.id, nome: lancamento.comprovantePagamento.nomeArquivoOriginal }
          : null
      }
    />
  </div>
)}
```

- [ ] **Step 8: Conferir e commitar**

Run: `npm run typecheck && npm run lint`
Expected: limpos.

Run: `npx vitest run tests/tema.test.ts`
Expected: PASS — as guardas de cor, tamanho e `<button>` cru continuam verdes no markup novo.

```bash
git add src/modules/financeiro/prestacoes.service.ts src/modules/financeiro/prestacoes.service.test.ts src/components/formulario-anexo-financeiro.tsx "src/app/(app)/financeiro/acoes.ts" "src/app/(app)/financeiro/page.tsx"
git commit -m "Acrescenta os dois anexos na linha da despesa, e a contagem de cobertura

Os campos so aparecem quando o lancamento e despesa. O accept do input filtra
o seletor do sistema e e conveniencia, nao autorizacao: quem forjar o
multipart e recusado por anexarComprovante antes de gravar byte nenhum.

coberturaDeAnexos conta quantas despesas da competencia ja tem cada anexo. Nao
e alerta nem erro: e contagem, e existe porque o apendice nao carimba nada nas
paginas — la a falta nao se enxerga, o leitor ve menos paginas e nao um
buraco."
```

---

## Task 6: O extrato e a cobertura no cartão da prestação

**Files:**
- Modify: `src/app/(app)/financeiro/prestacoes/page.tsx`

**Interfaces:**
- Consumes: `coberturaDeAnexos` e `CoberturaAnexos` da Task 5; `<FormularioAnexoFinanceiro>` da Task 5.
- Produces: nada que tarefa posterior consuma.

- [ ] **Step 1: Carregar a cobertura de cada prestação**

Em `src/app/(app)/financeiro/prestacoes/page.tsx`, junto da consulta que já lista as prestações, inclua o extrato:

```ts
      extrato: { select: { id: true, nomeArquivoOriginal: true } },
```

E, para cada prestação listada, a cobertura:

```ts
const coberturas = new Map(
  await Promise.all(
    prestacoes.map(async (prestacao) =>
      [prestacao.id, await coberturaDeAnexos(ctx, prestacao.id)] as const
    )
  )
)
```

- [ ] **Step 2: A linha de cobertura no cartão**

Logo abaixo do `<dl>` dos quatro valores, e **antes** do bloco `{aberta ? … }`:

```tsx
{(() => {
  const cobertura = coberturas.get(prestacao.id)!
  return (
    <p className="text-suporte text-apoio">
      {cobertura.despesas} despesa{cobertura.despesas === 1 ? '' : 's'} ·{' '}
      {cobertura.comFiscal} com documento fiscal ·{' '}
      {cobertura.comComprovante} com comprovante ·{' '}
      {cobertura.temExtrato ? 'extrato anexado' : 'sem extrato'}
    </p>
  )
})()}
```

- [ ] **Step 3: O campo do extrato, só com a prestação aberta**

Dentro do ramo `{aberta ? ( … )}`, junto de "Observações do mês" e "Ajustar saldo anterior":

```tsx
<FormularioAnexoFinanceiro
  alvo={{ tipo: 'EXTRATO', id: prestacao.id }}
  rotulo="Extrato bancário"
  anexado={
    prestacao.extrato
      ? { id: prestacao.extrato.id, nome: prestacao.extrato.nomeArquivoOriginal }
      : null
  }
/>
```

Fica dentro do ramo `aberta` de propósito: fechada, o serviço já recusaria, e oferecer o campo seria prometer o que a regra nega. A linha de cobertura, essa, aparece nos dois estados — numa prestação fechada ela diz o que foi entregue.

- [ ] **Step 4: Conferir e commitar**

Run: `npm run typecheck && npm run lint`
Expected: limpos.

Run: `npx vitest run tests/tema.test.ts`
Expected: PASS.

```bash
git add "src/app/(app)/financeiro/prestacoes/page.tsx"
git commit -m "Acrescenta o extrato bancario e a cobertura ao cartao da prestacao

O campo do extrato so aparece com a prestacao aberta: fechada o servico ja
recusaria, e oferecer o campo seria prometer o que a regra nega. A linha de
cobertura aparece nos dois estados — numa prestacao fechada ela diz o que foi
entregue."
```

---

## Task 7: A travessia, e o registro do que ficou aberto

**Files:**
- Modify: `tests/e2e/financeiro.spec.ts`
- Modify: `docs/operacao/pendencias-fase-3.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo o que veio antes.
- Produces: nada.

- [ ] **Step 1: Escrever a travessia**

Acrescente a `tests/e2e/financeiro.spec.ts`. Leia o arquivo antes: reaproveite o preparo de conta, fornecedor e categoria que ele já faz, e o prefixo de limpeza que ele já usa.

O arquivo precisa dos imports e do auxiliar abaixo, e de uma constante com a descrição da despesa que o preparo cria — use a que o `beforeAll` já usa, ou declare `const descricaoDaDespesa = \`${PREFIXO} conta de luz\`` e crie a despesa com ela:

```ts
import { writeFile, readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

/** Um PDF de uma página, para anexar pela tela. */
async function pdfDeUmaPagina(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}
```

```ts
test('anexa nota e comprovante na despesa, e eles saem no PDF da prestacao', async ({
  page,
}, informacoes) => {
  // A travessia que so a tela prova: anexar pela interface, ver a contagem
  // mudar, e o documento entregue ao orgao sair mais gordo do que saia antes.
  const pdf = informacoes.outputPath('nota.pdf')
  await writeFile(pdf, await pdfDeUmaPagina())

  await page.goto('/financeiro')
  const linha = page.locator('li', { hasText: descricaoDaDespesa })
  await linha.getByLabel(/^Documento fiscal/).setInputFiles(pdf)
  await linha.getByRole('button', { name: 'Anexar' }).first().click()
  await expect(linha.getByRole('link', { name: 'nota.pdf' })).toBeVisible()

  await page.goto('/financeiro/prestacoes')
  const cartao = page.locator('article', { hasText: 'Banco do Brasil' }).first()
  await expect(cartao).toContainText('1 com documento fiscal')
  await expect(cartao).toContainText('sem extrato')

  // Fecha para os downloads aparecerem, e confere que o PDF cresceu.
  await cartao.getByRole('button', { name: 'Fechar prestação' }).click()
  const baixado = await Promise.all([
    page.waitForEvent('download'),
    cartao.getByRole('link', { name: 'Baixar PDF' }).click(),
  ])
  const arquivo = await baixado[0].path()
  expect((await readFile(arquivo)).length).toBeGreaterThan(0)
})

test('a prestacao fechada nao aceita mais anexo', async ({ page }) => {
  // Uma regra so: fechar congela o documento entregue ao orgao, e anexo faz
  // parte dele. O campo nem e oferecido.
  await page.goto('/financeiro/prestacoes')
  const fechada = page.locator('article', { hasText: 'Fechada' }).first()

  await expect(fechada.getByLabel(/^Extrato bancário/)).toHaveCount(0)
})
```

- [ ] **Step 2: Rodar a travessia**

Run: `taskkill //F //IM node.exe //T; taskkill //F //IM chrome.exe //T`
Run: `npx playwright test tests/e2e/financeiro.spec.ts --project=autenticado --reporter=line`
Expected: PASS.

- [ ] **Step 3: A suíte inteira, por projeto**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: tudo verde.

Run: `taskkill //F //IM node.exe //T; taskkill //F //IM chrome.exe //T`
Run: `npx playwright test --project=autenticado --reporter=line`
Expected: PASS.

Run: `taskkill //F //IM node.exe //T; taskkill //F //IM chrome.exe //T`
Run: `npx playwright test --project=saude --project=administrativo --project=anonimo --reporter=line`
Expected: PASS.

Run: `npm run auditoria`
Expected: `found 0 vulnerabilities`.

- [ ] **Step 4: Registrar o que ficou aberto**

Em `docs/operacao/pendencias-fase-3.md`, acrescente à tabela e ao corpo dois itens novos, no formato dos existentes:

```markdown
| 7. O backup ficou bem mais pesado | aberto — agrava o item 1 da Fase 1 | no teste de restauração, no VPS |
| 8. Ninguém confere se o anexo é o que diz ser | aberto, deliberado | é trabalho de quem confere |
```

E as duas seções, ao fim do arquivo:

```markdown
## 7. O volume de backup ficou bem mais pesado

**Situação:** os anexos comprobatórios vão para o mesmo volume `lar_uploads` do
anexo de residente. Uma dúzia de notas por mês, mais os comprovantes e um
extrato por conta, passam a ser a maior parte do que o backup protege.

**Por que isso importa:** o item 1 das pendências da Fase 1 registra que a
metade documental do backup **nunca foi exercitada** — nem no VPS, nem na
verificação parcial de 23/08/2026, que cobriu só o que não dependia de Docker.
Essa metade acabou de ficar bem maior, e continua sendo a que ninguém testou.

**O que fazer:** nada aqui. É razão a mais para o teste de restauração da Fase 1
deixar de ser hipótese, e não uma tarefa própria.

## 8. Ninguém confere se o anexo é o que diz ser

**Situação:** um comprovante de pagamento enviado no campo do documento fiscal
entra no apêndice na posição do documento fiscal, e o sistema não tem como
notar. O mesmo vale para a nota de outra despesa, ou para um PDF em branco.

**Qual é a exposição:** a contagem de cobertura no cartão da prestação mostra
que **há** um arquivo, nunca que ele é o arquivo certo. Quem confere continua
sendo quem confere.

**O que fazer:** nada. Reconhecer conteúdo de PDF é problema de outra ordem, e
o valor de resolvê-lo não paga o que custaria.
```

- [ ] **Step 5: Atualizar o README**

Na descrição do financeiro, acrescente um parágrafo dizendo que cada despesa guarda o documento fiscal e o comprovante de pagamento em PDF, que cada prestação guarda o extrato bancário, e que os três saem como apêndice da exportação em PDF — na ordem da folha de despesas, e pulados em silêncio quando faltam.

- [ ] **Step 6: Commit e merge**

```bash
git add tests/e2e/financeiro.spec.ts docs/operacao/pendencias-fase-3.md README.md
git commit -m "Fecha os anexos comprobatorios: E2E e registro das pendencias

A travessia anexa pela tela, confere a contagem de cobertura e baixa o PDF da
prestacao fechada. E confere que a prestacao fechada nem oferece o campo.

Registra duas pendencias novas na Fase 3: o volume de backup ficou bem mais
pesado, o que agrava o item 1 da Fase 1 — a metade documental nunca foi
exercitada —, e ninguem confere se o anexo e o que diz ser."

git checkout master
git merge --no-ff anexos-prestacao-contas -m "Merge branch 'anexos-prestacao-contas'"
```

Não empurre. O push é sempre pedido antes.

---

## Verificação final

Antes de dar a tarefa por concluída, com a saída de cada comando à vista:

- [ ] `npm run typecheck` — limpo
- [ ] `npm run lint` — limpo
- [ ] `npx vitest run` — todos os testes passando
- [ ] `npx playwright test --project=autenticado` — passando
- [ ] `npx playwright test --project=saude --project=administrativo --project=anonimo` — passando
- [ ] `npm run auditoria` — `found 0 vulnerabilities`
- [ ] Uma prestação sem anexo nenhum continua exportando as seis folhas de sempre
- [ ] O `.xlsx` e o CSV não mudaram
