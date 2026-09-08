import { test, expect, type Page } from '@playwright/test'
import { esperarHidratacao } from './hidratacao'

// O App Router injeta em toda página um anunciador de rota
// (`#__next-route-announcer__`) que também usa `role="alert"`, ainda que vazio.
// Filtrar pelo texto mira no alerta do formulário, não no do framework.
function alertaCom(page: Page, texto: string) {
  return page.getByRole('alert').filter({ hasText: texto })
}

async function cadastrarResidente(page: Page, nome: string): Promise<void> {
  await page.goto('/residentes/novo')
  await esperarHidratacao(page)
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
  await page.getByLabel('Categoria').selectOption('VISITA_FAMILIA')
  await page.getByLabel('Anotação').fill('Filha visitou na tarde de domingo.')
  await page.getByRole('button', { name: 'Registrar anotação' }).click()

  const secaoAnotacoes = page.getByRole('group').filter({ hasText: 'Anotações (' })
  await expect(secaoAnotacoes).toContainText('Filha visitou na tarde de domingo.')
  // Rótulo em pt-BR, não o valor cru do enum ("VISITA_FAMILIA").
  await expect(secaoAnotacoes).toContainText('Visita da família')
  await expect(secaoAnotacoes).not.toContainText('VISITA_FAMILIA')
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

test('corrige o telefone de um responsável e remove quem deixou de sê-lo', async ({ page }) => {
  // Os dois caminhos que faltavam se agravavam mutuamente: sem editar e sem
  // remover, um telefone desatualizado ficava permanente na ficha — e é o
  // telefone do responsável que alguém procura numa urgência.
  const nome = `Marta Ficha ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.locator('summary').filter({ hasText: 'Responsáveis' }).click()
  await page.getByLabel('Nome').fill('Ana Souza')
  await page.getByLabel('Parentesco').fill('Filha')
  await page.getByLabel('Telefone principal').fill('11988887777')
  await page.getByRole('button', { name: 'Adicionar responsável' }).click()

  const secao = page.getByRole('group').filter({ hasText: 'Responsáveis (' })
  await expect(secao).toContainText('11988887777')

  const item = secao.locator('li', { hasText: 'Ana Souza' })
  await item.locator('summary').filter({ hasText: 'Editar' }).click()
  await item.getByLabel('Telefone principal').fill('11955554444')
  await item.getByRole('button', { name: 'Salvar responsável' }).click()

  await expect(secao).toContainText('11955554444')
  await expect(secao).not.toContainText('11988887777')

  await item.locator('summary').filter({ hasText: 'Remover' }).click()
  await item.getByRole('button', { name: 'Remover responsável' }).click()

  await expect(secao).toContainText('Nenhum responsável cadastrado.')
  await expect(secao.getByText('Responsáveis (0)')).toBeVisible()
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

  // Excluir era o caminho que faltava: documento anexado por engano só saía
  // pelo banco. A exclusão é lógica — o arquivo e o registro continuam lá,
  // fora da listagem —, e quem pode ver o documento pode excluí-lo, porque a
  // mesma política governa as duas coisas.
  const item = secaoDocumentos.locator('li', { hasText: 'rg.pdf' })
  await item.locator('summary').filter({ hasText: 'Excluir' }).click()
  await item.getByRole('button', { name: 'Excluir documento' }).click()

  await expect(secaoDocumentos).toContainText('Nenhum documento anexado.')
  await expect(secaoDocumentos.getByText('Documentos (0)')).toBeVisible()

  // O endpoint deixa de entregar o conteúdo: `obterDocumentoParaDownload`
  // recusa documento inativo, e não é a listagem que protege o arquivo.
  const respostaDepois = await page.request.get(href!)
  expect(respostaDepois.status()).toBe(404)
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

test('registra o óbito de um residente e o encontra pelo filtro de situação', async ({ page }) => {
  const nome = `Idosa Obito ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.getByRole('link', { name: 'Registrar saída ou óbito' }).click()
  await page.getByLabel('Situação').selectOption('FALECIDO')
  await page.getByLabel('Data da saída').fill('2026-08-05')
  await page.getByLabel('Motivo da saída').fill('Falecimento por causas naturais')
  await page.getByRole('button', { name: 'Registrar saída' }).click()

  // Gravado: a tela troca o formulário pelo registro somente-leitura. Este é
  // o sinal observável, e não o "Registro salvo" — a revalidação da rota
  // substitui a seção inteira antes de o texto chegar a aparecer, o mesmo que
  // `funcionarios.spec.ts` já precisou levar em conta.
  const registro = page.locator('dl > div').filter({ hasText: 'Situação:' })
  await expect(registro).toContainText('Falecido')

  await page.getByRole('link', { name: 'Voltar à ficha' }).click()
  await expect(page.locator('dl > div').filter({ hasText: 'Situação:' })).toContainText(
    'Falecido em 05/08/2026'
  )

  // Some da lista de ativos e passa a ser encontrado pelo filtro "Falecidos" —
  // o filtro que antes existia sem nenhuma tela capaz de atribuir o status.
  await page.goto('/residentes')
  await page.getByLabel('Buscar por nome').fill(nome)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByRole('link', { name: new RegExp(nome) })).toHaveCount(0)

  await page.getByLabel('Situação').selectOption('FALECIDO')
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByRole('link', { name: new RegExp(nome) })).toBeVisible()
})

