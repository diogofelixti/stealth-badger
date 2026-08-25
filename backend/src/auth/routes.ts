import type { FastifyInstance, FastifyRequest } from 'fastify'
import { pool } from '../db/pool'
import { hashPassword, verifyPassword } from './password'
import { createSession, destroySession, userIdForToken } from './sessions'

const COOKIE = 'sb_session'

type Language = 'pt' | 'en'

interface Credentials {
  email: string
  password: string
  language?: Language
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.decorateRequest('userId', null)

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const token = req.cookies[COOKIE]
    req.userId = token ? await userIdForToken(token) : null
  })

  app.post<{ Body: Credentials }>('/api/auth/register', async (req, reply) => {
    const { email, password } = req.body
    if (!email?.includes('@') || !password || password.length < 12) {
      return reply
        .code(400)
        .send({ error: 'e-mail inválido ou senha com menos de 12 caracteres' })
    }

    const { rows: existing } = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM users',
    )
    const isFirst = Number(existing[0]!.n) === 0
    const language: Language = req.body.language === 'en' ? 'en' : 'pt'

    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, is_admin, language)
         VALUES ($1, $2, $3, $4)`,
        [email, await hashPassword(password), isFirst, language],
      )
    } catch {
      return reply.code(409).send({ error: 'e-mail já cadastrado' })
    }

    return reply.code(201).send({ ok: true, isAdmin: isFirst })
  })

  app.post<{ Body: Credentials }>('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body
    const { rows } = await pool.query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email],
    )
    const user = rows[0]
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return reply.code(401).send({ error: 'credenciais inválidas' })
    }

    const token = await createSession(Number(user.id))
    return reply
      .setCookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30,
      })
      .send({ ok: true })
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE]
    if (token) await destroySession(token)
    return reply.clearCookie(COOKIE, { path: '/' }).send({ ok: true })
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const { rows } = await pool.query<{
      email: string
      is_admin: boolean
      language: Language
    }>('SELECT email, is_admin, language FROM users WHERE id = $1', [req.userId])
    const user = rows[0]
    if (!user) return reply.code(401).send({ error: 'não autenticado' })

    return reply.send({
      email: user.email,
      isAdmin: user.is_admin,
      language: user.language,
    })
  })

  // O idioma vive no usuário, porque push é renderizado no servidor.
  app.put<{ Body: { language: Language } }>(
    '/api/auth/language',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
      const { language } = req.body
      if (language !== 'pt' && language !== 'en') {
        return reply.code(400).send({ error: `idioma não suportado: ${language}` })
      }
      await pool.query('UPDATE users SET language = $2 WHERE id = $1', [
        req.userId,
        language,
      ])
      return reply.send({ ok: true, language })
    },
  )
}
