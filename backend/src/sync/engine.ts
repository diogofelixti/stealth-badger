import type { ChainAdapter } from '../chain/types'
import { open } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { activeEvents, appendEvent } from '../events/log'
import { projectWallet } from '../events/project'
import type { Network, ScriptType } from '../wallet/descriptor'
import { scanGap } from './gap'
import { detectReorg, rollbackFrom } from './reorg'

export interface SyncResult {
  newEvents: number[]
  reorgAt: number | null
  tipHeight: number
}

interface WalletRow {
  id: string
  xpub_encrypted: Buffer
  script_type: ScriptType
  network: Network
  gap_limit: number
}

async function setState(
  walletId: number,
  state: string,
  extra: { progress?: number; height?: number; error?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE wallets SET sync_state = $2,
            sync_progress = COALESCE($3, sync_progress),
            sync_height   = COALESCE($4, sync_height),
            sync_error    = $5
      WHERE id = $1`,
    [walletId, state, extra.progress ?? null, extra.height ?? null, extra.error ?? null],
  )
}

export async function syncWallet(
  walletId: number,
  adapter: ChainAdapter,
): Promise<SyncResult> {
  const { rows } = await pool.query<WalletRow>(
    `SELECT id, xpub_encrypted, script_type, network, gap_limit
       FROM wallets WHERE id = $1`,
    [walletId],
  )
  const wallet = rows[0]
  if (!wallet) throw new Error('carteira ' + walletId + ' não encontrada')

  try {
    await setState(walletId, 'importing', { progress: 0 })

    const masterKey = process.env.MASTER_KEY_HEX
    if (!masterKey) throw new Error('MASTER_KEY_HEX ausente')
    const canonicalXpub = open(wallet.xpub_encrypted, masterKey)

    const tipHeight = await adapter.tipHeight()
    const reorgAt = await detectReorg(walletId, adapter)
    if (reorgAt !== null) await rollbackFrom(walletId, reorgAt)

    const scanned = []
    for (const chain of [0, 1] as const) {
      scanned.push(
        ...(await scanGap({
          adapter,
          canonicalXpub,
          scriptType: wallet.script_type,
          network: wallet.network,
          chain,
          gapLimit: wallet.gap_limit,
        })),
      )
      await setState(walletId, 'importing', { progress: chain === 0 ? 50 : 90 })
    }

    const addressIds = new Map<string, number>()
    for (const a of scanned) {
      const { rows: ar } = await pool.query<{ id: string }>(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash, is_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (wallet_id, chain, idx)
         DO UPDATE SET is_used = EXCLUDED.is_used
         RETURNING id`,
        [walletId, a.chain, a.index, a.path, a.address, a.scripthash, a.used],
      )
      addressIds.set(a.address, Number(ar[0]!.id))
    }

    const existing = await activeEvents(walletId)
    const known = new Set(
      existing.filter(e => e.type === 'utxo_created').map(e => e.txid + ':' + e.vout),
    )
    const spent = new Set(
      existing.filter(e => e.type === 'utxo_spent').map(e => e.txid + ':' + e.vout),
    )

    const newEvents: number[] = []
    const seen = new Set<string>()

    if (!adapter.getUtxosForAddress) {
      throw new Error('adapter sem listagem de UTXO por endereço')
    }

    for (const a of scanned.filter(s => s.used)) {
      const utxos = await adapter.getUtxosForAddress(a.address)
      for (const u of utxos) {
        const key = u.txid + ':' + u.vout
        seen.add(key)
        if (known.has(key)) continue
        newEvents.push(
          await appendEvent({
            walletId,
            type: 'utxo_created',
            height: u.height,
            blockHash: u.height !== null ? await adapter.blockHashAt(u.height) : null,
            txid: u.txid,
            vout: u.vout,
            payload: { addressId: addressIds.get(a.address)!, valueSats: u.value },
          }),
        )
      }
    }

    for (const key of known) {
      if (seen.has(key) || spent.has(key)) continue
      const [txid, voutStr] = key.split(':')
      newEvents.push(
        await appendEvent({
          walletId,
          type: 'utxo_spent',
          height: tipHeight,
          blockHash: await adapter.blockHashAt(tipHeight),
          txid: txid!,
          vout: Number(voutStr),
          payload: { spentAtTxid: 'desconhecido' },
        }),
      )
    }

    await projectWallet(walletId)
    await setState(walletId, 'synced', { progress: 100, height: tipHeight })

    return { newEvents, reorgAt, tipHeight }
  } catch (err) {
    await setState(walletId, 'error', { error: (err as Error).message })
    throw err
  }
}
