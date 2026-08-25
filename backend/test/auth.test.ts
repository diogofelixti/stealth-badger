import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/auth/password'
import { createSession, userIdForToken } from '../src/auth/sessions'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

beforeEach(resetDb)

describe('senha', () => {
  it('verifica o hash da própria senha', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(await verifyPassword(h, 'texugo-furtivo-2026')).toBe(true)
  })

  it('rejeita senha errada', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(await verifyPassword(h, 'texugo-furtivo-2027')).toBe(false)
  })

  it('não devolve a senha em claro no hash', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(h).not.toContain('texugo')
  })
})

describe('sessões', () => {
  it('resolve o token para o usuário', async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (email, password_hash) VALUES ('a@b.c', 'x') RETURNING id`,
    )
    const userId = Number(rows[0]!.id)
    const token = await createSession(userId)
    expect(await userIdForToken(token)).toBe(userId)
  })

  it('rejeita token desconhecido', async () => {
    expect(await userIdForToken('nao-existe')).toBeNull()
  })

  it('não guarda o token em claro no banco', async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (email, password_hash) VALUES ('d@e.f', 'x') RETURNING id`,
    )
    const token = await createSession(Number(rows[0]!.id))
    const found = await pool.query('SELECT 1 FROM sessions WHERE token_hash = $1', [
      token,
    ])
    expect(found.rowCount).toBe(0)
  })
})

describe('rotas de autenticação', () => {
  it('registra, faz login e reconhece a sessão', async () => {
    const app = buildApp()

    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    expect(reg.statusCode).toBe(201)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find(c => c.name === 'sb_session')
    expect(cookie).toBeDefined()

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sb_session: cookie!.value },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().email).toBe('dono@exemplo.com')
  })

  it('o primeiro usuário registrado vira admin', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'primeiro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const { rows } = await pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM users WHERE email = 'primeiro@exemplo.com'`,
    )
    expect(rows[0]!.is_admin).toBe(true)
  })

  it('assume português quando o registro não informa idioma', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'sem-idioma@exemplo.com', password: 'senha-bem-comprida' },
    })
    const { rows } = await pool.query<{ language: string }>(
      `SELECT language FROM users WHERE email = 'sem-idioma@exemplo.com'`,
    )
    expect(rows[0]!.language).toBe('pt')
  })

  it('guarda o idioma informado no registro', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'en@exemplo.com',
        password: 'senha-bem-comprida',
        language: 'en',
      },
    })
    const { rows } = await pool.query<{ language: string }>(
      `SELECT language FROM users WHERE email = 'en@exemplo.com'`,
    )
    expect(rows[0]!.language).toBe('en')
  })

  it('troca o idioma e devolve o novo valor em /me', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'troca@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'troca@exemplo.com', password: 'senha-bem-comprida' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value

    const put = await app.inject({
      method: 'PUT',
      url: '/api/auth/language',
      cookies: { sb_session: cookie },
      payload: { language: 'en' },
    })
    expect(put.statusCode).toBe(200)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sb_session: cookie },
    })
    expect(me.json().language).toBe('en')
  })

  it('recusa idioma não suportado', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ruim@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ruim@exemplo.com', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/language',
      cookies: { sb_session: login.cookies.find(c => c.name === 'sb_session')!.value },
      payload: { language: 'tlh' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('recusa login com senha errada', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'x@y.z', password: 'senha-bem-comprida' },
    })
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'x@y.z', password: 'errada-mas-comprida' },
    })
    expect(bad.statusCode).toBe(401)
  })
})
