import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { registerAlertRoutes } from './alerts/routes'
import { registerAuthRoutes } from './auth/routes'
import { registerWalletRoutes } from './wallet/routes'
import { registerI18nRoutes } from './i18n/routes'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)

  app.get('/api/health', async () => ({ status: 'ok' }))
  registerAuthRoutes(app)
  registerWalletRoutes(app)
  registerI18nRoutes(app)
  registerAlertRoutes(app)

  return app
}
