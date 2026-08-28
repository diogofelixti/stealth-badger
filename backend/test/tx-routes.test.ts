import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { aguardarTxScan } from '../src/privacy/andamento'
import type { AppOptions } from '../src/app'
import { resetDb } from './helpers/db'

const TXID = 'ab'.repeat(32)

function adapterQueSabe(): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: true,
      host: 'falso',
    }),
    tipHeight: async () => 200,
    blockHashAt: async () => 'h',
    getTransaction: async (txid: string) => ({
      txid,
      height: 195,
      blockHash: '000000abc',
      vin: [{ txid: 'cd'.repeat(32), vout: 1, address: 'tb1qorigem', value: 60000 }],
      vout: [{ n: 0, address: 'tb1qdestino', value: 51000 }],
      fee: 300,
    }),
  }
}

function adapterQueNaoSabe(): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: false,
      needsRegistration: true,
      supportsSubscribe: false,
      hasTxIndex: false,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => 200,
    blockHashAt: async () => 'h',
  }
}

function adapterQueFalha(): ChainAdapter {
  return {
    ...adapterQueSabe(),
    getTransaction: async () => {
      throw new Error('Too many requests')
    },
  }
}

async function cenario(fabrica: () => ChainAdapter, opts: AppOptions = {}) {
  process.env.NETWORK = 'signet'
  const app = buildApp({ ...opts, adapterFactory: fabrica })
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'tx@exemplo.com', password: 'senha-longa-de-teste' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'tx@exemplo.com', password: 'senha-longa-de-teste' },
  })
  const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
  const { rows: u } = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'tx@exemplo.com'",
  )
  const { rows: b } = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://y','signet') RETURNING id`,
  )
  const { rows: w } = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
     VALUES ($1,'Cofre',$2,'aabb','p2wpkh','signet',$3) RETURNING id`,
    [u[0]!.id, Buffer.from([0]), b[0]!.id],
  )
  return { app, cookie, walletId: Number(w[0]!.id) }
}

beforeEach(async () => {
  await resetDb()
})

describe('privacidade da transação', () => {
  it('analisa score, achados e Boltzmann da transação sob demanda', async () => {
    const { app, cookie, walletId } = await cenario(adapterQueSabe, {
      txScanner: async ctx => ({
        score: 0,
        grade: 'F',
        txType: 'simple-payment',
        txInfo: { inputs: 2, outputs: 2, changeRevealed: true, txid: ctx.txid },
        chainAnalysis: { entityCluster: 'exchange', reusedCounterparties: 12 },
        findings: [
          {
            id: 'tx-change-revealed',
            severity: 'critical',
            confidence: 'deterministic',
            title: 'Troco revelado',
            description: 'Mesmo endereço aparece na entrada e na saída.',
            recommendation: {
              urgency: 'alta',
              headline: 'Separe este troco',
              text: 'Não junte esta saída com fundos limpos.',
              tools: [{ name: 'Whirlpool', url: 'https://sparrowwallet.com/docs/mixing-whirlpool.html' }],
            },
            scoreImpact: -90,
            params: {},
          },
        ],
        scannerVersion: '0.34.2',
      }),
      boltzmannScanner: async () => ({
        entropy: 0,
        matrix: [[1, 1], [1, 1]],
      }),
    })

    const post = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/tx/${TXID}/privacy`,
      cookies: { sb_session: cookie },
    })
    expect(post.statusCode).toBe(202)
    await aguardarTxScan(walletId, TXID)

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/tx/${TXID}/privacy`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().latest).toMatchObject({
      txid: TXID,
      score: 0,
      grade: 'F',
      txType: 'simple-payment',
      txInfo: { changeRevealed: true },
      chainAnalysis: { reusedCounterparties: 12 },
      boltzmann: { entropy: 0, matrix: [[1, 1], [1, 1]] },
    })
    expect(res.json().latest.findings[0].recommendation.headline).toBe('Separe este troco')
  })
})

describe('GET /api/tx/:txid', () => {
  it('traz entradas e saídas pela fonte da carteira', async () => {
    const { app, cookie, walletId } = await cenario(adapterQueSabe)

    const res = await app.inject({
      method: 'GET',
      url: `/api/tx/${TXID}?walletId=${walletId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ txid: TXID, height: 195, fee: 300 })
    expect(res.json().vout[0].value).toBe(51000)
  })

  // A regra da §6.3: quando a fonte não sabe responder, dizer que não sabe.
  it('diz que a fonte não sabe contar a transação, em vez de inventar', async () => {
    const { app, cookie, walletId } = await cenario(adapterQueNaoSabe)

    const res = await app.inject({
      method: 'GET',
      url: `/api/tx/${TXID}?walletId=${walletId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(501)
    expect(res.json().code).toBe('tx.unsupportedByBackend')
  })

  it('devolve o motivo quando a fonte recusa', async () => {
    const { app, cookie, walletId } = await cenario(adapterQueFalha)

    const res = await app.inject({
      method: 'GET',
      url: `/api/tx/${TXID}?walletId=${walletId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(502)
    expect(res.json().code).toBe('tx.backendFailed')
    expect(res.json().error).toMatch(/Too many requests/)
  })

  it('recusa consultar pela carteira de outro usuário', async () => {
    const { app, cookie, walletId } = await cenario(adapterQueSabe)
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alheio-tx@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alheio-tx@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const outro = login.cookies.find(c => c.name === 'sb_session')!.value

    const res = await app.inject({
      method: 'GET',
      url: `/api/tx/${TXID}?walletId=${walletId}`,
      cookies: { sb_session: outro },
    })

    expect(res.statusCode).toBe(404)
    void cookie
  })
})
