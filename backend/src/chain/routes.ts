import type { FastifyInstance } from 'fastify'
import { loadConfig, type BackendKind } from '../config'
import { pool } from '../db/pool'
import { erro } from '../http/erro'
import type { Network } from '../wallet/descriptor'
import { createAdapter, type BackendRow } from './adapter'
import { criarRpc } from './core-rpc'
import { detectarNo, type SondaDoNo } from './detectar-no'
import type { ChainAdapter } from './types'
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

export interface BackendRouteOptions {
  adapterFactory?: (backend: BackendRow) => ChainAdapter
  /** injetável para o teste não precisar de um nó de verdade */
  sonda?: SondaDoNo
}

/** Pergunta ao nó quem ele é, pelo cookie que acabou de ser encontrado. */
const sondaReal: SondaDoNo = async (url, cookiePath) => {
  const rpc = criarRpc({ url, cookiePath, timeoutMs: 5_000 })
  const info = (await rpc('getblockchaininfo')) as { blocks: number; chain: string }
  return { blocks: info.blocks, chain: info.chain }
}

export function registerBackendRoutes(
  app: FastifyInstance,
  opts: BackendRouteOptions = {},
): void {
  const adapterFactory = opts.adapterFactory ?? createAdapter
  const sonda = opts.sonda ?? sondaReal

  /**
   * Procura o nó do usuário a partir do diretório de dados dele.
   *
   * Cadastrar o Core pedia host, porta, modo de autenticação e caminho do
   * cookie — quatro campos e três conceitos. Aqui é um campo: onde o nó guarda
   * os dados. A subpasta diz a rede, a rede diz a porta, e o cookie é achado.
   */
  app.post<{ Body: { datadir?: string } }>(
    '/api/backends/detect',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const datadir = req.body?.datadir?.trim()
      if (!datadir) {
        return reply
          .code(400)
          .send(erro('backend.datadirRequired', 'informe o diretório de dados do nó'))
      }
      return reply.send(await detectarNo(datadir, sonda))
    },
  )

  /**
   * A altura real da ponta, perguntada à fonte que a instância já usa.
   *
   * O rodapé do feed mostrava a maior `sync_height` entre as carteiras como se
   * fosse a ponta: com o worker atrasado, o painel anunciava uma altura velha
   * como atual. Nenhuma consulta nova a terceiro sai daqui — é a mesma fonte
   * que a carteira já consulta.
   */
  app.get('/api/chain/tip', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rows } = await pool.query<{
      id: string
      kind: string
      url: string
      is_public: boolean
      network: Network
      credentials_encrypted: Buffer | null
      wallet_id: string | null
    }>(
      `SELECT b.id, b.kind, b.url, b.is_public, b.network, b.credentials_encrypted,
              (SELECT w.id FROM wallets w
                WHERE w.backend_id = b.id AND w.user_id = $1
                ORDER BY w.id LIMIT 1) AS wallet_id
         FROM backends b
        WHERE b.user_id IS NULL OR b.user_id = $1
        ORDER BY (SELECT count(*) FROM wallets w WHERE w.backend_id = b.id AND w.user_id = $1) DESC,
                 b.user_id NULLS LAST, b.id
        LIMIT 1`,
      [req.userId],
    )
    const linha = rows[0]
    if (!linha) {
      return reply
        .code(404)
        .send(erro('backend.notFound', 'nenhuma fonte de consulta cadastrada'))
    }

    const adapter = adapterFactory({
      kind: linha.kind,
      url: linha.url,
      isPublic: linha.is_public,
      network: linha.network,
      ...(linha.wallet_id ? { walletId: Number(linha.wallet_id) } : {}),
      credentialsEncrypted: linha.credentials_encrypted,
    })
    try {
      return reply.send({
        height: await adapter.tipHeight(),
        backendHost: adapter.capabilities().host,
        isPublic: linha.is_public,
        at: new Date().toISOString(),
      })
    } catch (err) {
      return reply
        .code(502)
        .send(erro('chain.tipFailed', (err as Error).message))
    } finally {
      adapter.close?.()
    }
  })
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
