import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app'
import { resetDb } from './helpers/db'

async function logado() {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'acesso@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'acesso@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

const AMBIENTE = { ...process.env }

beforeEach(async () => {
  await resetDb()
  delete process.env.TOR_HOSTNAME_PATH
  delete process.env.TAILSCALE_HOSTNAME
  delete process.env.CLOUDFLARE_HOSTNAME
})

describe('GET /api/access', () => {
  // O caso comum: quem não usa túnel nenhum. Ler arquivo que não existe não
  // pode derrubar a página.
  it('sem nada configurado, os três caminhos vêm desligados e nada quebra', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      tor: { enabled: false },
      tailscale: { enabled: false },
      cloudflare: { enabled: false },
    })
  })

  it('com o hostname do hidden service montado, o .onion aparece', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-tor-'))
    const caminho = join(dir, 'hostname')
    writeFileSync(caminho, 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion\n')
    process.env.TOR_HOSTNAME_PATH = caminho
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tor).toMatchObject({
      enabled: true,
      onion: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion',
    })
  })

  // A linha da Cloudflare não é nota de rodapé: quem termina o TLS enxerga o
  // tráfego em claro, e um watchtower de privacidade que esconde isso está
  // fazendo com o próprio usuário o que denuncia nos exploradores públicos.
  it('a Cloudflare vem sempre com o aviso de que ela enxerga o tráfego', async () => {
    process.env.CLOUDFLARE_HOSTNAME = 'painel.exemplo.com'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().cloudflare).toMatchObject({
      enabled: true,
      hostname: 'painel.exemplo.com',
      warning: true,
    })
  })

  it('o Tailscale aparece pelo hostname do container', async () => {
    process.env.TAILSCALE_HOSTNAME = 'badger.tail1234.ts.net'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tailscale).toMatchObject({
      enabled: true,
      hostname: 'badger.tail1234.ts.net',
    })
  })

  it('recusa sem autenticação: por onde o painel é alcançável não é dado público', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/access' })).statusCode).toBe(401)
  })
})

afterEach(() => {
  process.env = { ...AMBIENTE }
})
