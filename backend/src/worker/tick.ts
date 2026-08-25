import type { ChainAdapter } from '../chain/types'
import { createEsploraAdapter } from '../chain/esplora'
import { pool } from '../db/pool'
import { activeEvents } from '../events/log'
import { alertsForEvent } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import { deliver } from '../alerts/channels'
import { syncWallet } from '../sync/engine'

export interface TickReport {
  walletsSynced: number
  alertsCreated: number
}

const DUST_THRESHOLD = 1000

interface TickOptions {
  adapterFactory?: (backend: { url: string; isPublic: boolean }) => ChainAdapter
}

export async function tick(opts: TickOptions = {}): Promise<TickReport> {
  const factory =
    opts.adapterFactory ??
    ((b: { url: string; isPublic: boolean }) =>
      createEsploraAdapter(b.url, { isPublic: b.isPublic }))

  const { rows: wallets } = await pool.query<{
    id: string
    user_id: string
    url: string
    is_public: boolean
  }>(
    `SELECT w.id, w.user_id, b.url, b.is_public
       FROM wallets w JOIN backends b ON b.id = w.backend_id
      ORDER BY w.id`,
  )

  let walletsSynced = 0
  let alertsCreated = 0

  for (const w of wallets) {
    const walletId = Number(w.id)
    const userId = Number(w.user_id)

    let result
    try {
      result = await syncWallet(walletId, factory({ url: w.url, isPublic: w.is_public }))
    } catch (err) {
      console.error('falha ao sincronizar carteira ' + walletId + ': ' + (err as Error).message)
      continue
    }
    walletsSynced += 1

    if (result.newEvents.length === 0) continue

    const events = await activeEvents(walletId)
    const novos = events.filter(e => result.newEvents.includes(e.id))

    for (const event of novos) {
      const { address, wasUsedBefore } = await addressContext(walletId, event)
      for (const candidate of alertsForEvent(event, {
        userId,
        tipHeight: result.tipHeight,
        dustThreshold: DUST_THRESHOLD,
        addressWasUsed: wasUsedBefore,
        address,
      })) {
        const id = await saveAlert(candidate)
        if (id === null) continue
        alertsCreated += 1
        await deliver(
          {
            id,
            walletId,
            type: candidate.type,
            severity: candidate.severity,
            params: candidate.params,
          },
          userId,
        )
      }
    }
  }

  return { walletsSynced, alertsCreated }
}

async function addressContext(
  walletId: number,
  event: { id: number; payload: Record<string, unknown> },
): Promise<{ address: string; wasUsedBefore: boolean }> {
  const addressId = (event.payload as { addressId?: number }).addressId
  if (!addressId) return { address: '', wasUsedBefore: false }

  const { rows: addr } = await pool.query<{ address: string }>(
    'SELECT address FROM addresses WHERE id = $1',
    [addressId],
  )
  const full = addr[0]?.address ?? ''
  const address = full.length > 18 ? full.slice(0, 8) + '...' + full.slice(-6) : full

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM chain_events
      WHERE wallet_id = $1 AND type = 'utxo_created' AND rolled_back_by IS NULL
        AND id < $2 AND (payload->>'addressId')::int = $3`,
    [walletId, event.id, addressId],
  )
  return { address, wasUsedBefore: Number(rows[0]!.count) > 0 }
}