test('id inexistente na URL entrega a tela de nao encontrado em pt-BR', async ({ page }) => {
  const resposta = await page.goto('/residentes/nao-existe-este-id')

  // 404 de verdade, não uma página 200 com texto de erro.
  expect(resposta?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Registro não encontrado' })).toBeVisible()
  // Nada de mensagem de exceção interna vazando para a tela.
  await expect(page.getByText(/Residente não encontrado|Error|at async/)).toHaveCount(0)
})

test('corrige uma anotacao na janela e retifica depois, pela ficha', async ({ page }) => {
  const nome = `Idoso Anotacao ${Date.now()}`
  await cadastrarResidente(page, nome)

  await page.getByLabel('Categoria').selectOption('SOCIAL')
  await page.getByLabel('Anotação').fill('Recusou o almoco.')
  await page.getByRole('button', { name: 'Registrar anotação' }).click()

  const secaoAnotacoes = page.getByRole('group').filter({ hasText: 'Anotações (' })
  await expect(secaoAnotacoes).toContainText('Recusou o almoco.')

  // Editar: dentro da janela de 15 minutos e de autoria de quem está logado,
  // o texto é substituído no mesmo registro.
  await page.locator('summary').filter({ hasText: 'Editar' }).click()
  await page.getByLabel('Texto corrigido').fill('Recusou o almoço, aceitou o lanche.')
  await page.getByRole('button', { name: 'Salvar correção' }).click()

  await expect(secaoAnotacoes).toContainText('Recusou o almoço, aceitou o lanche.')
  await expect(secaoAnotacoes).not.toContainText('Recusou o almoco.')
  // Continua sendo UMA anotação: a edição não cria registro novo.
  await expect(secaoAnotacoes).toContainText('Anotações (1)')

  // Retificar: o registro original fica, e nasce um segundo ligado a ele. É a
  // regra R3 da spec, que não tinha caminho de tela nenhum antes desta tarefa.
  await page.locator('summary').filter({ hasText: 'Retificar' }).click()
  await page.getByLabel('Texto da retificação').fill('Na verdade recusou o jantar, nao o almoco.')
  await page.getByRole('button', { name: 'Registrar retificação' }).click()

  await expect(secaoAnotacoes).toContainText('Anotações (2)')
  await expect(secaoAnotacoes).toContainText('Na verdade recusou o jantar')
  // O original continua exibido, sem alteração — e agora marcado.
  await expect(secaoAnotacoes).toContainText('Recusou o almoço, aceitou o lanche.')
  // O rótulo "· retificação", que a ficha exibia para algo que ninguém
  // conseguia criar, finalmente tem quem o dispare.
  await expect(secaoAnotacoes).toContainText('retificação')
  await expect(secaoAnotacoes).toContainText('retificada depois')
})

test('o menu marca a secao em que a pessoa esta, inclusive numa subrota', async ({ page }) => {
  // `aria-current` e a asserção, e nao a classe: e o que um leitor de tela
  // anuncia, e e o unico sinal que continua valendo se alguem trocar as cores.
  await page.goto('/residentes')
  const menu = page.getByRole('navigation')
  await expect(menu.getByRole('link', { name: 'Residentes' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(menu.getByRole('link', { name: 'Turno' })).not.toHaveAttribute(
    'aria-current',
    'page'
  )

  // Numa subrota, quem acende e a secao — nao a URL.
  await page.goto('/financeiro/cadastros')
  const menuFinanceiro = page.getByRole('navigation')
  await expect(menuFinanceiro.getByRole('link', { name: 'Financeiro' })).toHaveAttribute(
    'aria-current',
    'page'
  )
})
