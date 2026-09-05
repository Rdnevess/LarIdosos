import { test, expect, type Page } from '@playwright/test'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PDFDocument } from 'pdf-lib'
import { esperarHidratacao } from './hidratacao'

/**
 * O caminho inteiro do dinheiro, pela tela: cadastrar a instituição e a conta,
 * lançar uma receita e uma despesa, e ver as duas na lista com o valor em
 * reais.
 *
 * Os nomes levam o relógio junto porque o banco de E2E não é limpo entre as
 * rodadas — dois `Energisa` na lista fariam o `getByText` reclamar de
 * ambiguidade e o teste falhar por um motivo que não é o dele.
 */

const marca = Date.now()
const CONTA = `9${String(marca).slice(-5)}-4`
const ORIGEM = `Doação ${marca}`
// Duas origens, como na realidade: a doação avulsa e a contribuição do
// residente. As duas saem na prestação com o mesmo rótulo "Doação"; só a
// segunda exige informar de quem é.
const ORIGEM_CONTRIB = `Contribuição de residente ${marca}`
const CATEGORIA = `Energia ${marca}`
const FORNECEDOR = `Energisa ${marca}`
// A descrição também leva a marca: sem ela, a segunda rodada acha duas
// "Doação de agosto" na lista e o `getByText` reclama de ambiguidade.
const RECEITA = `Doação de agosto ${marca}`
const DESPESA = `Conta de luz de agosto ${marca}`

/**
 * Os rótulos obrigatórios carregam um asterisco ("Nome *"), então `exact` nunca
 * casa; e "Saldo inicial" sem âncora casaria também "Data do saldo inicial".
 * Daí as regexes ancoradas no início.
 */
async function abrirSecao(pagina: Page, titulo: string) {
  const secao = pagina.locator('details', { has: pagina.getByRole('heading', { name: titulo }) })
  await secao.locator('summary').click()
  return secao
}


/**
 * Garante a seção aberta, sem alternar.
 *
 * `abrirSecao` clica no `summary`, que ALTERNA — chamada com a seção já aberta,
 * ela fecha. Isto aqui olha o estado antes.
 *
 * Precisa existir por um motivo que não é do teste: quando a página ainda não
 * hidratou, o `<form>` de uma ação de servidor é enviado do jeito nativo, e a
 * resposta chega como página inteira — com todos os `<details>` fechados,
 * porque `open` é estado do DOM que ninguém guardou. A mensagem de sucesso
 * está lá; fica escondida dentro da seção recolhida. Sob carga, na suíte
 * cheia, isso acontece de vez em quando.
 */
async function garantirSecaoAberta(pagina: Page, titulo: string) {
  const secao = pagina.locator('details', { has: pagina.getByRole('heading', { name: titulo }) })
  if (!(await secao.evaluate((el: HTMLDetailsElement) => el.open))) {
    await secao.locator('summary').click()
  }
  return secao
}

/**
 * O cartão "Lançamentos (N)" da tela `/financeiro`. `section.cartao`, e não só
 * `section`: o `<section>` que a própria página devolve como raiz também
 * "contém" o título "Lançamentos", e um `li` solto na página inteira já
 * ambiguou um teste nesta base. `.cartao` é a classe do componente `<Cartao>`
 * — só ele carrega essa classe — então escapa da ambiguidade sem depender da
 * ordem dos elementos no documento.
 */
function secaoDeLancamentos(pagina: Page) {
  return pagina.locator('section.cartao', {
    has: pagina.getByRole('heading', { name: /^Lançamentos/ }),
  })
}

/** Um PDF de uma página, para anexar pela tela. */
async function pdfDeUmaPagina(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

/**
 * A faxina do que este arquivo passa a criar de verdade: um `Documento` no
 * banco e um arquivo no volume de uploads, via `setInputFiles`. Nenhum dos
 * dois é alcançado por `db:limpar-teste` — o script só recolhe usuário,
 * residente e funcionário por padrão de nome (`scripts/limpar-dados-de-teste.ts`).
 * `ContaBancaria`, `Lancamento` e `PrestacaoContas` continuam sem faxina aqui:
 * é resíduo antigo do arquivo, de fora do escopo desta tarefa — a pendência 7
 * já registra o peso disso em produção; esta faxina é só do que a Tarefa 7
 * acrescentou.
 *
 * Apaga pelo id exato capturado no teste, e não por prefixo no nome do
 * arquivo: o nome que sobe é sempre "nota.pdf" / "comprovante.pdf", sem a
 * marca — o id é o único identificador confiável que sobra.
 */
if (!process.env.UPLOADS_DIR) process.loadEnvFile('.env')
const prisma = new PrismaClient()
let documentoFiscalId: string | null = null
let documentoComprovanteId: string | null = null

function diretorioDeUploads(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? './data/uploads')
}

