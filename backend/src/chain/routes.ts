import type { FastifyInstance } from 'fastify'
import { loadConfig, type BackendKind } from '../config'
import type { Network } from '../wallet/descriptor'
import { criarBackend, listarBackends, validarBackend } from './backends'

interface CriarBackendBody {
  kind: string
  url: string
  isPublic?: boolean
  network?: Network
}

interface ListarBackendsQuery {
  network?: Network
}

function redeValida(v: unknown): v is Network {
  return v === 'mainnet' || v === 'signet' || v === 'testnet'
}

export function registerBackendRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: ListarBackendsQuery }>('/api/backends', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const { network } = req.query
    if (network !== undefined && !redeValida(network)) {
      return reply.code(400).send({ error: 'network inválida', code: 'backend.networkRequired' })
    }
    return reply.send(await listarBackends(req.userId, network))
  })

  app.post<{ Body: CriarBackendBody }>('/api/backends', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { kind, url } = req.body ?? ({} as CriarBackendBody)
    const network = req.body.network ?? loadConfig().network
    if (!redeValida(network)) {
      return reply.code(400).send({ error: 'network obrigatória', code: 'backend.networkRequired' })
    }
    const problema = validarBackend(kind, url)
    if (problema) return reply.code(400).send(problema)

    const criado = await criarBackend(
      req.userId,
      kind as BackendKind,
      url.trim(),
      req.body.isPublic ?? false,
      network,
    )
    return reply.code(201).send(criado)
  })
}
