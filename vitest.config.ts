import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/setup.ts'],
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // O padrão do Vitest é 5000 ms, e para esta suíte isso é apertado: todo
    // teste começa truncando o banco (`limparBanco`, em
    // `tests/helpers/setup.ts`), e alguns ainda renderizam um PDF de seis
    // páginas com fontes embutidas.
    //
    // Medido em 05/09/2026, depois de caçar uma falha intermitente que
    // aparecia uma vez a cada quatro rodadas e nunca era capturada pelo nome:
    // era `a razao social vai para a celula da capa` estourando os 5000 ms,
    // com 6799 ms. O trabalho em si não justifica: importar os módulos leva
    // ~750 ms e `gerarPdfPrestacao` leva ~450 ms. O resto é máquina fria —
    // logo depois de uma operação de git que invalidou cache de arquivo, que
    // foi a condição em que a falha finalmente reproduziu.
    //
    // 20 s não esconde travamento: é 25x o tempo do teste mais pesado quando
    // a máquina está quente.
    testTimeout: 20_000,
  },
})
