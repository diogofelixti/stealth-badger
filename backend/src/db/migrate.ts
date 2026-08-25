import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool'

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = path.resolve(here, '../../migrations')

export async function migrate(dir: string = DEFAULT_DIR): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file],
    )
    if (rowCount) continue

    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await pool.query('BEGIN')
      await pool.query(sql)
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await pool.query('COMMIT')
      console.log(`migração aplicada: ${file}`)
    } catch (err) {
      await pool.query('ROLLBACK')
      throw new Error(`falha na migração ${file}: ${(err as Error).message}`)
    } finally {
      client.release()
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
