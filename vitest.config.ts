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
  },
})
