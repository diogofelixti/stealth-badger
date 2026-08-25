import { describe, it, expect, beforeAll } from 'vitest'
import { migrate } from '../src/db/migrate'
import { pool } from '../src/db/pool'

describe('migrações', () => {
  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  })

  it('cria as tabelas do schema base', async () => {
    await migrate()
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = rows.map(r => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'users', 'sessions', 'backends', 'wallets',
        'addresses', 'chain_events', 'utxos', 'alerts', 'channels',
      ]),
    )
  })

  it('é idempotente — rodar de novo não falha nem reaplica', async () => {
    await migrate()
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM schema_migrations',
    )
    expect(Number(rows[0]!.count)).toBe(1)
  })
})
