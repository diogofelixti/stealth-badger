import type { FastifyInstance } from 'fastify'
import { loadConfig, type BackendKind } from '../config'
import { criarBackend, listarBackends, validarBackend } from './backends'

interface CriarBackendBody {
  kind: string
  url: string
  isPublic?: boolean
}

export function registerBackendRoutes(app: FastifyInstance): void {
  app.get('/api/backends', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    return reply.send(await listarBackends(req.userId, loadConfig().network))
  })

  app.post<{ Body: CriarBackendBody }>('/api/backends', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { kind, url } = req.body ?? ({} as CriarBackendBody)
    const problema = validarBackend(kind, url)
    if (problema) return reply.code(400).send({ error: problema })

    const criado = await criarBackend(
      req.userId,
      kind as BackendKind,
      url.trim(),
      req.body.isPublic ?? false,
      loadConfig().network,
    )
    return reply.code(201).send(criado)
  })
}
