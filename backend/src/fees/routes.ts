import type { FastifyInstance } from 'fastify'
import { credenciaisDoBackend, type BackendRow } from '../chain/adapter'
import { criarRpc } from '../chain/core-rpc'
import { pool } from '../db/pool'
import { erro } from '../http/erro'
import { preferenciasDoUsuario } from '../preferences/store'
import type { Network } from '../wallet/descriptor'
import { taxasDoMempool, taxasDoNo } from './service'

/**
 * Estimativa de taxa, na fonte que o usuário escolheu — e desligada de fábrica.
 *
 * `node` fala com o próprio nó e não conta nada a ninguém; `mempool` é uma
 * consulta pública, que o usuário liga sabendo; `off` é o padrão, e não faz
 * consulta nenhuma.
 */
export function registerFeeRoutes(app: FastifyInstance): void {
  app.get('/api/fees', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { feeSource } = await preferenciasDoUsuario(req.userId)
    const at = new Date().toISOString()

    if (feeSource === 'off') {
      return reply.send({ source: 'off', blocks: null, at })
    }

    if (feeSource === 'node') {
      const { rows } = await pool.query<{
        url: string
        credentials_encrypted: Buffer | null
        network: Network
      }>(
        `SELECT b.url, b.credentials_encrypted, b.network
           FROM backends b
          WHERE b.kind = 'core' AND (b.user_id IS NULL OR b.user_id = $1)
          ORDER BY b.user_id NULLS LAST, b.id
          LIMIT 1`,
        [req.userId],
      )
      const linha = rows[0]
      if (!linha) {
        // A opção existe, mas não para esta instalação: dizer por quê é melhor
        // que mostrar um painel vazio.
        return reply.code(400).send(
          erro(
            'fees.needsCoreBackend',
            'a estimativa pelo nó precisa de uma fonte Bitcoin Core cadastrada',
          ),
        )
      }

      const linhaDoBackend: BackendRow = {
        kind: 'core',
        url: linha.url,
        isPublic: false,
        network: linha.network,
        credentialsEncrypted: linha.credentials_encrypted,
      }
      const rpc = criarRpc({
        url: linha.url,
        ...credenciaisDoBackend(linhaDoBackend),
      })
      return reply.send({ source: 'node', blocks: await taxasDoNo(rpc), at })
    }

    const blocks = await taxasDoMempool()
    if (!blocks) {
      return reply
        .code(502)
        .send(erro('fees.sourceFailed', 'a fonte pública de taxas não respondeu'))
    }
    return reply.send({ source: 'mempool', blocks, at })
  })
}
