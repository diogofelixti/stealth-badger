import type { FastifyInstance } from 'fastify'
import { subscribeToAlerts } from '../stream/sse'
import { listarAlertas } from './store'

interface FiltroDaQuery {
  limit?: string
  cursor?: string
  type?: string
  severity?: string
  walletId?: string
  since?: string
  until?: string
}

export function registerAlertRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: FiltroDaQuery }>('/api/alerts', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const q = req.query ?? {}
    return reply.send(
      await listarAlertas(req.userId, {
        ...(q.limit ? { limit: Number(q.limit) } : {}),
        ...(q.cursor ? { cursor: q.cursor } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(q.severity ? { severity: q.severity } : {}),
        ...(q.walletId ? { walletId: Number(q.walletId) } : {}),
        ...(q.since ? { since: q.since } : {}),
        ...(q.until ? { until: q.until } : {}),
      }),
    )
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
