import { test, expect, type Page } from '@playwright/test'

// O App Router injeta em toda página um anunciador de rota
// (`#__next-route-announcer__`) que também usa `role="alert"`, ainda que vazio.
// Filtrar pelo texto mira no alerta do formulário, não no do framework.
function alertaCom(page: Page, texto: string) {
  return page.getByRole('alert').filter({ hasText: texto })
}

async function cadastrarResidente(page: Page, nome: string): Promise<void> {
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
}

test('cadastra um residente e o encontra na lista', async ({ page }) => {
  const nome = `Maria Teste ${Date.now()}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByLabel('Quarto').fill('7')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()

  // Foi para a ficha, e a ficha mostra as datas em dd/mm/aaaa — sem o
  // deslocamento de um dia que a leitura ingênua de um campo `@db.Date` causa.
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
  await expect(page.locator('dl > div').filter({ hasText: 'Nascimento:' })).toContainText(
    '12/03/1940'
  )
  await expect(page.locator('dl > div').filter({ hasText: 'Quarto/leito:' })).toContainText(
    '7 / —'
  )

  await page.goto('/residentes')
  await page.getByLabel('Buscar por nome').fill(nome)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  const item = page.getByRole('link', { name: new RegExp(nome) })
  await expect(item).toBeVisible()
  await expect(item).toContainText('Admissão em 15/01/2026')
})

test('exibe erro ao cadastrar com CPF inválido', async ({ page }) => {
  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill('Teste CPF Inválido')
  await page.getByLabel('Data de nascimento').fill('1940-03-12')
  await page.getByLabel('Sexo').selectOption('FEMININO')
  await page.getByLabel('Data de admissão').fill('2026-01-15')
  await page.getByLabel('CPF').fill('111.111.111-11')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()

  await expect(alertaCom(page, 'CPF inválido')).toBeVisible()
  // Continua no formulário: nada foi gravado.
  await expect(page).toHaveURL(/\/residentes\/novo/)
})

test('registra anotação, responsável e avaliação na ficha', async ({ page }) => {
  const nome = `Joana Ficha ${Date.now()}`
  await cadastrarResidente(page, nome)

  const linhaGrau = page.locator('dl > div').filter({ hasText: 'Grau de dependência:' })
  await expect(linhaGrau).toContainText('não avaliado')

  // Anotação — a seção já vem aberta, é o que a equipe mais usa.
  await page.getByLabel('Categoria').selectOption('OCORRENCIA')
  await page.getByLabel('Anotação').fill('Queda sem lesão no banho.')
  await page.getByRole('button', { name: 'Registrar anotação' }).click()

  const secaoAnotacoes = page.getByRole('group').filter({ hasText: 'Anotações (' })
  await expect(secaoAnotacoes).toContainText('Queda sem lesão no banho.')
  // Rótulo em pt-BR, não o valor cru do enum ("OCORRENCIA").
  await expect(secaoAnotacoes).toContainText('Ocorrência')
  await expect(secaoAnotacoes).not.toContainText('OCORRENCIA')
  await expect(secaoAnotacoes.getByText('Anotações (1)')).toBeVisible()

  // Responsáveis — seção fechada por padrão.
  await page.locator('summary').filter({ hasText: 'Responsáveis' }).click()
  await page.getByLabel('Nome').fill('Ana Souza')
  await page.getByLabel('Parentesco').fill('Filha')
  await page.getByLabel('Telefone principal').fill('11988887777')
  await page.getByRole('button', { name: 'Adicionar responsável' }).click()

  const secaoResponsaveis = page.getByRole('group').filter({ hasText: 'Responsáveis (' })
  await expect(secaoResponsaveis).toContainText('Ana Souza')
  await expect(secaoResponsaveis).toContainText('Filha · 11988887777')

  // Avaliação de dependência — o grau registrado aqui é o que passa a aparecer
  // no cabeçalho da ficha.
  await page.locator('summary').filter({ hasText: 'Grau de dependência' }).click()
  await page.getByLabel('Grau de dependência').selectOption('II')
  await page.getByLabel('Data da avaliação').fill('2026-08-01')
  await page.getByLabel('Avaliado por').fill('Enfermeira Marta')
  await page.getByRole('button', { name: 'Registrar avaliação' }).click()

  await expect(linhaGrau).toContainText('II')
  await expect(
    page.getByRole('group').filter({ hasText: 'Grau de dependência (' })
  ).toContainText('Grau II em 01/08/2026 por Enfermeira Marta')
})

test('recusa CPF de responsável inválido sem gravar', async ({ page }) => {
  const nome = `Carlos Ficha ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.locator('summary').filter({ hasText: 'Responsáveis' }).click()
  await page.getByLabel('Nome').fill('Pedro Souza')
  await page.getByLabel('Parentesco').fill('Filho')
  await page.getByLabel('Telefone principal').fill('11977776666')
  await page.getByLabel('CPF').fill('123.456.789-00')
  await page.getByRole('button', { name: 'Adicionar responsável' }).click()

  await expect(alertaCom(page, 'CPF inválido')).toBeVisible()
  await expect(
    page.getByRole('group').filter({ hasText: 'Responsáveis (' })
  ).toContainText('Nenhum responsável cadastrado.')
})

