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
      // A própria migração já insere seu registro em schema_migrations —
      // normalmente só o runner faz isso, depois que o arquivo roda. Isso
      // faz o INSERT que o runner tenta a seguir (uma chamada SEPARADA,
      // depois do SQL do arquivo) colidir com a chave primária e falhar.
      // Só um ROLLBACK que cubra as duas chamadas — o SQL do arquivo e o
      // INSERT do runner — na MESMA conexão desfaz os efeitos já
      // bem-sucedidos do arquivo (a tabela e a linha manual). Um arquivo
      // que só falhasse sozinho não provaria nada sobre rollback, porque
      // não haveria nada de bem-sucedido para desfazer.
      await writeFile(
        path.join(dir, arquivo),
        `
          CREATE TABLE tabela_que_nao_deve_sobreviver (id INT);
          INSERT INTO schema_migrations (name) VALUES ('${arquivo}');
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
