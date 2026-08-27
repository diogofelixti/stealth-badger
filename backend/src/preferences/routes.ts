import type { FastifyInstance } from 'fastify'
import { erro } from '../http/erro'
import {
  FONTES_DE_PRECO,
  FONTES_DE_TAXA,
  preferenciasDoUsuario,
  salvarPreferencias,
  type FonteDePreco,
  type FonteDeTaxa,
  type Preferencias,
} from './store'

interface CorpoDePreferencias {
  theme?: string
  currency?: string
  priceSources?: string[]
  feeSource?: string
}

export function registerPreferenceRoutes(app: FastifyInstance): void {
  app.get('/api/preferences', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    return reply.send(await preferenciasDoUsuario(req.userId))
  })

  app.put<{ Body: CorpoDePreferencias }>('/api/preferences', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const corpo = req.body ?? {}
    const mudanca: Partial<Preferencias> = {}

    if (corpo.priceSources !== undefined) {
      const desconhecida = corpo.priceSources.find(
        f => !FONTES_DE_PRECO.includes(f as FonteDePreco),
      )
      if (desconhecida !== undefined) {
        return reply.code(400).send(
          erro(
            'preferences.unknownPriceSource',
            `não conheço a fonte de preço "${desconhecida}". Aceito ` +
              FONTES_DE_PRECO.join(', ') + '.',
            { fonte: desconhecida, aceitas: FONTES_DE_PRECO.join(', ') },
          ),
        )
      }
      mudanca.priceSources = corpo.priceSources as FonteDePreco[]
    }

    if (corpo.feeSource !== undefined) {
      if (!FONTES_DE_TAXA.includes(corpo.feeSource as FonteDeTaxa)) {
        return reply.code(400).send(
          erro(
            'preferences.unknownFeeSource',
            `não conheço a fonte de taxa "${corpo.feeSource}". Aceito ` +
              FONTES_DE_TAXA.join(', ') + '.',
            { fonte: corpo.feeSource, aceitas: FONTES_DE_TAXA.join(', ') },
          ),
        )
      }
      mudanca.feeSource = corpo.feeSource as FonteDeTaxa
    }

    if (corpo.theme !== undefined) mudanca.theme = corpo.theme
    if (corpo.currency !== undefined) mudanca.currency = corpo.currency.toUpperCase()

    return reply.send(await salvarPreferencias(req.userId, mudanca))
  })
}
