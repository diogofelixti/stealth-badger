import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { appendEvent } from '../src/events/log'
import { projectWallet } from '../src/events/project'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const ENDERECO = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function comCarteira(email = 'dono@exemplo.com') {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'senha-bem-comprida' },
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
    `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash, is_used)
     VALUES ($1,0,7,'0/7',$2,'ff',true) RETURNING id`,
    [walletId, ENDERECO],
  )
  await appendEvent({
    walletId,
    type: 'utxo_created',
    height: 100,
    blockHash: 'bb',
    txid: 'aa'.repeat(32),
    vout: 0,
    payload: { addressId: Number(a.rows[0]!.id), valueSats: 3300 },
  })
  await projectWallet(walletId)
  return { app, cookie, walletId }
}

describe('GET /api/search', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/search?q=bc1' })).statusCode).toBe(401)
  })

  // O caso de uso: você tem um endereço na mão e quer saber se está sendo
  // vigiado, por qual carteira, e em que caminho de derivação.
  it('encontra o endereço vigiado e diz de qual carteira ele é', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${ENDERECO}`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toMatchObject({
      address: ENDERECO,
      walletLabel: 'Cofre',
      derivationPath: '0/7',
      used: true,
      balanceSats: 3300,
    })
  })

  it('encontra por pedaço do endereço, que é como se cola da tela', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=w508d6qe',
      cookies: { sb_session: cookie },
    })
    expect(res.json()).toHaveLength(1)
  })

  it('encontra pelo rótulo da carteira', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=cofre',
      cookies: { sb_session: cookie },
    })
    expect(res.json().length).toBeGreaterThan(0)
  })

  // Buscar endereço de outra pessoa não pode revelar que ele é vigiado por
  // alguém: a resposta é a mesma de quem não vigia nada.
  it('não encontra endereço vigiado por outro usuário', async () => {
    await comCarteira('dono@exemplo.com')

    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bisbilhoteiro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bisbilhoteiro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${ENDERECO}`,
      cookies: { sb_session: login.cookies.find(c => c.name === 'sb_session')!.value },
    })
    expect(res.json()).toEqual([])
  })

  it('devolve vazio quando a busca não casa com nada', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=zzzzzzzzzz',
      cookies: { sb_session: cookie },
    })
    expect(res.json()).toEqual([])
  })

  // Busca vazia devolvendo tudo transformaria o campo num despejo de todos os
  // endereços da carteira, que não é o que ninguém pediu ao digitar nada.
  it('não devolve tudo quando a busca está vazia', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=',
      cookies: { sb_session: cookie },
    })
    expect(res.json()).toEqual([])
  })

  it('não deixa a busca devolver a carteira inteira de uma vez', async () => {
    const { app, cookie, walletId } = await comCarteira()
    for (let i = 0; i < 60; i += 1) {
      await pool.query(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
         VALUES ($1,0,$2,$3,$4,'ff')`,
        [walletId, 100 + i, '0/' + (100 + i), 'bc1qbusca' + String(i).padStart(3, '0')],
      )
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=bc1qbusca',
      cookies: { sb_session: cookie },
    })
    expect(res.json().length).toBeLessThanOrEqual(50)
  })
})
