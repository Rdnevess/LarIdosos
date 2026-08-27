import { test, expect, type Page } from '@playwright/test'
import { NOME_RESIDENTE_SAUDE } from './credenciais'
import { horarioDoTurnoCorrente, inicioDoTurnoCorrente } from './turno-corrente'

/**
 * A interface vista pelo papel SAUDE. Até a Tarefa 19 nenhum teste, de
 * nenhuma camada, exercitou a ficha com outro perfil que não a coordenação —
 * e foi exatamente aí que se escondeu o defeito que impedia a enfermeira de
 * anexar um exame ou o laudo do grau de dependência.
 */
async function abrirFicha(page: Page): Promise<void> {
  await page.goto('/residentes')
  await page.getByLabel('Buscar por nome').fill(NOME_RESIDENTE_SAUDE)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await page.getByRole('link', { name: new RegExp(NOME_RESIDENTE_SAUDE) }).click()
  await expect(page.getByRole('heading', { name: NOME_RESIDENTE_SAUDE })).toBeVisible()
}

test('o menu do papel SAUDE traz só a área de residentes', async ({ page }) => {
  await page.goto('/residentes')

  const menu = page.getByRole('navigation')
  await expect(menu.getByRole('link', { name: 'Residentes' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Funcionários' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Usuários' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Auditoria' })).toHaveCount(0)
})

test('a ficha oferece anexar exame e laudo ao papel SAUDE', async ({ page }) => {
  await abrirFicha(page)

  await page.locator('summary').filter({ hasText: 'Documentos' }).click()

  // O formulário existia e era escondido justamente de quem tem permissão de
  // anexar documento clínico.
  const seletor = page.getByLabel('Tipo do documento')
  await expect(seletor).toBeVisible()

  // Os tipos clínicos, que o seletor omitia de todo mundo.
  await expect(seletor.locator('option[value="EXAME"]')).toHaveCount(1)
  await expect(seletor.locator('option[value="LAUDO"]')).toHaveCount(1)
  // E o que este papel não pode ver continua fora.
  await expect(seletor.locator('option[value="COMPROVANTE_FISCAL"]')).toHaveCount(0)

  // Rótulos em português, nunca o valor cru do enum.
  await expect(seletor).toContainText('Exame')
  await expect(seletor).not.toContainText('COMPROVANTE_FISCAL')
})

test('a enfermeira anexa o laudo do grau de dependência e ele aparece na ficha', async ({
  page,
}) => {
  await abrirFicha(page)

  await page.locator('summary').filter({ hasText: 'Documentos' }).click()
  await page.getByLabel('Tipo do documento').selectOption('LAUDO')
  await page.getByLabel('Descrição').fill('Laudo do grau de dependência')

  const nomeArquivo = `laudo-${Date.now()}.pdf`
  await page.getByLabel('Arquivo').setInputFiles({
    name: nomeArquivo,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 laudo de grau de dependência'),
  })
  await page.getByRole('button', { name: 'Anexar documento' }).click()

  // Gravado de verdade: a listagem da ficha vem do banco.
  const secaoDocumentos = page.locator('details').filter({ hasText: 'Documentos (' })
  await expect(secaoDocumentos).toContainText(nomeArquivo)

  // A seção pode estar fechada aqui, e a causa é do ambiente de teste, não da
  // ficha: esta suíte roda contra `npm run dev`, cujo bundle é grande o
  // bastante para o Playwright clicar em "Anexar documento" antes de o React
  // hidratar. Sem hidratação o navegador faz o POST nativo do HTML — a Server
  // Action grava do mesmo jeito, mas o retorno é uma navegação de documento,
  // que devolve a página no estado do servidor, com as seções fechadas.
  //
  // Medido em 21/08/2026 contra build de produção, com CPU estrangulada em 6x,
  // rede 3G e espera zero entre carregar e enviar: nenhuma recarga, em nenhum
  // caso. Nenhum usuário alcança isso — ver `docs/operacao/pendencias-fase-1.md`,
  // item 6. Por isso o `if` é defensivo em vez de uma espera fixa: quando a
  // máquina é rápida a seção já está aberta e nada acontece.
  const aberta = await secaoDocumentos.evaluate((e: HTMLDetailsElement) => e.open)
  if (!aberta) await secaoDocumentos.locator('summary').first().click()

  const link = secaoDocumentos.getByRole('link', { name: new RegExp(nomeArquivo) })
  await expect(link).toBeVisible()
  await expect(link).toContainText('Laudo')

  // E o papel consegue lê-lo de volta pelo endpoint autenticado.
  const href = await link.getAttribute('href')
  const resposta = await page.request.get(href!)
  expect(resposta.status()).toBe(200)
})

test('a ficha não oferece ao papel SAUDE desligamento nem edição de cadastro', async ({
  page,
}) => {
  await abrirFicha(page)

  await expect(page.getByRole('link', { name: /Registrar saída ou óbito/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Ver registro de saída/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Editar cadastro' })).toHaveCount(0)
})

test('a tela de desligamento digitada na URL recusa o papel SAUDE em pt-BR', async ({
  page,
}) => {
  await abrirFicha(page)
  const url = page.url()

  await page.goto(`${url}/desligar`)

  await expect(page.getByText(/registro de desligamento ou óbito é feito pela coordenação/i)).toBeVisible()
  // Nenhum formulário de saída, e nada de mensagem de exceção interna.
  await expect(page.getByRole('button', { name: 'Registrar saída' })).toHaveCount(0)
  await expect(page.getByText(/Acesso negado|ErroPermissao/)).toHaveCount(0)
})

test('o papel SAUDE registra anotação, que é a escrita que lhe cabe', async ({ page }) => {
  await abrirFicha(page)

  const texto = `Aferição de pressão sem alteração ${Date.now()}.`
  // A ficha cadastral so oferece categoria nao-clinica desde a Fase 2A; o
  // clinico do papel SAUDE vive no prontuario.
  await page.getByLabel('Categoria').selectOption('SOCIAL')
  await page.getByLabel('Anotação').fill(texto)
  await page.getByRole('button', { name: 'Registrar anotação' }).click()

  const secaoAnotacoes = page.getByRole('group').filter({ hasText: 'Anotações (' })
  await expect(secaoAnotacoes).toContainText(texto)
})

test('a enfermeira registra o turno inteiro e ve tudo na linha do tempo', async ({ page }) => {
  // O caminho que a Fase 2A existe para abrir: a equipe de cuidado registrando
  // pelo prontuário, sem passar pela coordenação. Se registrar der trabalho,
  // ninguém registra, e o sistema vira um caderno digital vazio.
  await abrirFicha(page)
  await page.getByRole('link', { name: 'Prontuário' }).click()
  await expect(page.getByRole('heading', { name: /Prontuário/ })).toBeVisible()

  const marca = Date.now()

  // Botão grande: evolução em um campo só.
  const botaoEvolucao = page.locator('details').filter({ hasText: 'Evolução' }).first()
  await botaoEvolucao.locator('summary').first().click()
  await botaoEvolucao.getByLabel('Anotação').fill(`Aceitou o café da manhã ${marca}.`)
  await botaoEvolucao.getByRole('button', { name: 'Registrar evolução' }).click()

  // Botão grande: sinais vitais, aferição parcial.
  const botaoSinais = page.locator('details').filter({ hasText: 'Sinais vitais' }).first()
  await botaoSinais.locator('summary').first().click()
  await botaoSinais.getByLabel('Pressão sistólica').fill('130')
  await botaoSinais.getByLabel('Pressão diastólica').fill('80')
  await botaoSinais.getByRole('button', { name: 'Registrar sinais vitais' }).click()

  // A confirmação fica dentro do `<details>`, que a revalidação do servidor
  // fecha — o registro aconteceu, mas a mensagem sai da árvore acessível. O
  // que importa é o resultado, e é nele que este teste espera.

  const linha = page.getByRole('region').filter({ hasText: 'Linha do tempo' })
  await expect(linha).toContainText(`Aceitou o café da manhã ${marca}.`)
  await expect(linha).toContainText('PA 130×80')

  // O filtro deixa só um tipo, e é formulário de servidor: sobrevive ao
  // recarregamento e a um link copiado.
  await linha.getByLabel('Tipo de evento').selectOption('SINAL_VITAL')
  await linha.getByRole('button', { name: 'Filtrar' }).click()

  const filtrada = page.getByRole('region').filter({ hasText: 'Linha do tempo' })
  await expect(filtrada).toContainText('PA 130×80')
  await expect(filtrada).not.toContainText(`Aceitou o café da manhã ${marca}.`)
})

/**
 * Os números do relatório de aderência, lidos do texto.
 *
 * O relatório é agregado por residente, e o residente da enfermagem é fixo —
 * SAUDE não pode cadastrar residente, então toda execução prescreve no mesmo.
 * Afirmar "0% sem registro" seria afirmar algo sobre todas as execuções que já
 * passaram por aqui: bastaria uma falhar no meio, deixando uma prescrição sem
 * administrar, para envenenar todas as seguintes. Por isso se mede a diferença
 * que ESTA execução provoca, e não o total.
 */
async function lerAderencia(page: Page) {
  const aderencia = page.locator('details').filter({ hasText: 'Aderência' })
  // Abrir só se estiver fechado: clicar num `<details>` já aberto o fecharia.
  if (!(await aderencia.evaluate((d: HTMLDetailsElement) => d.open))) {
    await aderencia.locator('summary').first().click()
  }

  const texto = (await aderencia.textContent()) ?? ''
  if (/Nenhuma dose prevista/.test(texto)) {
    return { semRegistro: 0, previstas: 0, administradas: 0 }
  }

  const proporcao = texto.match(/(\d+) de (\d+) doses previstas/)
  // `Administradas` com maiúscula não casa com o rótulo "Não administradas".
  const administradas = texto.match(/Administradas(\d+)/)
  if (!proporcao || !administradas) {
    throw new Error(`relatório de aderência ilegível: ${texto}`)
  }

  return {
    semRegistro: Number(proporcao[1]),
    previstas: Number(proporcao[2]),
    administradas: Number(administradas[1]),
  }
}

test('a enfermeira percorre o plantao: prescreve, administra e ve a aderencia', async ({
  page,
}) => {
  // O caminho inteiro que a Fase 2B existe para abrir: derivacao, registro e
  // relatorio, sem passar pela coordenacao.
  await abrirFicha(page)
  await page.getByRole('link', { name: 'Prontuário' }).click()

  // Antes de prescrever: o relatório já traz o que execuções anteriores
  // deixaram neste residente fixo, e é dessa linha de base que se mede.
  const antes = await lerAderencia(page)

  const farmaco = `Losartana ${Date.now()}`
  const horario = horarioDoTurnoCorrente()
  const vigencia = inicioDoTurnoCorrente()

  const secao = page.locator('details').filter({ hasText: 'Medicações' })
  await secao.locator('summary').first().click()
  await secao.getByLabel('Fármaco').fill(farmaco)
  await secao.getByLabel('Dose').fill('1 comprimido')
  await secao.getByLabel('Via').selectOption('ORAL')
  await secao.getByLabel('Tipo').selectOption('HORARIO_FIXO')
  await secao.getByLabel('Horários').fill(horario)
  await secao.getByLabel('Vigente a partir de').fill(vigencia)
  await secao.getByRole('button', { name: 'Prescrever' }).click()

  // `click()` resolve quando o clique é despachado, e não quando a Server
  // Action termina. Sem esperar, a navegação seguinte vence a corrida sempre
  // que a máquina está ocupada: o `/turno` renderiza sem a dose, e a
  // asserção seguinte repete o seletor por 20 s numa página que nunca mais
  // é buscada.
  //
  // `toHaveCount` e não `toBeVisible`: o `<details>` recolhe ao re-renderizar
  // depois da action, e medir visibilidade mediria a gaveta em vez do commit.
  //
  // O mesmo padrão está no `turno.spec.ts`, onde a corrida foi diagnosticada.
  await expect(secao.locator('li', { hasText: farmaco })).toHaveCount(1)

  await page.goto('/turno')
  const linha = page.locator('li', { hasText: farmaco })
  await expect(linha).toBeVisible()
  await linha.getByRole('button', { name: 'Administrada' }).click()
  await expect(page.locator('li', { hasText: farmaco })).toContainText('Administrada')

  // E o relatório conta a dose administrada, sem nenhuma sem registro.
  await linha.getByRole('link').first().click()
  const depois = await lerAderencia(page)

  // A prescrição criada acrescentou uma dose prevista, e administrá-la a pôs
  // entre as administradas sem deixar nada sem registro. Em diferenças, e não
  // em totais: o que este teste faz é +1 e +1, qualquer que seja o acumulado.
  expect(depois.previstas).toBe(antes.previstas + 1)
  expect(depois.administradas).toBe(antes.administradas + 1)
  expect(depois.semRegistro).toBe(antes.semRegistro)
})

/**
 * A outra metade da fronteira do dinheiro.
 *
 * A Fase 3 pôs no sistema conta bancária, lançamento e prestação de contas, e
 * nada disso é da enfermagem. Como no prontuário para o ADMINISTRATIVO, o que
 * vale não é o menu — é o serviço recusar quem digita a URL.
 */
test('o financeiro é recusado ao perfil SAUDE, e a trilha registra', async ({
  page,
  browser,
}) => {
  await page.goto('/turno')
  await expect(page.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)

  for (const rota of [
    '/financeiro',
    '/financeiro/cadastros',
    '/financeiro/prestacoes',
    '/financeiro/contribuicoes',
  ]) {
    await page.goto(rota)
    await expect(
      page.getByRole('heading', { name: /Não foi possível abrir esta tela/ })
    ).toBeVisible()
    // Nada de exceção interna vazando para a tela.
    await expect(page.getByText(/ErroPermissao|Prisma|at Object/)).toHaveCount(0)
  }

  const coordenacao = await browser.newContext({
    storageState: 'tests/e2e/.sessao.json',
    baseURL: 'http://localhost:3000',
  })
  const paginaCoordenacao = await coordenacao.newPage()
  await paginaCoordenacao.goto('/auditoria')
  // `ContaBancaria`, e não `Lancamento`: é `listarContasBancarias` o primeiro
  // serviço que /financeiro chama, e é ele quem recusa — a entidade registrada
  // é a de quem barrou, não a do assunto da tela.
  await paginaCoordenacao.getByLabel('Entidade').selectOption('ContaBancaria')
  await paginaCoordenacao.getByRole('button', { name: 'Filtrar' }).click()
  await expect(paginaCoordenacao.getByText('Acesso negado').first()).toBeVisible()

  await coordenacao.close()
})
