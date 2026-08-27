import type { FastifyInstance } from 'fastify'
import { loadConfig, type BackendKind } from '../config'
import type { Network } from '../wallet/descriptor'
import {
  criarBackend,
  listarBackends,
  montarDoPreset,
  validarBackend,
  type AuthDoBackend,
} from './backends'

interface CriarBackendBody {
  kind?: string
  url?: string
  isPublic?: boolean
  network?: Network
  /** escolha do catálogo; quando vem, host/porta/url são o que ele pede */
  preset?: string
  host?: string
  port?: number
  label?: string
  auth?: AuthDoBackend
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

    // Duas portas de entrada para a mesma mesa: o catálogo, que a tela usa, e
    // `kind` + `url` crus, que é como a instância cadastra o backend global e
    // como quem consome a API direto sempre pôde fazer.
    if (req.body.preset) {
      const montagem = montarDoPreset(
        {
          preset: req.body.preset,
          ...(req.body.host !== undefined ? { host: req.body.host } : {}),
          ...(req.body.port !== undefined ? { port: req.body.port } : {}),
          ...(req.body.url !== undefined ? { url: req.body.url } : {}),
          ...(req.body.isPublic !== undefined ? { isPublic: req.body.isPublic } : {}),
          ...(req.body.label !== undefined ? { label: req.body.label } : {}),
          ...(req.body.auth !== undefined ? { auth: req.body.auth } : {}),
        },
        network,
      )
      if ('problema' in montagem) return reply.code(400).send(montagem.problema)

      const { montado } = montagem
      const invalida = validarBackend(montado.kind, montado.url)
      if (invalida) return reply.code(400).send(invalida)

      return reply.code(201).send(
        await criarBackend(req.userId, montado.kind, montado.url, montado.isPublic, network, {
          preset: montado.preset,
          label: montado.label,
          credenciais: montado.credenciais,
        }),
      )
    }

    const problema = validarBackend(kind ?? '', url ?? '')
    if (problema) return reply.code(400).send(problema)

    const criado = await criarBackend(
      req.userId,
      kind as BackendKind,
      url!.trim(),
      req.body.isPublic ?? false,
      network,
    )
    return reply.code(201).send(criado)
  })
}
