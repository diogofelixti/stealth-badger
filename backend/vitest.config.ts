import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const raiz = path.dirname(fileURLToPath(import.meta.url))

/**
 * Lê uma variável do `.env` do projeto sem versionar segredo nenhum: o valor
 * fica no arquivo que já existe, e a suíte só o carrega em tempo de execução.
 */
function doEnvDoProjeto(nome: string): string | undefined {
  try {
    const texto = readFileSync(path.resolve(raiz, '../.env'), 'utf8')
    const linha = texto.split('\n').find(l => l.startsWith(nome + '='))
    return linha?.slice(nome.length + 1).trim()
  } catch {
    return undefined
  }
}

// Sem isto, `npm test` roda contra o banco de desenvolvimento e o trunca. O
// banco de teste é outro, e é criado uma vez com:
//   docker exec <postgres> psql -U badger -d postgres \
//     -c 'CREATE DATABASE stealth_badger_test OWNER badger'
const senha = doEnvDoProjeto('POSTGRES_PASSWORD') ?? 'badger'
const bancoDeTeste =
  'postgres://badger:' + senha + '@127.0.0.1:5432/stealth_badger_test'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? bancoDeTeste,
      MASTER_KEY_HEX:
        process.env.MASTER_KEY_HEX ?? doEnvDoProjeto('MASTER_KEY_HEX') ?? 'a'.repeat(64),
    },
    // resetDb() trunca o banco inteiro. Arquivos de teste em paralelo
    // truncariam o banco uns dos outros e a suíte ficaria intermitente.
    fileParallelism: false,
  },
})
