import { beforeEach, describe, expect, it } from 'vitest'
import { appendEvent } from '../src/events/log'
import { projectWallet } from '../src/events/project'
import { pool } from '../src/db/pool'
import { marcarUtxo, marcasDaCarteira, utxosDaCarteira } from '../src/coincontrol/marks'
import { resetDb } from './helpers/db'

let walletId: number
let addressId: number

async function utxo(txid: string, vout: number, valor: number): Promise<void> {
  await appendEvent({
    walletId,
    type: 'utxo_created',
    height: 100,
    blockHash: 'bb',
    txid,
    vout,
    payload: { addressId, valueSats: valor },
  })
}

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

describe('marcas de coin control', () => {
  // A tabela `utxos` é projeção: `projectWallet` a apaga e reconstrói a cada
  // ciclo. Rótulo, tag e congelamento são dados do usuário, não derivados do
  // log — se morarem lá, cada sincronização os apaga em silêncio, e o usuário
  // descobre que congelou um UTXO que voltou a ser gastável sozinho.
  it('o congelamento sobrevive à reconstrução da projeção', async () => {
    await utxo('aa', 0, 5000)
    await projectWallet(walletId)
    await marcarUtxo(walletId, 'aa', 0, { frozen: true })

    await projectWallet(walletId)

    const [u] = await utxosDaCarteira(walletId)
    expect(u!.frozen).toBe(true)
  })

  it('o rótulo e as tags sobrevivem à reconstrução da projeção', async () => {
    await utxo('aa', 0, 5000)
    await projectWallet(walletId)
    await marcarUtxo(walletId, 'aa', 0, { label: 'troco do café', tags: ['nao-kyc'] })

    await projectWallet(walletId)

    const [u] = await utxosDaCarteira(walletId)
    expect(u!.label).toBe('troco do café')
    expect(u!.tags).toEqual(['nao-kyc'])
  })

  it('marcar de novo altera só o que foi informado', async () => {
    await utxo('aa', 0, 5000)
    await projectWallet(walletId)
    await marcarUtxo(walletId, 'aa', 0, { label: 'do faucet', tags: ['nao-kyc'] })
    await marcarUtxo(walletId, 'aa', 0, { frozen: true })

    const [u] = await utxosDaCarteira(walletId)
    expect(u!.label).toBe('do faucet')
    expect(u!.tags).toEqual(['nao-kyc'])
    expect(u!.frozen).toBe(true)
  })

  it('lista os UTXOs com valor, altura e endereço para a tela de coin control', async () => {
    await utxo('aa', 0, 5000)
    await utxo('bb', 1, 700)
    await projectWallet(walletId)

    const lista = await utxosDaCarteira(walletId)
    expect(lista).toHaveLength(2)
    expect(lista.map(u => u.valueSats).sort((x, y) => x - y)).toEqual([700, 5000])
    expect(lista[0]!.address).toBe('tb1qexemplo')
  })

  it('devolve UTXO já gasto como histórico da tela de coin control', async () => {
    await utxo('aa', 0, 5000)
    await appendEvent({
      walletId,
      type: 'utxo_spent',
      height: 110,
      blockHash: 'cc',
      txid: 'aa',
      vout: 0,
      payload: { spentAtTxid: 'zz' },
    })
    await projectWallet(walletId)

    expect(await utxosDaCarteira(walletId)).toMatchObject([
      { txid: 'aa', vout: 0, spent: true, spentAtTxid: 'zz' },
    ])
  })

  // Marca de UTXO já gasto continua guardada: o histórico do BIP-329 vale para
  // saída gasta também, e apagar destruiria rótulo que o usuário escreveu.
  it('guarda a marca mesmo depois de o UTXO ser gasto', async () => {
    await utxo('aa', 0, 5000)
    await projectWallet(walletId)
    await marcarUtxo(walletId, 'aa', 0, { label: 'guardado' })

    await appendEvent({
      walletId,
      type: 'utxo_spent',
      height: 110,
      blockHash: 'cc',
      txid: 'aa',
      vout: 0,
      payload: { spentAtTxid: 'zz' },
    })
    await projectWallet(walletId)

    const marcas = await marcasDaCarteira(walletId)
    expect(marcas.find(m => m.txid === 'aa')!.label).toBe('guardado')
  })
})
