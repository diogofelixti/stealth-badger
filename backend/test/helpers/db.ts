import { connectionString, pool } from '../../src/db/pool'
import { migrate } from '../../src/db/migrate'

let ready = false

/**
 * `resetDb` trunca todas as tabelas. Apontada para o banco de
 * desenvolvimento, a suíte apaga as carteiras cadastradas e o log de eventos
 * já sincronizado — e o estrago só aparece depois, quando a tela abre vazia.
 *
 * Daí a exigência de que o nome do banco termine em `_test`. Não é burocracia:
 * é a única barreira entre rodar os testes e perder a demonstração.
 */
export function exigirBancoDeTeste(): void {
  const nome = (() => {
    try {
      return new URL(connectionString).pathname.replace(/^\//, '')
    } catch {
      return connectionString
    }
  })()

  if (nome.endsWith('_test')) return
  throw new Error(
    'os testes truncam o banco inteiro e recusam rodar em "' +
      nome +
      '", que não termina em _test. Aponte DATABASE_URL para um banco de teste ' +
      '(ex.: .../stealth_badger_test) antes de rodar a suíte.',
  )
}

export async function resetDb(): Promise<void> {
  exigirBancoDeTeste()
  if (!ready) {
    await migrate()
    ready = true
  }
  await pool.query(`
    TRUNCATE alerts, utxos, chain_events, addresses,
             wallets, channels, backends, sessions, users
    RESTART IDENTITY CASCADE
  `)
}
