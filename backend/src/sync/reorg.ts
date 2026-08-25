import type { ChainAdapter } from '../chain/types'
import { pool } from '../db/pool'
import { appendEvent } from '../events/log'

export async function detectReorg(
  walletId: number,
  adapter: ChainAdapter,
): Promise<number | null> {
  const { rows } = await pool.query<{ height: number; block_hash: string }>(
    `SELECT DISTINCT height, block_hash
       FROM chain_events
      WHERE wallet_id = $1 AND rolled_back_by IS NULL
        AND height IS NOT NULL AND block_hash IS NOT NULL
      ORDER BY height DESC`,
    [walletId],
  )
  if (rows.length === 0) return null

  let divergent: number | null = null
  for (const row of rows) {
    const actual = await adapter.blockHashAt(row.height)
    if (actual === row.block_hash) break
    divergent = row.height
  }
  return divergent
}

export async function rollbackFrom(walletId: number, height: number): Promise<number> {
  const reorgId = await appendEvent({
    walletId,
    type: 'reorg_detected',
    height,
    blockHash: null,
    txid: null,
    vout: null,
    payload: { rolledBackFromHeight: height },
  })

  const { rowCount } = await pool.query(
    `UPDATE chain_events
        SET rolled_back_by = $1
      WHERE wallet_id = $2
        AND rolled_back_by IS NULL
        AND id <> $1
        AND height >= $3`,
    [reorgId, walletId, height],
  )
  return rowCount ?? 0
}
