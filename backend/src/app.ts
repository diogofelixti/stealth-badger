import Fastify, { type FastifyInstance } from 'fastify'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
