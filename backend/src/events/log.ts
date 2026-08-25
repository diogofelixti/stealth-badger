import { pool } from '../db/pool'

export type EventType = 'utxo_created' | 'utxo_spent' | 'reorg_detected'

export interface NewEvent {
  walletId: number
  type: EventType
  height: number | null
  blockHash: string | null
  txid: string | null
  vout: number | null
  payload: Record<string, unknown>
}

export interface StoredEvent extends NewEvent {
  id: number
  occurredAt: Date
}

export async function appendEvent(e: NewEvent): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chain_events (wallet_id, type, height, block_hash, txid, vout, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [e.walletId, e.type, e.height, e.blockHash, e.txid, e.vout, JSON.stringify(e.payload)],
  )
  return Number(rows[0]!.id)
}

export async function activeEvents(walletId: number): Promise<StoredEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, wallet_id, type, height, block_hash, txid, vout, payload, occurred_at
       FROM chain_events
      WHERE wallet_id = $1 AND rolled_back_by IS NULL
      ORDER BY id ASC`,
    [walletId],
  )
  return rows.map(r => ({
    id: Number(r.id),
    walletId: Number(r.wallet_id),
    type: r.type as EventType,
    height: r.height,
    blockHash: r.block_hash,
    txid: r.txid,
    vout: r.vout,
    payload: r.payload,
    occurredAt: r.occurred_at,
  }))
}
