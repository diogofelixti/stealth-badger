import type { FastifyInstance } from 'fastify'
import { loadConfig } from '../config'
import { seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { parseExtendedKey, type KeyNetwork, type Network } from './descriptor'

interface CreateWalletBody {
  label: string
  key: string
  gapLimit?: number
}

async function ensureBackend(network: Network): Promise<number> {
  const cfg = loadConfig()
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES (NULL, 'esplora', $1, $2, $3)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public
     RETURNING id`,
    [cfg.esploraUrl, cfg.publicBackend, network],
  )
  return Number(rows[0]!.id)
}

export function registerWalletRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateWalletBody }>('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { label, key, gapLimit } = req.body
    if (!label?.trim()) return reply.code(400).send({ error: 'rótulo obrigatório' })

    let parsed
    try {
      parsed = parseExtendedKey(key)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const cfg = loadConfig()

    // Um backend Esplora atende uma rede só. Aceitar a chave da outra rede
    // faria o watchtower derivar endereços que o explorador recusa, e a
    // carteira morreria em `error` sem dizer o motivo. Melhor recusar aqui,
    // enquanto ainda dá para explicar. Signet e testnet compartilham as
    // mesmas version bytes, por isso a comparação é com `testnet`.
    const esperada: KeyNetwork = cfg.network === 'mainnet' ? 'mainnet' : 'testnet'
    if (parsed.keyNetwork !== esperada) {
      return reply.code(400).send({
        error:
          `esta chave é de ${parsed.keyNetwork}, mas este watchtower vigia ` +
          `${cfg.network}. Use uma chave de ${cfg.network}.`,
      })
    }

    const network: Network = cfg.network

    const backendId = await ensureBackend(network)
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO wallets
         (user_id, label, xpub_encrypted, xpub_fingerprint, script_type,
          network, gap_limit, backend_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.userId,
        label.trim(),
        seal(parsed.canonicalXpub, cfg.masterKeyHex),
        parsed.fingerprint,
        parsed.scriptType,
        network,
        gapLimit ?? 20,
        backendId,
      ],
    )

    return reply.code(201).send({
      id: Number(rows[0]!.id),
      label: label.trim(),
      scriptType: parsed.scriptType,
      network,
      fingerprint: parsed.fingerprint,
      syncState: 'pending',
    })
  })

  app.get('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rows } = await pool.query(
      `SELECT w.id, w.label, w.script_type AS "scriptType", w.network,
              w.xpub_fingerprint AS fingerprint, w.sync_state AS "syncState",
              w.sync_progress AS "syncProgress", w.sync_height AS "syncHeight",
              b.is_public AS "backendIsPublic", b.url AS "backendUrl",
              COALESCE((
                SELECT sum(value_sats) FROM utxos u
                WHERE u.wallet_id = w.id AND u.spent_at_txid IS NULL
              ), 0)::bigint AS "balanceSats",
              (
                SELECT count(*) FROM utxos u
                WHERE u.wallet_id = w.id AND u.spent_at_txid IS NULL
              )::int AS "utxoCount",
              (
                SELECT count(*) FROM utxos u
                WHERE u.wallet_id = w.id AND u.spent_at_txid IS NULL AND u.frozen
              )::int AS "frozenCount"
         FROM wallets w
         JOIN backends b ON b.id = w.backend_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC`,
      [req.userId],
    )
    return reply.send(rows)
  })
}
