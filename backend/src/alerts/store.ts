import { pool } from '../db/pool'
import type { AlertCandidate } from './rules'

export async function saveAlert(c: AlertCandidate): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [c.userId, c.walletId, c.type, c.severity, JSON.stringify(c.params), c.dedupeKey, c.eventId],
  )
  if (!rows[0]) return null

  const id = Number(rows[0].id)
  await pool.query(`SELECT pg_notify('sb_alerts', $1)`, [
    JSON.stringify({ id, userId: c.userId, walletId: c.walletId, severity: c.severity }),
  ])
  return id
}

export async function recentAlerts(userId: number, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, wallet_id AS "walletId", type, severity, params,
            created_at AS "createdAt", read_at AS "readAt"
       FROM alerts WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return rows
}
