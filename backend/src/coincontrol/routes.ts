import type { FastifyInstance } from 'fastify'
import { pool } from '../db/pool'
import { exportarBip329, interpretarBip329 } from './bip329'
import { marcarUtxo, marcasDaCarteira, utxosDaCarteira } from './marks'

interface MarcarBody {
  label?: string | null
  tags?: string[]
  frozen?: boolean
}

async function ehDono(userId: number, walletId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM wallets WHERE id = $1 AND user_id = $2',
    [walletId, userId],
  )
  return rowCount === 1
}

export function registerCoinControlRoutes(app: FastifyInstance): void {
  // O arquivo do BIP-329 chega como texto puro, não como JSON: o corpo é uma
  // sequência de linhas, e o parser de JSON do Fastify recusaria a segunda.
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'string' },
    (_req, body, done) => done(null, body),
  )

  app.get<{ Params: { id: string } }>('/api/wallets/:id/utxos', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const walletId = Number(req.params.id)
    if (!(await ehDono(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }
    return reply.send(await utxosDaCarteira(walletId))
  })

  app.put<{ Params: { id: string; txid: string; vout: string }; Body: MarcarBody }>(
    '/api/wallets/:id/utxos/:txid/:vout',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
      const walletId = Number(req.params.id)
      if (!(await ehDono(req.userId, walletId))) {
        return reply.code(404).send({ error: 'carteira não encontrada' })
      }

      const { label, tags, frozen } = req.body ?? {}
      if (tags !== undefined && !Array.isArray(tags)) {
        return reply.code(400).send({ error: 'tags deve ser uma lista de textos' })
      }

      await marcarUtxo(walletId, req.params.txid, Number(req.params.vout), {
        ...(label !== undefined ? { label } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(frozen !== undefined ? { frozen } : {}),
      })
      return reply.send({ ok: true })
    },
  )

  app.get<{ Params: { id: string } }>('/api/wallets/:id/labels', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const walletId = Number(req.params.id)
    if (!(await ehDono(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }

    return reply
      .header('content-type', 'application/jsonl; charset=utf-8')
      // O Sparrow abre por seletor de arquivo: sem nome sugerido o navegador
      // salva como "labels", sem extensão, e o seletor não o enxerga.
      .header(
        'content-disposition',
        `attachment; filename="stealth-badger-wallet-${walletId}.jsonl"`,
      )
      .send(exportarBip329(await marcasDaCarteira(walletId)))
  })

  app.post<{ Params: { id: string } }>('/api/wallets/:id/labels', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const walletId = Number(req.params.id)
    if (!(await ehDono(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }

    const texto = typeof req.body === 'string' ? req.body : String(req.body ?? '')
    const { marcas, ignoradas } = interpretarBip329(texto)

    // Saída que não é desta carteira não vira marca: o arquivo de outra pessoa
    // encheria o banco de marcas órfãs que nunca aparecem em tela nenhuma.
    const { rows } = await pool.query<{ txid: string; vout: number }>(
      `SELECT txid, vout FROM utxos WHERE wallet_id = $1`,
      [walletId],
    )
    const daCarteira = new Set(rows.map(r => r.txid + ':' + r.vout))

    let importadas = 0
    let alheias = 0
    for (const m of marcas) {
      if (!daCarteira.has(m.txid + ':' + m.vout)) {
        alheias += 1
        continue
      }
      await marcarUtxo(walletId, m.txid, m.vout, {
        label: m.label,
        tags: m.tags,
        frozen: m.frozen,
      })
      importadas += 1
    }

    return reply.send({ imported: importadas, ignored: ignoradas + alheias })
  })
}
