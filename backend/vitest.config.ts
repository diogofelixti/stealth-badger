import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    // resetDb() trunca o banco inteiro. Arquivos de teste em paralelo
    // truncariam o banco uns dos outros e a suíte ficaria intermitente.
    fileParallelism: false,
  },
})
