import type { FastifyInstance } from 'fastify'
import { preferenciasDoUsuario } from '../preferences/store'
import { buscarPrecos } from './service'

/**
 * O preço do bitcoin, pelas fontes que o usuário ligou — nenhuma por padrão.
 *
 * A requisição sai daqui, do servidor, e não do navegador: do navegador, cada
 * usuário entregaria o próprio IP a cada serviço de preço.
 */
export function registerPriceRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { currency?: string } }>('/api/price', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const prefs = await preferenciasDoUsuario(req.userId)
    const moeda = (req.query.currency ?? prefs.currency).toUpperCase()
    return reply.send(await buscarPrecos(prefs.priceSources, moeda))
  })
}
