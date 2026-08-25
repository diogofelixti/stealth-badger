import type { FastifyInstance } from 'fastify'
import { subscribeToAlerts } from '../stream/sse'
import { recentAlerts } from './store'

export function registerAlertRoutes(app: FastifyInstance): void {
  app.get('/api/alerts', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    return reply.send(await recentAlerts(req.userId))
  })

  app.get('/api/stream', (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': conectado\n\n')

    const unsubscribe = subscribeToAlerts(req.userId, payload => {
      reply.raw.write('event: alert\n')
      reply.raw.write('data: ' + JSON.stringify(payload) + '\n\n')
    })

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000)
    req.raw.on('close', () => {
      clearInterval(keepAlive)
      unsubscribe()
    })
  })
}
