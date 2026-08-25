import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter, TxRef, Utxo } from '../src/chain/types'
import { seal } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { walletBalance } from '../src/events/project'
import { syncWallet } from '../src/sync/engine'
import { deriveAddress } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const KEY = 'c'.repeat(64)

function adapterWith(
  history: Record<string, TxRef[]>,
  utxos: Record<string, Utxo[]>,
  tip = 200,
): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => tip,
    blockHashAt: async (h: number) => 'h' + h,
    getHistoryForAddress: async (a: string) => history[a] ?? [],
    getUtxosForAddress: async (a: string) => utxos[a] ?? [],
  }
}

let walletId: number
let firstAddress: string

beforeEach(async () => {
  await resetDb()
  process.env.MASTER_KEY_HEX = KEY
  const parsed = parseExtendedKey(ZPUB)
  firstAddress = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','mainnet') RETURNING id`,
  )
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','mainnet',3,$3) RETURNING id`,
    [u.rows[0]!.id, seal(parsed.canonicalXpub, KEY), b.rows[0]!.id],
  )
  walletId = Number(w.rows[0]!.id)
})

describe('syncWallet', () => {
  it('grava os endereços derivados e marca a carteira como sincronizada', async () => {
    await syncWallet(walletId, adapterWith({}, {}))
    const { rows } = await pool.query('SELECT * FROM addresses WHERE wallet_id = $1', [walletId])
    expect(rows.length).toBeGreaterThan(0)

    const w = await pool.query<{ sync_state: string }>(
      'SELECT sync_state FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(w.rows[0]!.sync_state).toBe('synced')
  })

  it('cria evento e projeta saldo ao encontrar UTXO', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    const result = await syncWallet(walletId, adapter)
    expect(result.newEvents).toHaveLength(1)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('é idempotente — sincronizar de novo não duplica eventos', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, adapter)
    const second = await syncWallet(walletId, adapter)

    expect(second.newEvents).toHaveLength(0)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('emite utxo_spent quando o UTXO some da lista', async () => {
    const comUtxo = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, comUtxo)

    const gasto = adapterWith(
      { [firstAddress]: [
        { txid: 'aa', height: 100, blockHash: 'h100' },
        { txid: 'zz', height: 105, blockHash: 'h105' },
      ] },
      { [firstAddress]: [] },
    )
    await syncWallet(walletId, gasto)
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('registra estado de erro em vez de estourar quando o backend falha', async () => {
    const quebrado: ChainAdapter = {
      ...adapterWith({}, {}),
      tipHeight: async () => {
        throw new Error('explorador fora do ar')
      },
    }
    await expect(syncWallet(walletId, quebrado)).rejects.toThrow()
    const w = await pool.query<{ sync_state: string; sync_error: string }>(
      'SELECT sync_state, sync_error FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(w.rows[0]!.sync_state).toBe('error')
    expect(w.rows[0]!.sync_error).toMatch(/fora do ar/)
  })
})
