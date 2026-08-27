import type { FastifyInstance } from 'fastify'
import { subscribeToAlerts } from '../stream/sse'
import { createAdapter, type BackendRow } from '../chain/adapter'
import type { ChainAdapter } from '../chain/types'
import type { Network } from '../wallet/descriptor'
import { pool } from '../db/pool'
import { erro } from '../http/erro'
import { detalheDoAlerta } from './store'
import { listarAlertas } from './store'

interface FiltroDaQuery {
  limit?: string
  cursor?: string
  type?: string
  severity?: string
  walletId?: string
  since?: string
  until?: string
}

export interface AlertRouteOptions {
  adapterFactory?: (backend: BackendRow) => ChainAdapter
}

export function registerAlertRoutes(
  app: FastifyInstance,
  opts: AlertRouteOptions = {},
): void {
  const adapterFactory = opts.adapterFactory ?? createAdapter
  app.get<{ Querystring: FiltroDaQuery }>('/api/alerts', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const q = req.query ?? {}
    return reply.send(
      await listarAlertas(req.userId, {
        ...(q.limit ? { limit: Number(q.limit) } : {}),
        ...(q.cursor ? { cursor: q.cursor } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(q.severity ? { severity: q.severity } : {}),
        ...(q.walletId ? { walletId: Number(q.walletId) } : {}),
        ...(q.since ? { since: q.since } : {}),
        ...(q.until ? { until: q.until } : {}),
      }),
    )
  })

  /**
   * O detalhe de um alerta, **sem consultar backend nenhum**.
   *
   * Tudo o que ele mostra já está no banco: o alerta, o evento de cadeia que o
   * causou, a carteira e os alertas irmãos da mesma transação. Buscar a
   * transação na cadeia é outra rota, e só por clique — num explorador público
   * cada consulta é mais um endereço entregue, e fazer isso ao abrir o feed
   * multiplicaria a exposição que o produto existe para denunciar.
   */
  app.get<{ Params: { id: string } }>('/api/alerts/:id', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const detalhe = await detalheDoAlerta(req.userId, Number(req.params.id))
    if (!detalhe) {
      // A mesma resposta para alerta inexistente e alerta de outro usuário.
      return reply
        .code(404)
        .send(erro('alert.notFound', 'este alerta não existe, ou não é seu'))
    }
    return reply.send(detalhe)
  })

  /**
   * A transação inteira, buscada na fonte da carteira.
   *
   * **Só por clique.** É a única consulta do sistema que não sai do ciclo do
   * worker, e a razão é a tese do produto: num explorador público, cada
   * chamada entrega mais um dado ao serviço. A tela diz para onde a consulta
   * vai antes de ir.
   */
  app.get<{ Params: { txid: string }; Querystring: { walletId?: string } }>(
    '/api/tx/:txid',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const { rows } = await pool.query<{
        id: string
        kind: string
        url: string
        is_public: boolean
        network: Network
        credentials_encrypted: Buffer | null
      }>(
        `SELECT w.id, b.kind, b.url, b.is_public, b.network, b.credentials_encrypted
           FROM wallets w JOIN backends b ON b.id = w.backend_id
          WHERE w.id = $1 AND w.user_id = $2`,
        [Number(req.query.walletId), req.userId],
      )
      const linha = rows[0]
      if (!linha) {
        // Mesma resposta para carteira inexistente e carteira alheia.
        return reply
          .code(404)
          .send(erro('wallet.notFound', 'esta carteira não existe, ou não é sua'))
      }

      const adapter = adapterFactory({
        kind: linha.kind,
        url: linha.url,
        isPublic: linha.is_public,
        network: linha.network,
        walletId: Number(linha.id),
        credentialsEncrypted: linha.credentials_encrypted,
      })

      try {
        if (!adapter.getTransaction) {
          return reply.code(501).send(
            erro(
              'tx.unsupportedByBackend',
              'a fonte desta carteira não sabe contar a transação inteira',
              { fonte: adapter.capabilities().host },
            ),
          )
        }

        const tx = await adapter.getTransaction(req.params.txid)
        if (!tx) {
          return reply
            .code(404)
            .send(erro('tx.notFound', 'a fonte não conhece esta transação'))
        }
        return reply.send(tx)
      } catch (err) {
        // O motivo vem junto: "a fonte recusou" sozinho obriga a repetir a
        // chamada à mão para descobrir o que aconteceu.
        return reply.code(502).send(
          erro('tx.backendFailed', (err as Error).message, {
            motivo: (err as Error).message,
          }),
        )
      } finally {
        adapter.close?.()
      }
    },
  )

  app.get('/api/stream', (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': conectado\n\n')

    const unsubscribe = subscribeToAlerts(req.userId, payload => {
      reply.raw.write('event: alert\n')
      reply.raw.write('data: ' + JSON.stringify(payload) + '\n\n')
    })

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000)
    req.raw.on('close', () => {
      clearInterval(keepAlive)
      unsubscribe()
    })
  })
}
