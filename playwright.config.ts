import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Garante o usuário-semente antes de qualquer teste: sem isto a suíte
  // dependeria de um `npm run db:seed` manual e falharia numa máquina nova.
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3000', locale: 'pt-BR' },
  // O servidor de desenvolvimento compila cada rota na primeira visita, e uma
  // navegação a tela ainda não compilada passa dos 5 s de asserção e dos 30 s
  // de teste padrão. Os prazos maiores são do relógio, não das asserções: o
  // que se espera continua sendo exatamente o mesmo.
  expect: { timeout: 20_000 },
  timeout: 90_000,
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'autenticado',
      testIgnore: /auth\.setup\.ts|login\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'tests/e2e/.sessao.json' },
    },
    { name: 'anonimo', testMatch: /login\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    // A primeira compilação do `/login` num clone limpo passa de um minuto em
    // máquina modesta; o prazo curto derrubava a suíte antes de ela começar.
    timeout: 180_000,
  },
})
