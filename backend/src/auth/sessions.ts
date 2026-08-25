import { createHash, randomBytes } from 'node:crypto'
import { pool } from '../db/pool'

const TTL_DAYS = 30

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [digest(token), userId, TTL_DAYS],
  )
  return token
}

export async function userIdForToken(token: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
    [digest(token)],
  )
  return rows[0] ? Number(rows[0].user_id) : null
}

export async function destroySession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)])
}
