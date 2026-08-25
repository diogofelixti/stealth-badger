import { beforeEach, describe, expect, it } from 'vitest'
import { activeEvents, appendEvent } from '../src/events/log'
import { projectWallet, walletBalance } from '../src/events/project'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

let walletId: number
let addressId: number

beforeEach(async () => {
  await resetDb()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind, url, network) VALUES ('esplora','http://x','signet') RETURNING id`,
  )
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id, label, xpub_encrypted, xpub_fingerprint,
                          script_type, network, backend_id)
     VALUES ($1,'Cofre',$2,'aabbccdd','p2wpkh','signet',$3) RETURNING id`,
    [u.rows[0]!.id, Buffer.from([0]), b.rows[0]!.id],
  )
  walletId = Number(w.rows[0]!.id)
  const a = await pool.query<{ id: string }>(
    `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
     VALUES ($1,0,0,'0/0','tb1qexemplo','ff') RETURNING id`,
    [walletId],
  )
  addressId = Number(a.rows[0]!.id)
})

describe('log de eventos', () => {
  it('acrescenta e relê eventos ativos', async () => {
    await appendEvent({
      walletId,
      type: 'utxo_created',
      height: 100,
      blockHash: 'bb',
      txid: 'aa',
      vout: 0,
      payload: { addressId, valueSats: 5000 },
    })
    const events = await activeEvents(walletId)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('utxo_created')
  })

  it('omite eventos revertidos por reorg', async () => {
    const id = await appendEvent({
      walletId,
      type: 'utxo_created',
      height: 100,
      blockHash: 'bb',
      txid: 'aa',
      vout: 0,
      payload: { addressId, valueSats: 5000 },
    })
    const reorgId = await appendEvent({
      walletId,
      type: 'reorg_detected',
      height: 100,
      blockHash: null,
      txid: null,
      vout: null,
      payload: {},
    })
    await pool.query('UPDATE chain_events SET rolled_back_by = $1 WHERE id = $2', [
      reorgId,
      id,
    ])

    const active = await activeEvents(walletId)
    expect(active.map(e => e.type)).toEqual(['reorg_detected'])
  })
})

describe('projeção', () => {
  it('constrói o conjunto de UTXOs a partir do log', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1', txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'b2', txid: 'cc', vout: 1, payload: { addressId, valueSats: 3000 } })

    await projectWallet(walletId)

    const { rows } = await pool.query('SELECT * FROM utxos WHERE wallet_id = $1', [walletId])
    expect(rows).toHaveLength(2)
    expect(await walletBalance(walletId)).toBe(8000)
  })

  it('marca como gasto e tira do saldo', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1', txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await appendEvent({ walletId, type: 'utxo_spent', height: 102, blockHash: 'b3', txid: 'aa', vout: 0, payload: { spentAtTxid: 'dd' } })

    await projectWallet(walletId)
    expect(await walletBalance(walletId)).toBe(0)

    const { rows } = await pool.query<{ spent_at_txid: string }>(
      'SELECT spent_at_txid FROM utxos WHERE wallet_id = $1',
      [walletId],
    )
    expect(rows[0]!.spent_at_txid).toBe('dd')
  })

  it('é idempotente — projetar duas vezes dá o mesmo resultado', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1', txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await projectWallet(walletId)
    await projectWallet(walletId)
    const { rows } = await pool.query('SELECT * FROM utxos WHERE wallet_id = $1', [walletId])
    expect(rows).toHaveLength(1)
  })

  it('ignora eventos revertidos ao projetar', async () => {
    const id = await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1', txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    const reorgId = await appendEvent({ walletId, type: 'reorg_detected', height: 100, blockHash: null, txid: null, vout: null, payload: {} })
    await pool.query('UPDATE chain_events SET rolled_back_by = $1 WHERE id = $2', [reorgId, id])

    await projectWallet(walletId)
    expect(await walletBalance(walletId)).toBe(0)
  })
})