test.afterAll(async () => {
  const ids = [documentoFiscalId, documentoComprovanteId].filter(
    (id): id is string => id !== null
  )
  if (ids.length > 0) {
    const documentos = await prisma.documento.findMany({
      where: { id: { in: ids } },
      select: { caminhoArmazenamento: true },
    })
    // ON DELETE SET NULL desliga o lançamento sozinho — não precisa zerar o
    // campo antes.
    await prisma.documento.deleteMany({ where: { id: { in: ids } } })
    for (const documento of documentos) {
      await unlink(path.join(diretorioDeUploads(), documento.caminhoArmazenamento)).catch(
        () => {}
      )
    }
  }
  await prisma.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test('cadastra a instituição, a conta e os auxiliares', async ({ page }) => {
  await page.goto('/financeiro/cadastros')

  const instituicao = await abrirSecao(page, 'Dados da instituição')
  await instituicao.getByLabel('Razão social').fill('Associação Lar dos Idosos')
  await instituicao.getByLabel('CNPJ').fill('11.222.333/0001-81')
  await instituicao.getByLabel('Endereço completo').fill('Rua das Flores, 100 — Centro')
  await instituicao.getByLabel('Cidade').fill('Cuiabá')
  await instituicao.getByLabel('UF').fill('MT')
  await instituicao.getByLabel('Órgão destinatário').fill('Prefeitura Municipal de Cuiabá/MT')
  await instituicao.getByLabel('Nome do presidente').fill('Ana Ribeiro')
  await instituicao.getByLabel('Nome do tesoureiro').fill('Carlos Menezes')
  await instituicao.getByRole('button', { name: 'Salvar dados da instituição' }).click()
  await expect(instituicao.getByRole('status')).toBeVisible()

  // Recarregada, a tela volta preenchida: é registro único, não um formulário
  // que cria uma linha nova a cada salvamento.
  await page.reload()
  const recarregada = await abrirSecao(page, 'Dados da instituição')
  await expect(recarregada.getByLabel('Razão social')).toHaveValue('Associação Lar dos Idosos')

  const contas = await abrirSecao(page, 'Contas bancárias')
  await contas.getByLabel('Banco').fill('Banco do Brasil')
  await contas.getByLabel('Agência').fill('1234-5')
  await contas.getByLabel('Número da conta').fill(CONTA)
  await contas.getByLabel(/^Tipo/).selectOption('CORRENTE')
  await contas.getByLabel('Titular').fill('Associação Lar dos Idosos')
  await contas.getByLabel(/^Saldo inicial/).fill('15000')
  await contas.getByLabel('Data do saldo inicial').fill('2026-01-01')
  await contas.getByRole('button', { name: 'Cadastrar conta' }).click()
  await expect(page.getByText(CONTA).first()).toBeVisible()

  const origens = await abrirSecao(page, 'Origens de receita')
  await origens.getByLabel(/^Nome/).fill(ORIGEM)
  await origens.getByLabel('Rótulo na prestação').fill('Doação')
  await origens.getByRole('button', { name: 'Cadastrar origem' }).click()
  await expect(page.getByText(ORIGEM).first()).toBeVisible()

  await origens.getByLabel(/^Nome/).fill(ORIGEM_CONTRIB)
  await origens.getByLabel('Rótulo na prestação').fill('Doação')
  await origens.getByLabel('Exige informar o residente').check()
  await origens.getByRole('button', { name: 'Cadastrar origem' }).click()
  await expect(page.getByText(ORIGEM_CONTRIB).first()).toBeVisible()

  const categorias = await abrirSecao(page, 'Categorias de despesa')
  await categorias.getByLabel(/^Nome/).fill(CATEGORIA)
  await categorias.getByRole('button', { name: 'Cadastrar categoria' }).click()
  await expect(page.getByText(CATEGORIA).first()).toBeVisible()

  const fornecedores = await abrirSecao(page, 'Fornecedores')
  await fornecedores.getByLabel(/^Nome/).fill(FORNECEDOR)
  await fornecedores.getByLabel('Tipo de documento').selectOption('CNPJ')
  await fornecedores.getByLabel(/^Documento/).fill('11.222.333/0001-81')
  await fornecedores.getByRole('button', { name: 'Cadastrar fornecedor' }).click()
  await expect(page.getByText(FORNECEDOR).first()).toBeVisible()
})

test('recusa um CNPJ inválido, em português e sem vazar exceção', async ({ page }) => {
  await page.goto('/financeiro/cadastros')

  const fornecedores = await abrirSecao(page, 'Fornecedores')
  await fornecedores.getByLabel(/^Nome/).fill(`Inválido ${marca}`)
  await fornecedores.getByLabel('Tipo de documento').selectOption('CNPJ')
  await fornecedores.getByLabel(/^Documento/).fill('11.111.111/1111-11')
  await fornecedores.getByRole('button', { name: 'Cadastrar fornecedor' }).click()

  await expect(fornecedores.getByRole('alert')).toContainText('Documento inválido')
  await expect(page.getByText(/ZodError|Prisma|at Object/)).toHaveCount(0)
})

test('lança uma receita e uma despesa, e mostra as duas em reais', async ({ page }) => {
  await page.goto('/financeiro')

  const receita = await abrirSecao(page, 'Lançar receita')
  await receita.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await receita.getByLabel('Origem').selectOption({ label: ORIGEM })
  await receita.getByLabel('Descrição').fill(RECEITA)
  await receita.getByLabel('Valor').fill('2000')
  await receita.getByLabel('Data').fill('2026-08-05')
  await receita.getByRole('button', { name: 'Lançar receita' }).click()
  await expect(receita.getByRole('status')).toBeVisible()

  const despesa = await abrirSecao(page, 'Lançar despesa')
  await despesa.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await despesa.getByLabel('Fornecedor').selectOption({ label: FORNECEDOR })
  await despesa.getByLabel('Categoria').selectOption({ label: CATEGORIA })
  await despesa.getByLabel('Forma de pagamento').selectOption('PIX')
  await despesa.getByLabel('Descrição').fill(DESPESA)
  await despesa.getByLabel('Valor').fill('800')
  await despesa.getByLabel('Data').fill('2026-08-15')
  await despesa.getByRole('button', { name: 'Lançar despesa' }).click()
  // Esperar a confirmação antes de navegar: `page.goto` no mesmo instante do
  // clique aborta a Server Action em curso, e o lançamento nunca chega ao banco.
  await expect(despesa.getByRole('status')).toBeVisible()

  await page.goto('/financeiro?de=2026-08-01&ate=2026-08-31')
  await expect(page.getByText(RECEITA)).toBeVisible()
  await expect(page.getByText(DESPESA)).toBeVisible()
  await expect(page.getByText('R$ 2.000,00').first()).toBeVisible()
  await expect(page.getByText('R$ 800,00').first()).toBeVisible()
})

test('abre a prestação, fecha, e baixa o PDF', async ({ page }) => {
  await page.goto('/financeiro/prestacoes')

  const abrir = await abrirSecao(page, 'Abrir prestação')
  await abrir.getByLabel('Conta bancária').selectOption({ label: `Banco do Brasil — ${CONTA}` })
  await abrir.getByLabel('Ano').fill('2026')
  await abrir.getByLabel('Mês').selectOption('8')
  await abrir.getByRole('button', { name: 'Abrir prestação' }).click()
  await expect(abrir.getByRole('status')).toBeVisible()

  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const prestacao = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()

  // O saldo anterior vem do saldo inicial da conta: não há prestação fechada
  // anterior de onde herdar.
  await expect(prestacao.getByText('R$ 15.000,00')).toBeVisible()
  await expect(prestacao.getByText('Aberta', { exact: true })).toBeVisible()

  await prestacao.getByRole('button', { name: 'Fechar prestação' }).click()

  // O formulário de fechar some na revalidação, e leva a confirmação junto:
  // quem prova que fechou é o próprio cartão, que passa a "Fechada" e a
  // oferecer os downloads.
  const fechada = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()
  await expect(fechada.getByText('Fechada')).toBeVisible()

  // Pelo endpoint, com a sessão do navegador.
  const pdf = await page.request.get(
    (await fechada.getByRole('link', { name: 'Baixar PDF' }).getAttribute('href')) ?? ''
  )
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
})

test('reabrir exige motivo, e o motivo sai no documento regerado', async ({ page }) => {
  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const prestacao = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()

  const reabrir = prestacao.getByRole('group').filter({ hasText: 'Reabrir' })
  await reabrir.locator('summary').click()
  await reabrir.getByLabel('Motivo da reabertura').fill('Nota fiscal do telhado chegou atrasada')
  await reabrir.getByRole('button', { name: 'Reabrir prestação' }).click()

  const reaberta = page.getByRole('article').filter({ hasText: 'agosto de 2026' }).first()
  // `exact`: sem ele, "Aberta" casa também o "Reaberta:" da linha do motivo.
  await expect(reaberta.getByText('Aberta', { exact: true })).toBeVisible()
  await expect(reaberta.getByText(/chegou atrasada/)).toBeVisible()
})

test('anexa nota e comprovante na despesa, e eles saem no PDF da prestacao', async ({
  page,
}, informacoes) => {
  // A travessia que so a tela prova: anexar pela interface, ver a contagem
  // mudar nos dois campos (sao colunas separadas do lancamento, e este e o
  // caso que prova isso), e o documento entregue ao orgao sair com as duas
  // paginas dos anexos a mais — nao so "maior que zero", que passaria igual
  // com o juntarAnexos completamente quebrado, ja que a base sozinha tem seis
  // folhas.
  //
  // A prestacao chega aqui reaberta pelo teste anterior — despesa descongelada
  // de novo —, entao os campos de anexo voltam a aparecer na linha.
  const nota = informacoes.outputPath('nota.pdf')
  const comprovante = informacoes.outputPath('comprovante.pdf')
  await writeFile(nota, await pdfDeUmaPagina())
  await writeFile(comprovante, await pdfDeUmaPagina())

  const prestacao = await prisma.prestacaoContas.findFirstOrThrow({
    where: { contaBancaria: { numeroConta: CONTA }, anoCompetencia: 2026, mesCompetencia: 8 },
    select: { id: true },
  })
  // A linha de base, com a prestacao ainda sem anexo nenhum: o endpoint nao
  // exige "Fechada" para responder, so o papel — e o numero contra o qual o
  // download de depois de fechar vai ser comparado.
  const antes = await page.request.get(`/api/prestacoes/${prestacao.id}/pdf`)
  const paginasAntes = (await PDFDocument.load(await antes.body())).getPageCount()

  // Filtro explicito: "hoje" no relogio da maquina ja passou de agosto de
  // 2026, e o padrao sem filtro (`mesCorrente()`) mostraria o mes corrente, e
  // nao o da despesa lancada no teste 3.
  await page.goto('/financeiro?de=2026-08-01&ate=2026-08-31')
  const linha = secaoDeLancamentos(page).locator('li', { hasText: DESPESA })

  await linha.getByLabel(/^Documento fiscal/).setInputFiles(nota)
  await linha.getByRole('button', { name: 'Anexar' }).first().click()
  await expect(linha.getByRole('link', { name: 'nota.pdf' })).toBeVisible()

  await linha.getByLabel(/^Comprovante de pagamento/).setInputFiles(comprovante)
  await linha.getByRole('button', { name: 'Anexar' }).first().click()
  await expect(linha.getByRole('link', { name: 'comprovante.pdf' })).toBeVisible()

  // Guarda os dois ids para a faxina no afterAll: nem o volume de uploads nem
  // a tabela Documento sao alcancados pelo db:limpar-teste.
  const lancamento = await prisma.lancamento.findFirstOrThrow({
    where: { descricao: DESPESA },
    select: { documentoFiscalId: true, comprovantePagamentoId: true },
  })
  documentoFiscalId = lancamento.documentoFiscalId
  documentoComprovanteId = lancamento.comprovantePagamentoId

  // Filtrado pela conta: o banco de E2E acumula "Banco do Brasil" de rodadas
  // anteriores, e um `article` solto pegaria o primeiro da lista, nao o desta
  // rodada.
  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const cartao = page.locator('article', { hasText: 'Banco do Brasil' }).first()
  await expect(cartao).toContainText('1 com documento fiscal')
  await expect(cartao).toContainText('1 com comprovante')
  await expect(cartao).toContainText('sem extrato')

  // Fecha para os downloads aparecerem. O PDF baixado tem de ter exatamente
  // duas paginas a mais que o de antes de anexar qualquer coisa — uma por
  // anexo, os dois de uma pagina so —, o que so acontece se o anexo realmente
  // atravessa ate o apendice, e nao so ate o banco.
  await cartao.getByRole('button', { name: 'Fechar prestação' }).click()
  const baixado = await Promise.all([
    page.waitForEvent('download'),
    cartao.getByRole('link', { name: 'Baixar PDF' }).click(),
  ])
  const arquivo = await baixado[0].path()
  const paginasDepois = (await PDFDocument.load(await readFile(arquivo))).getPageCount()
  expect(paginasDepois).toBe(paginasAntes + 2)
})

test('a prestacao fechada nao aceita mais anexo', async ({ page }) => {
  // Uma regra so: fechar congela o documento entregue ao orgao, e anexo faz
  // parte dele. O campo nem e oferecido.
  await page.goto(`/financeiro/prestacoes?conta=${encodeURIComponent(CONTA)}`)
  const fechada = page.locator('article', { hasText: 'Fechada' }).first()

  // Sem isto, um `.first()` que nao acha `article` nenhum tambem teria zero
  // filhos com o rotulo do extrato — e o teste passaria por ausencia da
  // prestacao, nao por ausencia do campo.
  await expect(fechada).toBeVisible()
  await expect(fechada.getByLabel(/^Extrato bancário/)).toHaveCount(0)
})

test('define a contribuição na ficha e a lança pela proposta do mês', async ({ page }) => {
  const nome = `Idosa Contribuinte ${marca}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-04-04')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-10')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  const contribuicao = page
    .locator('details')
    .filter({ hasText: 'Contribuição' })
    .first()
  await contribuicao.locator('summary').click()
  await contribuicao.getByLabel('Percentual do benefício (%)').fill('70')
  await contribuicao.getByLabel('Valor do benefício').fill('1412')
  await contribuicao.getByLabel('Vigente a partir de').fill('2026-01-10')
  await contribuicao.getByRole('button', { name: 'Definir contribuição' }).click()
  await expect(page.getByText('70% de R$ 1.412,00')).toBeVisible()

  // 70% de 1412 = 988,40. O sistema propõe; quem lança é gente.
  await page.goto('/financeiro/contribuicoes?ano=2026&mes=8')
  const linha = page.getByRole('listitem').filter({ hasText: nome })
  await expect(linha.getByText('R$ 988,40')).toBeVisible()

  await linha.getByRole('button', { name: 'Lançar contribuição' }).click()
  await expect(linha.getByText('Já lançado')).toBeVisible()
})

test('recusa categoria repetida, dizendo qual ja existe', async ({ page }) => {
  // A pendencia 3 decidiu nao fechar a lista. O que se fecha e so a porta da
  // duplicata textual, e a mensagem tem que nomear a categoria que ja existe —
  // senao quem cadastrou fica sem saber o que procurar na lista.
  await page.goto('/financeiro/cadastros')

  const categorias = await abrirSecao(page, 'Categorias de despesa')
  await categorias.getByLabel(/^Nome/).fill(CATEGORIA.toUpperCase())
  await categorias.getByRole('button', { name: 'Cadastrar categoria' }).click()

  await expect(categorias.getByRole('alert')).toContainText('Já existe a categoria')
  await expect(categorias.getByRole('alert')).toContainText(CATEGORIA)
})

test('junta duas categorias e nao mexe no que ja foi ao orgao', async ({ page }) => {
  // O conserto inteiro da pendencia 3, pela tela: a duplicada sai da lista e os
  // lancamentos passam para a categoria boa — menos os de prestacao fechada,
  // que ficam onde estao. A despesa criada la em cima entrou na prestacao que
  // o teste do PDF fechou, entao e exatamente esse o caso exercitado aqui.
  const DESTINO = `Energia eletrica ${marca}`
  await page.goto('/financeiro/cadastros')

  await esperarHidratacao(page)
  const categorias = await abrirSecao(page, 'Categorias de despesa')
  await categorias.getByLabel(/^Nome/).fill(DESTINO)
  await categorias.getByRole('button', { name: 'Cadastrar categoria' }).click()

  // `abrirSecao` alterna o <details>: chamar de novo fecharia a seção que
  // acabou de ser aberta. O localizador da criação continua valendo.
  const juntar = categorias

  // Esperar pela OPÇÃO do seletor, e não pelo nome na lista. A revalidação
  // atualiza a lista e o formulário de mesclagem em momentos que o teste não
  // controla; esperar pela lista e agir sobre o seletor deixou a corrida
  // aberta, e ela apareceu como falha intermitente na suíte cheia.
  await expect(
    juntar.getByLabel(/^Categoria a eliminar/).locator('option', { hasText: DESTINO })
  ).toHaveCount(1)
  await juntar.getByLabel(/^Categoria a eliminar/).selectOption({ label: CATEGORIA })
  await juntar.getByLabel(/^Passa a ser/).selectOption({ label: DESTINO })
  await juntar.getByRole('button', { name: 'Mesclar categorias' }).click()

  // Dois `role=status` convivem na seção: o "Registro salvo." do cadastro e o
  // resumo da mesclagem. O filtro escolhe o segundo pelo que só ele diz.
  // A seção pode ter se recolhido, se o envio caiu no caminho nativo — ver
  // `garantirSecaoAberta`. A mensagem existe de qualquer jeito; o que muda é
  // se ela está visível.
  const depoisDeMesclar = await garantirSecaoAberta(page, 'Categorias de despesa')
  const aviso = depoisDeMesclar.getByRole('status').filter({ hasText: 'reclassificad' })
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('prestação fechada')

  // E a eliminada sai da lista, que e o que impede alguem de escolhe-la de novo.
  await page.reload()
  const depois = await abrirSecao(page, 'Categorias de despesa')
  await expect(depois.getByRole('listitem').filter({ hasText: CATEGORIA })).toHaveCount(0)
})

test('junta duas origens e o que ja foi ao orgao nao muda de subtotal', async ({ page }) => {
  // A mesclagem de origem pesa mais que a de categoria: a conciliacao agrupa
  // os recebimentos por rotulo, entao juntar duas origens muda EM QUE SUBTOTAL
  // o dinheiro entra. Por isso o destino e escolhido, e nunca deduzido.
  //
  // A receita lancada la em cima entrou na prestacao que o teste do PDF
  // fechou, entao e o congelamento que se exercita aqui.
  await page.goto('/financeiro/cadastros')

  await esperarHidratacao(page)
  const origens = await abrirSecao(page, 'Origens de receita')
  await expect(
    origens.getByLabel(/^Origem a eliminar/).locator('option', { hasText: ORIGEM })
  ).toHaveCount(1)

  await origens.getByLabel(/^Origem a eliminar/).selectOption({ label: `${ORIGEM} → Doação` })
  await origens.getByLabel(/^Passa a ser/).selectOption({ label: `${ORIGEM_CONTRIB} → Doação` })
  await origens.getByRole('button', { name: 'Mesclar origens' }).click()

  const depois = await garantirSecaoAberta(page, 'Origens de receita')
  const aviso = depois.getByRole('status').filter({ hasText: 'reclassificad' })
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('prestação fechada')

  // E a eliminada sai da lista, que e o que impede alguem de escolhe-la de novo.
  await page.reload()
  const relista = await abrirSecao(page, 'Origens de receita')
  await expect(relista.getByRole('listitem').filter({ hasText: ORIGEM })).toHaveCount(0)
})

test.describe('sem JavaScript', () => {
  // A pendencia 14 acontece antes da hidratacao, e ate aqui so aparecia como
  // flake sob carga. Com o JavaScript desligado o caminho nativo e o UNICO
  // possivel, entao o que era intermitente vira deterministico.
  test.describe.configure({ mode: 'default' })
  test.use({ javaScriptEnabled: false })

  test('a mensagem de resultado sobrevive ao envio nativo do formulario', async ({ page }) => {
    await page.goto('/financeiro/cadastros')

    const categorias = page.locator('details', {
      has: page.getByRole('heading', { name: 'Categorias de despesa' }),
    })
    // Sem JavaScript o <details> nao alterna por clique do Playwright do mesmo
    // jeito; abrir pelo atributo e o equivalente ao que o navegador faz.
    await categorias.evaluate((el: HTMLDetailsElement) => { el.open = true })

    await categorias.getByLabel(/^Nome/).fill(`Sem JS ${Date.now()}`)
    await categorias.getByRole('button', { name: 'Cadastrar categoria' }).click()

    const secaoDepois = page.locator('details', {
      has: page.getByRole('heading', { name: 'Categorias de despesa' }),
    })

    // Duas coisas medidas aqui, e as duas importam para a pendencia 14.
    //
    // Primeira: a secao volta FECHADA. `open` e estado do DOM, e a navegacao
    // inteira do envio nativo o descarta.
    expect(await secaoDepois.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false)

    // Segunda, e a que corrige o que eu tinha registrado errado: a mensagem
    // ESTA no documento. O `useActionState` do React e progressivamente
    // aprimorado — sem JavaScript a acao roda e o estado volta renderizado.
    // Ela nao se perde; fica fora de vista dentro da secao recolhida.
    await secaoDepois.evaluate((el: HTMLDetailsElement) => { el.open = true })
    await expect(secaoDepois.getByRole('status')).toContainText('Registro salvo.')
  })
})
