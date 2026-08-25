import { pool } from '../../src/db/pool'
import { migrate } from '../../src/db/migrate'

let ready = false

export async function resetDb(): Promise<void> {
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
