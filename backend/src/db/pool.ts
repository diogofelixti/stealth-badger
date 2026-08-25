import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://badger:badger@localhost:5432/stealth_badger'

export const pool = new pg.Pool({ connectionString, max: 10 })
