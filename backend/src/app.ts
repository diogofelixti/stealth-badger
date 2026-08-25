import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
