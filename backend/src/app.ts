import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import type { WalletRouteOptions } from './wallet/routes'
import type { PrivacyRouteOptions } from './privacy/routes'
import { registerAlertRoutes } from './alerts/routes'
import { registerChannelRoutes, type ChannelRouteOptions } from './alerts/channels/routes'
import { registerBackendRoutes } from './chain/routes'
import { registerPrivacyRoutes } from './privacy/routes'
import { registerCoinControlRoutes } from './coincontrol/routes'
import { registerAuthRoutes } from './auth/routes'
import { registerWalletRoutes } from './wallet/routes'
import { registerSearchRoutes } from './wallet/search'
import { registerI18nRoutes } from './i18n/routes'
import { registerPreferenceRoutes } from './preferences/routes'
import { registerFeeRoutes } from './fees/routes'
import { registerPriceRoutes } from './price/routes'
import { registerAccessRoutes, type AccessRouteOptions } from './access/routes'

export type AppOptions = WalletRouteOptions &
  PrivacyRouteOptions &
  ChannelRouteOptions &
  AccessRouteOptions

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)

  app.get('/api/health', async () => ({ status: 'ok' }))
  registerAuthRoutes(app)
  registerBackendRoutes(app, opts)
  registerWalletRoutes(app, opts)
  registerSearchRoutes(app)
  registerPrivacyRoutes(app, opts)
  registerCoinControlRoutes(app)
  registerI18nRoutes(app)
  registerPreferenceRoutes(app)
  registerFeeRoutes(app)
  registerPriceRoutes(app)
  registerAccessRoutes(app, opts)
  registerAlertRoutes(app, opts)
  registerChannelRoutes(app, opts)

  return app
}
