import type { ChainAdapter } from '../chain/types'
import { open } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { activeEvents, appendEvent } from '../events/log'
import { projectWallet } from '../events/project'
import type { Network, ScriptType } from '../wallet/descriptor'
import { scanGap, type ScannedAddress } from './gap'
import { detectReorg, rollbackFrom } from './reorg'

export interface SyncResult {
  newEvents: number[]
  reorgAt: number | null
  tipHeight: number
  /** endereços que o backend confirmou inalterados e não foram reconferidos */
  skipped: number
}

interface WalletRow {
  id: string
  xpub_encrypted: Buffer
  script_type: ScriptType
  network: Network
  gap_limit: number
  sync_state: string
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

/** status guardado na volta anterior, separado por cadeia e índice */
async function knownStatuses(
  walletId: number,
): Promise<Record<0 | 1, Map<number, string | null>>> {
  const { rows } = await pool.query<{ chain: number; idx: number; status: string | null }>(
    'SELECT chain, idx, status FROM addresses WHERE wallet_id = $1',
    [walletId],
  )
  const byChain: Record<0 | 1, Map<number, string | null>> = {
    0: new Map(),
    1: new Map(),
  }
  for (const r of rows) byChain[r.chain === 1 ? 1 : 0].set(r.idx, r.status)
  return byChain
}

export async function syncWallet(
  walletId: number,
  adapter: ChainAdapter,
): Promise<SyncResult> {
  const { rows } = await pool.query<WalletRow>(
    `SELECT id, xpub_encrypted, script_type, network, gap_limit, sync_state
       FROM wallets WHERE id = $1`,
    [walletId],
  )
  const wallet = rows[0]
  if (!wallet) throw new Error('carteira ' + walletId + ' não encontrada')

  // Uma carteira já sincronizada não volta a "importando" a cada ciclo: o selo
  // ficaria piscando o tempo todo, e o usuário leria como se a carteira
  // estivesse sempre no meio de uma importação que nunca acaba.
  const reconferindo = wallet.sync_state === 'synced'
  const anunciar = async (progress: number): Promise<void> => {
    if (!reconferindo) await setState(walletId, 'importing', { progress })
  }

  try {
    await anunciar(0)

    const masterKey = process.env.MASTER_KEY_HEX
    if (!masterKey) throw new Error('MASTER_KEY_HEX ausente')
    const canonicalXpub = open(wallet.xpub_encrypted, masterKey)

    const tipHeight = await adapter.tipHeight()
    const reorgAt = await detectReorg(walletId, adapter)
    if (reorgAt !== null) await rollbackFrom(walletId, reorgAt)

    // Um reorg desfaz o que se sabia dos endereços atingidos: o status
    // guardado passa a descrever uma cadeia que não existe mais, e tudo
    // precisa ser reconferido.
    const conhecidos =
      reorgAt !== null
        ? { 0: new Map<number, string | null>(), 1: new Map<number, string | null>() }
        : await knownStatuses(walletId)

    const scanned: ScannedAddress[] = []
    for (const chain of [0, 1] as const) {
      scanned.push(
        ...(await scanGap({
          adapter,
          canonicalXpub,
          scriptType: wallet.script_type,
          network: wallet.network,
          chain,
          gapLimit: wallet.gap_limit,
          knownStatus: conhecidos[chain],
        })),
      )
      await anunciar(chain === 0 ? 50 : 90)
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
    const known = new Map<string, number | null>()
    for (const e of existing) {
      if (e.type !== 'utxo_created') continue
      known.set(e.txid + ':' + e.vout, (e.payload as { addressId?: number }).addressId ?? null)
    }
    const spent = new Set(
      existing.filter(e => e.type === 'utxo_spent').map(e => e.txid + ':' + e.vout),
    )

    const newEvents: number[] = []
    const seen = new Set<string>()
    const consultados = new Set<number>()
    let skipped = 0

    if (!adapter.getUtxosForAddress) {
      throw new Error('adapter sem listagem de UTXO por endereço')
    }

    for (const a of scanned.filter(s => s.used)) {
      if (a.unchanged) {
        // O backend afirmou que nada mudou neste endereço: pedir a lista de
        // UTXO de novo devolveria exatamente o que já está no log.
        skipped += 1
        continue
      }
      consultados.add(addressIds.get(a.address)!)

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

    for (const [key, addressId] of known) {
      if (seen.has(key) || spent.has(key)) continue
      // Sumiço só é gasto quando o endereço foi de fato perguntado nesta volta.
      // Endereço pulado — ou fora da janela do gap — não é evidência de nada,
      // e tratá-lo como evidência esvaziaria a carteira inteira num ciclo
      // silencioso.
      if (addressId === null || !consultados.has(addressId)) continue
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

    // O status só é gravado depois que os eventos da volta entraram. Gravar
    // antes faria um ciclo que morre no meio deixar o endereço marcado como
    // conferido, e o ciclo seguinte o pularia para sempre.
    for (const a of scanned) {
      await pool.query(
        'UPDATE addresses SET status = $3 WHERE wallet_id = $1 AND address = $2',
        [walletId, a.address, a.status],
      )
    }

    await setState(walletId, 'synced', { progress: 100, height: tipHeight })

    return { newEvents, reorgAt, tipHeight, skipped }
  } catch (err) {
    await setState(walletId, 'error', { error: (err as Error).message })
    throw err
  }
}
