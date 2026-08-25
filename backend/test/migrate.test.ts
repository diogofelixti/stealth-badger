import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

  it('reverte tudo quando uma migração falha no meio — nada sobrevive', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stealth-badger-migrate-'))
    const arquivo = '002_falha.sql'
    try {
      // primeira instrução é válida e cria uma tabela que não existe em
      // nenhuma outra migração; a segunda é deliberadamente inválida. Se a
      // transação da migração funcionar, nem a tabela nem o registro em
      // schema_migrations devem sobreviver à falha da segunda instrução.
      await writeFile(
        path.join(dir, arquivo),
        `
          CREATE TABLE tabela_que_nao_deve_sobreviver (id INT);
          ISTO NAO E SQL VALIDO;
        `,
      )

      await expect(migrate(dir)).rejects.toThrow()

      const { rows: tabela } = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'tabela_que_nao_deve_sobreviver'`,
      )
      expect(tabela).toHaveLength(0)

      const { rows: migracao } = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [arquivo],
      )
      expect(migracao).toHaveLength(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
