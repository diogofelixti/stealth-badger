import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { resetDb } from './helpers/db'

async function logado() {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'pref@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'pref@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

beforeEach(async () => {
  await resetDb()
})

describe('GET /api/preferences', () => {
  // Nada ligado de fábrica: um watchtower de privacidade não começa
  // perguntando preço a cinco serviços sem que ninguém tenha pedido.
  it('cria a linha padrão, com preço e taxa desligados', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      theme: 'sett',
      currency: 'BRL',
      priceSources: [],
      feeSource: 'off',
    })
  })

  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/preferences' })).statusCode).toBe(401)
  })
})

describe('PUT /api/preferences', () => {
  it('guarda as fontes de preço escolhidas', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
      payload: { priceSources: ['coingecko', 'kraken'], currency: 'USD' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().priceSources).toEqual(['coingecko', 'kraken'])
    expect(res.json().currency).toBe('USD')
  })

  // Array vindo do cliente não vira URL sem passar por lista branca.
  it('recusa fonte de preço que não está na lista branca', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
      payload: { priceSources: ['coingecko', 'https://meu-servidor.local/preco'] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('preferences.unknownPriceSource')
    expect(res.json().error).toMatch(/coingecko/)
  })

  it('recusa fonte de taxa desconhecida', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
      payload: { feeSource: 'adivinhação' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('preferences.unknownFeeSource')
  })

  it('guarda o tema escolhido', async () => {
    const { app, cookie } = await logado()

    await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
      payload: { theme: 'bone' },
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
    })

    expect(res.json().theme).toBe('bone')
  })
})
