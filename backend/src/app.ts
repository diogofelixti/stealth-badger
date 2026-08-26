import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import type { WalletRouteOptions } from './wallet/routes'
import { registerAlertRoutes } from './alerts/routes'
import { registerBackendRoutes } from './chain/routes'
import { registerAuthRoutes } from './auth/routes'
import { registerWalletRoutes } from './wallet/routes'
import { registerI18nRoutes } from './i18n/routes'

export function buildApp(opts: WalletRouteOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)

  app.get('/api/health', async () => ({ status: 'ok' }))
  registerAuthRoutes(app)
  registerBackendRoutes(app)
  registerWalletRoutes(app, opts)
  registerI18nRoutes(app)
  registerAlertRoutes(app)

  return app
}
