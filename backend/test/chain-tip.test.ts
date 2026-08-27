import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

function adapterNaPonta(altura: number): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: true,
      host: 'mempool.space',
    }),
    tipHeight: async () => altura,
    blockHashAt: async () => 'h',
  }
}

async function cenario(altura: number) {
  process.env.NETWORK = 'signet'
  const app = buildApp({ adapterFactory: () => adapterNaPonta(altura) })
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'ponta@exemplo.com', password: 'senha-longa-de-teste' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'ponta@exemplo.com', password: 'senha-longa-de-teste' },
  })
  const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
  const { rows: u } = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'ponta@exemplo.com'",
  )
  const { rows: b } = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network,is_public) VALUES ('esplora','https://mempool.space/signet/api','signet',true) RETURNING id`,
  )
  // a carteira está atrás da ponta de propósito
  await pool.query(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id,sync_height)
     VALUES ($1,'Cofre',$2,'aabb','p2wpkh','signet',$3,319560)`,
    [u[0]!.id, Buffer.from([0]), b[0]!.id],
  )
  return { app, cookie }
}

beforeEach(async () => {
  await resetDb()
})

describe('GET /api/chain/tip', () => {
  // O rodapé mostrava a maior `sync_height` entre as carteiras como se fosse a
  // ponta da cadeia: com o worker atrasado, o painel anunciava altura velha
  // como atual.
  it('vem do adapter, e não da maior sync_height guardada', async () => {
    const { app, cookie } = await cenario(319578)

    const res = await app.inject({
      method: 'GET',
      url: '/api/chain/tip',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().height).toBe(319578)
    expect(res.json().height).not.toBe(319560)
    expect(res.json()).toMatchObject({ backendHost: 'mempool.space', isPublic: true })
  })

  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/chain/tip' })).statusCode).toBe(401)
  })
})
