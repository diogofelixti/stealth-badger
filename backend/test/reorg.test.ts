import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { pool } from '../src/db/pool'
import { activeEvents, appendEvent } from '../src/events/log'
import { detectReorg, rollbackFrom } from '../src/sync/reorg'
import { resetDb } from './helpers/db'

function adapterWithChain(hashes: Record<number, string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => Math.max(...Object.keys(hashes).map(Number)),
    blockHashAt: async (h: number) => hashes[h] ?? 'desconhecido',
  }
}

let walletId: number

beforeEach(async () => {
  await resetDb()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`,
  )
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','signet',$3) RETURNING id`,
    [u.rows[0]!.id, Buffer.from([0]), b.rows[0]!.id],
  )
  walletId = Number(w.rows[0]!.id)
})

describe('detectReorg', () => {
  it('devolve null quando os hashes conferem', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100', txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100' }))).toBeNull()
  })

  it('devolve null quando não há evento confirmado', async () => {
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100' }))).toBeNull()
  })

  it('aponta a altura em que o hash divergiu', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100', txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101', txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100', 101: 'OUTRO' }))).toBe(101)
  })

  it('recua por várias alturas até achar o ponto comum', async () => {
    for (const [h, hash] of [[100, 'h100'], [101, 'h101'], [102, 'h102']] as const) {
      await appendEvent({ walletId, type: 'utxo_created', height: h, blockHash: hash, txid: 'tx' + h, vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    }
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100', 101: 'X', 102: 'Y' }))).toBe(101)
  })
})

describe('rollbackFrom', () => {
  it('reverte eventos da altura em diante e preserva os anteriores', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100', txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101', txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })

    const reverted = await rollbackFrom(walletId, 101)
    expect(reverted).toBe(1)

    const active = await activeEvents(walletId)
    const created = active.filter(e => e.type === 'utxo_created')
    expect(created.map(e => e.txid)).toEqual(['aa'])
  })

  it('registra um evento de reorg e nunca apaga nada', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101', txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })
    await rollbackFrom(walletId, 101)

    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM chain_events WHERE wallet_id = $1',
      [walletId],
    )
    expect(Number(rows[0]!.count)).toBe(2)

    const active = await activeEvents(walletId)
    expect(active.map(e => e.type)).toEqual(['reorg_detected'])
  })
})
