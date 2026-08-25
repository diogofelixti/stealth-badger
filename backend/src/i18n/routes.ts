import type { FastifyInstance } from 'fastify'
import { CATALOG, isLang } from './catalog'

export function registerI18nRoutes(app: FastifyInstance): void {
  app.get<{ Params: { lang: string } }>('/api/i18n/:lang', async (req, reply) => {
    const { lang } = req.params
    if (!isLang(lang)) {
      return reply.code(404).send({ error: 'idioma não suportado: ' + lang })
    }
    return reply.header('cache-control', 'public, max-age=300').send(CATALOG[lang])
  })
}
