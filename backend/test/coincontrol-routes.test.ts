import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { appendEvent } from '../src/events/log'
import { projectWallet } from '../src/events/project'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const TXID = 'aa'.repeat(32)

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function comUtxo() {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
  const criada = await app.inject({
    method: 'POST',
    url: '/api/wallets',
    cookies: { sb_session: cookie },
    payload: { label: 'Cofre', key: ZPUB },
  })
  const walletId = Number(criada.json().id)

  const a = await pool.query<{ id: string }>(
    `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
     VALUES ($1,0,0,'0/0','bc1qexemplo','ff') RETURNING id`,
    [walletId],
  )
  await appendEvent({
    walletId,
    type: 'utxo_created',
    height: 100,
    blockHash: 'bb',
    txid: TXID,
    vout: 0,
    payload: { addressId: Number(a.rows[0]!.id), valueSats: 5000 },
  })
  await projectWallet(walletId)
  return { app, cookie, walletId }
}

describe('GET /api/wallets/:id/utxos', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect(
      (await app.inject({ method: 'GET', url: '/api/wallets/1/utxos' })).statusCode,
    ).toBe(401)
  })

  it('lista os UTXOs com valor, endereço e caminho de derivação', async () => {
    const { app, cookie, walletId } = await comUtxo()
    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()[0]).toMatchObject({
      txid: TXID,
      vout: 0,
      valueSats: 5000,
      spent: false,
      spentAtTxid: null,
      address: 'bc1qexemplo',
      derivationPath: '0/0',
      frozen: false,
      tags: [],
    })
  })

  it('lista UTXO gasto como histórico da carteira', async () => {
    const { app, cookie, walletId } = await comUtxo()
    await appendEvent({
      walletId,
      type: 'utxo_spent',
      height: 101,
      blockHash: 'cc',
      txid: TXID,
      vout: 0,
      payload: { spentAtTxid: 'bb'.repeat(32) },
    })
    await projectWallet(walletId)

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })

    expect(res.json()[0]).toMatchObject({
      txid: TXID,
      spent: true,
      spentAtTxid: 'bb'.repeat(32),
    })
  })
})

describe('PUT /api/wallets/:id/utxos/:txid/:vout', () => {
  it('grava rótulo, tags e congelamento', async () => {
    const { app, cookie, walletId } = await comUtxo()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wallets/${walletId}/utxos/${TXID}/0`,
      cookies: { sb_session: cookie },
      payload: { label: 'do faucet', tags: ['nao-kyc'], frozen: true },
    })
    expect(res.statusCode).toBe(200)

    const lista = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({
      label: 'do faucet',
      tags: ['nao-kyc'],
      frozen: true,
    })
  })

  it('recusa marcar UTXO de carteira alheia', async () => {
    const dono = await comUtxo()
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wallets/${dono.walletId}/utxos/${TXID}/0`,
      cookies: { sb_session: login.cookies.find(c => c.name === 'sb_session')!.value },
      payload: { frozen: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('rótulos BIP-329', () => {
  it('exporta em JSON Lines, com nome de arquivo para salvar', async () => {
    const { app, cookie, walletId } = await comUtxo()
    await app.inject({
      method: 'PUT',
      url: `/api/wallets/${walletId}/utxos/${TXID}/0`,
      cookies: { sb_session: cookie },
      payload: { label: 'do faucet', frozen: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/labels`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/\.jsonl/)
    expect(JSON.parse(res.body.trim())).toMatchObject({
      type: 'output',
      ref: `${TXID}:0`,
      label: 'do faucet',
      spendable: false,
    })
  })

  it('importa o arquivo de outra carteira e passa a mostrar os rótulos', async () => {
    const { app, cookie, walletId } = await comUtxo()
    const arquivo =
      JSON.stringify({
        type: 'output',
        ref: `${TXID}:0`,
        label: 'veio do Sparrow',
        spendable: false,
      }) + '\n'

    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/labels`,
      cookies: { sb_session: cookie },
      headers: { 'content-type': 'text/plain' },
      payload: arquivo,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ imported: 1, ignored: 0 })

    const lista = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({ label: 'veio do Sparrow', frozen: true })
  })

  // Importar rótulo de saída que não é desta carteira encheria o banco de
  // marcas órfãs vindas do arquivo de outra pessoa.
  it('conta como ignorada a saída que não pertence a esta carteira', async () => {
    const { app, cookie, walletId } = await comUtxo()
    const arquivo =
      JSON.stringify({ type: 'output', ref: `${'99'.repeat(32)}:0`, label: 'de outra' }) +
      '\n'

    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/labels`,
      cookies: { sb_session: cookie },
      headers: { 'content-type': 'text/plain' },
      payload: arquivo,
    })
    expect(res.json()).toMatchObject({ imported: 0, ignored: 1 })
  })

  // A spec diz que omitir `spendable` manda preservar o que já existe.
  // Importar de uma carteira que não escreve o campo descongelaria em silêncio
  // tudo que o usuário tinha congelado — e congelamento é a decisão de coin
  // control mais direta que existe: "não gaste este".
  it('não descongela o que o arquivo importado não menciona', async () => {
    const { app, cookie, walletId } = await comUtxo()
    await app.inject({
      method: 'PUT',
      url: `/api/wallets/${walletId}/utxos/${TXID}/0`,
      cookies: { sb_session: cookie },
      payload: { frozen: true },
    })

    const arquivo =
      JSON.stringify({ type: 'output', ref: `${TXID}:0`, label: 'só o rótulo' }) + '\n'
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/labels`,
      cookies: { sb_session: cookie },
      headers: { 'content-type': 'text/plain' },
      payload: arquivo,
    })

    const lista = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({ label: 'só o rótulo', frozen: true })
  })

  it('descongela quando o arquivo diz explicitamente que é gastável', async () => {
    const { app, cookie, walletId } = await comUtxo()
    await app.inject({
      method: 'PUT',
      url: `/api/wallets/${walletId}/utxos/${TXID}/0`,
      cookies: { sb_session: cookie },
      payload: { frozen: true },
    })

    const arquivo =
      JSON.stringify({ type: 'output', ref: `${TXID}:0`, label: 'x', spendable: true }) +
      '\n'
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/labels`,
      cookies: { sb_session: cookie },
      headers: { 'content-type': 'text/plain' },
      payload: arquivo,
    })

    const lista = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/utxos`,
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({ frozen: false })
  })
})
