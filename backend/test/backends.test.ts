import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function logado(email = 'dono@exemplo.com') {
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
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

describe('GET /api/backends', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/backends' })).statusCode).toBe(401)
  })

  it('lista o backend configurado mesmo antes da primeira carteira', async () => {
    // a tela de cadastro precisa de pelo menos uma opção para oferecer
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toMatchObject({ kind: 'esplora', scope: 'global' })
  })

  it('não devolve o backend de outro usuário', async () => {
    const a = await logado('a@exemplo.com')
    await a.app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: a.cookie },
      payload: { kind: 'electrum', url: 'electrum://so-meu:50001', isPublic: false },
    })

    const b = await logado('b@exemplo.com')
    const res = await b.app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: b.cookie },
    })
    expect(JSON.stringify(res.json())).not.toContain('so-meu')
  })
})

describe('POST /api/backends', () => {
  it('cadastra backend próprio e passa a oferecê-lo na lista', async () => {
    const { app, cookie } = await logado()
    const criado = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'electrum', url: 'electrum://127.0.0.1:50001', isPublic: false },
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toMatchObject({ kind: 'electrum', isPublic: false, scope: 'own' })

    const lista = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()).toHaveLength(2)
  })

  it('recusa tipo de backend sem adapter, nomeando o que aceita', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'pombo-correio', url: 'http://127.0.0.1:8332', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/esplora/)
    expect(res.json().error).toMatch(/electrum/)
  })

  it('exige que o endereço do Electrum use o esquema electrum://', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'electrum', url: '127.0.0.1:50001', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/electrum:\/\//)
  })

  it('aceita um backend de Bitcoin Core apontando para o RPC do nó', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'core', url: 'http://127.0.0.1:38332', isPublic: false },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().kind).toBe('core')
  })

  // O RPC do Core fala HTTP, não o protocolo do Electrum. Aceitar o esquema
  // errado só adiaria a falha para o primeiro ciclo do worker, longe daqui.
  it('exige http ou https no RPC do Core', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'core', url: 'electrum://127.0.0.1:50001', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/https?/)
  })

  it('exige http ou https no Esplora', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'esplora', url: 'electrum://x:50001', isPublic: true },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/https?/)
  })
})

describe('POST /api/wallets com backend escolhido', () => {
  async function backendProprio(app: ReturnType<typeof buildApp>, cookie: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'esplora', url: 'http://meu-esplora:3002', isPublic: false },
    })
    return res.json().id as number
  }

  it('vigia a carteira pelo backend escolhido, e não pelo configurado', async () => {
    const { app, cookie } = await logado()
    const backendId = await backendProprio(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB, backendId },
    })
    expect(res.statusCode).toBe(201)

    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({
      backendUrl: 'http://meu-esplora:3002',
      backendIsPublic: false,
    })
  })

  it('continua usando o backend configurado quando nenhum é escolhido', async () => {
    const { app, cookie } = await logado()
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
    expect(lista.json()[0].backendUrl).toMatch(/mempool\.space/)
  })

  it('recusa vigiar por backend que pertence a outro usuário', async () => {
    const a = await logado('a@exemplo.com')
    const alheio = await backendProprio(a.app, a.cookie)

    const b = await logado('b@exemplo.com')
    const res = await b.app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: b.cookie },
      payload: { label: 'Cofre', key: ZPUB, backendId: alheio },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/backend/i)
  })
})
