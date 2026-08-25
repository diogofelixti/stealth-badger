import { beforeEach, describe, expect, it } from 'vitest'
import { open } from '../src/crypto/secretbox'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

async function loggedInApp() {
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
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

beforeEach(resetDb)

describe('POST /api/wallets', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      payload: { label: 'x', key: ZPUB },
    })
    expect(res.statusCode).toBe(401)
  })

  it('cadastra a carteira e guarda o xpub cifrado', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().scriptType).toBe('p2wpkh')
    expect(res.json().syncState).toBe('pending')

    const { rows } = await pool.query<{ xpub_encrypted: Buffer }>(
      'SELECT xpub_encrypted FROM wallets',
    )
    expect(rows[0]!.xpub_encrypted.toString('utf8')).not.toContain('zpub')
    expect(open(rows[0]!.xpub_encrypted, process.env.MASTER_KEY_HEX!)).toContain('pub')
  })

  it('nunca devolve o xpub na resposta da API', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(JSON.stringify(res.json())).not.toContain('pub6')
  })

  it('recusa chave privada estendida com mensagem clara', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: {
        label: 'Perigo',
        key: 'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/watch-only|privada/i)
  })

  it('lista a carteira com o que a tela precisa mostrar', async () => {
    const { app, cookie } = await loggedInApp()
    await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    const [w] = lista.json()
    expect(w).toMatchObject({
      label: 'Cofre',
      scriptType: 'p2wpkh',
      syncState: 'pending',
      balanceSats: '0',
      utxoCount: 0,
      backendIsPublic: true,
    })
    expect(w.backendUrl).toMatch(/^https?:\/\//)
    expect(JSON.stringify(w)).not.toContain('pub6')
  })

  it('lista apenas as carteiras do próprio usuário', async () => {
    const { app, cookie } = await loggedInApp()
    await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const outro = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: outro.cookies.find(c => c.name === 'sb_session')!.value },
    })
    expect(lista.json()).toEqual([])
  })
})
