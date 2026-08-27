import { mkdirSync, writeFileSync, watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { gerarPdfPrestacao } from '../src/modules/financeiro/pdf-prestacao'
import {
  documentoDeTeste,
  despesaDeTeste,
  receitaDeTeste,
} from '../tests/helpers/documento-prestacao'

/**
 * Gera o PDF da prestação com dados de exemplo e o abre, para experimentar o
 * desenho sem passar pelo sistema.
 *
 * **Existe porque o laço de retorno era longo demais para aprender.** Ver o
 * efeito de uma mudança em `pdf-prestacao.ts` exigia subir a aplicação, entrar,
 * fechar uma competência e baixar o arquivo. Aqui é um comando, e em modo
 * `--observar` é nenhum: salvar o arquivo já regera o PDF.
 *
 * O documento de exemplo reusa as fábricas de `tests/helpers`, e não uma cópia
 * local: assim o que se vê aqui é o mesmo formato que os testes exercitam, e
 * uma mudança no tipo `DocumentoPrestacao` quebra os dois juntos em vez de
 * deixar este script mentindo.
 *
 * Uso:
 *   npm run pdf:rascunho              gera e abre
 *   npm run pdf:rascunho -- --observar   regera a cada gravação, sem reabrir
 *   npm run pdf:rascunho -- --cru        sem compressão, para ler o conteúdo
 *
 * O `--cru` é para inspeção: sem compressão, os blocos `BT … Tm … TJ … ET` do
 * PDF ficam legíveis num editor de texto, e é assim que os testes de geometria
 * de `pdf-prestacao.test.ts` descobrem onde cada palavra foi escrita.
 */

const DESTINO = join(process.cwd(), 'rascunho')
const ARQUIVO = join(DESTINO, 'prestacao.pdf')

/**
 * Volume propositalmente acima do comum, para **forçar a segunda página** de
 * despesas — é onde o cabeçalho é redesenhado, e o trecho mais fácil de
 * quebrar sem perceber, porque a primeira página continua bonita.
 *
 * Quarenta e cinco, e não dezoito: a quebra acontece em `doc.y > 700`, e com
 * linhas de 16 pt são umas 37 despesas. Dezoito cabiam todas numa página e o
 * cabeçalho era desenhado uma vez só — o caso interessante nunca rodava.
 */
function documentoDeExemplo() {
  const credores = [
    'Energisa', 'Águas Cuiabá', 'Supermercado Bom Preço', 'Farmácia Central',
    'Padaria do Bairro', 'Gás Butano Ltda', 'Lavanderia Nova', 'Manutenção Predial ME',
    'Distribuidora de Fraldas Cuiabá', 'Laboratório Análises Clínicas',
  ]

  const despesas = Array.from({ length: 45 }, (_, i) =>
    despesaDeTeste({
      item: i + 1,
      credor: credores[i % credores.length],
      data: new Date(2026, 7, (i % 28) + 1),
      valor: 150 + i * 137.45,
    })
  )

  const receitas = Array.from({ length: 6 }, (_, i) =>
    receitaDeTeste({
      item: i + 1,
      origem: ['Convênio municipal', 'Doação', 'Contribuição de residente'][i % 3],
      data: new Date(2026, 7, (i % 28) + 1),
      valor: 3000 + i * 512.3,
    })
  )

  const totalDespesas = despesas.reduce((soma, d) => soma + d.valor, 0)
  const totalReceitas = receitas.reduce((soma, r) => soma + r.valor, 0)

  return documentoDeTeste({
    despesas,
    receitas,
    conciliacao: {
      banco: 'Banco do Brasil',
      agencia: '1234-5',
      conta: '98765-4',
      periodo: { de: new Date(2026, 7, 1), ate: new Date(2026, 7, 31) },
      saldoAnterior: 15000,
      recebimentosPorOrigem: [
        { rotulo: 'Convênio municipal', valor: 12000 },
        { rotulo: 'Doação', valor: 4500 },
        { rotulo: 'Contribuição de residente', valor: 3200 },
      ],
      despesasDetalhadas: [
        { credor: 'Supermercado Bom Preço', categoria: 'Alimentação', valor: 8200 },
        { credor: 'Energisa', categoria: 'Energia elétrica', valor: 1900 },
        { credor: 'Farmácia Central', categoria: 'Medicamentos', valor: 3400 },
      ],
      totalReceitas,
      totalDespesas,
      saldoDisponivel: 15000 + totalReceitas - totalDespesas,
    },
  })
}

async function gerar(): Promise<void> {
  const buffer = await gerarPdfPrestacao(documentoDeExemplo())
  mkdirSync(DESTINO, { recursive: true })
  writeFileSync(ARQUIVO, buffer)

  const kb = (buffer.length / 1024).toFixed(1)
  console.log(`${new Date().toLocaleTimeString('pt-BR')}  ${ARQUIVO}  (${kb} kB)`)
}

function abrir(): void {
  // Sem `shell: true`, que o Node passou a avisar como risco — com shell os
  // argumentos são concatenados em vez de escapados, e um caminho com espaço
  // vira dois argumentos.
  //
  // No Windows, `start` é embutido do `cmd` e não existe como programa, então
  // se chama o `cmd` diretamente. O `''` depois de `start` é o título da
  // janela: sem ele, o `start` trata o caminho entre aspas como título e não
  // abre nada. macOS e Linux têm binários de verdade e não precisam de nada
  // disso.
  //
  // `detached` com `unref` para o script não ficar preso ao visualizador.
  const [comando, argumentos] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', ARQUIVO]]
      : process.platform === 'darwin'
        ? ['open', [ARQUIVO]]
        : ['xdg-open', [ARQUIVO]]

  spawn(comando as string, argumentos as string[], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

async function principal(): Promise<void> {
  // A compressão é decidida dentro de `gerarPdfPrestacao` por `NODE_ENV`. Este
  // script a controla pela bandeira, para não obrigar quem o usa a saber disso.
  // `Object.assign`, e nao `process.env.NODE_ENV = ...`: os tipos do Node
  // declaram a propriedade como somente-leitura, e o `tsc` recusa a atribuicao
  // direta.
  if (process.argv.includes('--cru')) Object.assign(process.env, { NODE_ENV: 'test' })

  await gerar()

  if (!process.argv.includes('--observar')) {
    abrir()
    return
  }

  // Regera, mas **não reabre**: reabrir a cada gravação encheria a tela de
  // janelas. Abra uma vez e recarregue no visualizador — a maioria detecta a
  // troca do arquivo sozinha.
  console.log('Observando src/modules/financeiro/. Ctrl+C para sair.')
  abrir()

  let pendente = false
  watch(join(process.cwd(), 'src', 'modules', 'financeiro'), { recursive: true }, () => {
    // O editor grava em duas etapas e dispara o evento mais de uma vez; sem a
    // trava, um salvamento vira três gerações.
    if (pendente) return
    pendente = true
    setTimeout(() => {
      pendente = false
      gerar().catch((erro) => console.error('Falhou ao gerar:', erro))
    }, 150)
  })
}

await principal()