test('a raiz do sistema leva à lista de residentes', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/residentes/)
  await expect(page.getByRole('heading', { name: 'Residentes' })).toBeVisible()
})

test('o menu traz as áreas do papel e o botão de sair encerra a sessão', async ({ page }) => {
  await page.goto('/residentes')

  // Coordenação enxerga as quatro áreas; papéis mais restritos veem menos.
  const menu = page.getByRole('navigation')
  await expect(menu.getByRole('link', { name: 'Residentes' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Funcionários' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Usuários' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Auditoria' })).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login/)

  // Sessão encerrada de verdade: voltar à lista cai de novo no login.
  await page.goto('/residentes')
  await expect(page).toHaveURL(/\/login/)
})

test('anexa um documento na ficha e o entrega pelo endpoint autenticado', async ({ page }) => {
  const nome = `Rita Documento ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.locator('summary').filter({ hasText: 'Documentos' }).click()
  await page.getByLabel('Tipo do documento').selectOption('RG')
  await page.getByLabel('Descrição').fill('RG digitalizado')
  // O arquivo passa de 1 MB de propósito: esse é o limite padrão de corpo de
  // Server Action no Next, e abaixo dele o teste não perceberia se o
  // `bodySizeLimit` de 20 MB sumisse do `next.config.ts` — o anexo de uma foto
  // de documento voltaria a falhar sem mensagem na tela.
  await page.getByLabel('Arquivo').setInputFiles({
    name: 'rg.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([
      Buffer.from('%PDF-1.4 conteúdo de teste'),
      Buffer.alloc(1_200_000, 0x20),
    ]),
  })
  await page.getByRole('button', { name: 'Anexar documento' }).click()

  const secaoDocumentos = page.getByRole('group').filter({ hasText: 'Documentos (' })
  const link = secaoDocumentos.getByRole('link', { name: /rg\.pdf/ })
  await expect(link).toBeVisible()

  const href = await link.getAttribute('href')
  const resposta = await page.request.get(href!)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toBe('application/pdf')
  expect(await resposta.text()).toContain('conteúdo de teste')
})

test('marca contato de emergência e ele aparece no cabeçalho da ficha', async ({ page }) => {
  const nome = `Idosa Emergencia ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.locator('summary').filter({ hasText: 'Responsáveis' }).click()
  await page.getByLabel('Nome').fill('João da Silva')
  await page.getByLabel('Parentesco').fill('Filho')
  await page.getByLabel('Telefone principal').fill('(65) 99999-0000')
  await page.getByLabel('É contato de emergência').check()
  await page.getByRole('button', { name: 'Adicionar responsável' }).click()

  // O cabeçalho é onde alguém procura o telefone numa urgência: se a marcação
  // não for gravada, esta linha fica vazia e o teste falha.
  const linhaEmergencia = page.locator('dl > div').filter({ hasText: 'Emergência:' })
  await expect(linhaEmergencia).toContainText('João da Silva')
  await expect(linhaEmergencia).toContainText('(65) 99999-0000')

  // `autorizadoVisitar` vem marcado por padrão, então a ficha NÃO deve trazer a
  // ressalva de visitas. Verificar a ausência do aviso na lista prova o valor
  // gravado no banco — diferente de reabrir o formulário vazio e conferir que a
  // caixa vem marcada, que só reafirma o padrão do próprio formulário.
  const secaoResponsaveis = page.getByRole('group').filter({ hasText: 'Responsáveis (' })
  await expect(secaoResponsaveis.getByText('João da Silva')).toBeVisible()
  await expect(page.getByText('visitas não autorizadas')).toHaveCount(0)
})

test('corrige um cadastro pela tela de edição', async ({ page }) => {
  const nome = `Idoso Edicao ${Date.now()}`

  await page.goto('/residentes/novo')
  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Data de nascimento').fill('1941-09-14')
  await page.getByLabel('Sexo').selectOption('MASCULINO')
  await page.getByLabel('Data de admissão').fill('2026-03-10')
  await page.getByLabel('Quarto').fill('2')
  await page.getByRole('button', { name: 'Cadastrar residente' }).click()

  await page.getByRole('link', { name: 'Editar cadastro' }).click()
  await expect(page.getByLabel('Quarto')).toHaveValue('2')
  await page.getByLabel('Quarto').fill('9')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()

  await expect(page.getByRole('status')).toBeVisible()

  // A confirmação na tela não prova gravação: a ficha é que mostra o que ficou
  // no banco.
  await page.getByRole('link', { name: 'Residentes' }).click()
  await page.getByLabel('Buscar por nome').fill(nome)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await page.getByRole('link', { name: new RegExp(nome) }).click()
  await expect(page.locator('dl > div').filter({ hasText: 'Quarto/leito:' })).toContainText(
    '9 / —'
  )
})
