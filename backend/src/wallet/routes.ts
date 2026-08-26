import type { FastifyInstance } from 'fastify'
import type { ChainAdapter } from '../chain/types'
import { createAdapter, type BackendRow } from '../chain/adapter'
import { loadConfig } from '../config'
import { seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { detectScriptType } from './detect'
import {
  parseExtendedKey,
  type KeyNetwork,
  type Network,
  type ScriptType,
} from './descriptor'

export interface WalletRouteOptions {
  adapterFactory?: (backend: BackendRow) => ChainAdapter
}

/**
 * Quando nem a chave nem a cadeia dizem o tipo, é carteira nova: sem
 * histórico não há o que detectar. Native segwit é o que qualquer carteira
 * criada hoje usa — e era assumir legado que produzia o saldo zero silencioso.
 */
const PADRAO_QUANDO_NAO_DA_PARA_SABER: ScriptType = 'p2wpkh'

interface CreateWalletBody {
  label: string
  key: string
  gapLimit?: number
}

async function ensureBackend(network: Network): Promise<number> {
  const cfg = loadConfig()
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES (NULL, $1, $2, $3, $4)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public, kind = EXCLUDED.kind
     RETURNING id`,
    [cfg.backendKind, cfg.backendUrl, cfg.publicBackend, network],
  )
  return Number(rows[0]!.id)
}

export function registerWalletRoutes(
  app: FastifyInstance,
  opts: WalletRouteOptions = {},
): void {
  const adapterFactory = opts.adapterFactory ?? createAdapter

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

    // `xpub`/`tpub` não dizem o tipo de script: quem exporta por descriptor
    // usa a mesma codificação para legado, segwit e taproot. Assumir errado
    // não dá erro — a carteira sincroniza e mostra saldo zero para sempre.
    let scriptType = parsed.scriptType
    if (parsed.scriptTypeAmbiguous) {
      const adapter = adapterFactory({
        kind: cfg.backendKind,
        url: cfg.backendUrl,
        isPublic: cfg.publicBackend,
        network,
      })
      try {
        scriptType =
          (await detectScriptType(parsed.canonicalXpub, network, adapter).catch(
            () => null,
          )) ?? PADRAO_QUANDO_NAO_DA_PARA_SABER
      } finally {
        // adapter aberto só para esta consulta; com Electrum é um socket
        adapter.close?.()
      }
    }

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
        scriptType,
        network,
        gapLimit ?? 20,
        backendId,
      ],
    )

    return reply.code(201).send({
      id: Number(rows[0]!.id),
      label: label.trim(),
      scriptType,
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
