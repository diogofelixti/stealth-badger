import type { FastifyInstance } from 'fastify'
import { erro } from '../http/erro'
import type { ChainAdapter } from '../chain/types'
import { createAdapter, type BackendRow } from '../chain/adapter'
import { backendDoUsuario, ensureBackendGlobal } from '../chain/backends'
import { scanEmAndamento } from '../privacy/andamento'
import { loadConfig } from '../config'
import { seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { parseWatchAddress } from './address'
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
  /** chave estendida ou descriptor; exclusivo com `address` */
  key?: string
  /** endereço avulso a vigiar; exclusivo com `key` */
  address?: string
  gapLimit?: number
  /** backend escolhido na tela; ausente usa o configurado na instância */
  backendId?: number
}



export function registerWalletRoutes(
  app: FastifyInstance,
  opts: WalletRouteOptions = {},
): void {
  const adapterFactory = opts.adapterFactory ?? createAdapter

  app.post<{ Body: CreateWalletBody }>('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { label, key, address, gapLimit } = req.body
    if (!label?.trim()) {
      return reply.code(400).send(erro('wallet.labelRequired', 'rótulo obrigatório'))
    }

    // Exclusivos de propósito: aceitar os dois obrigaria a escolher um em
    // silêncio, e o usuário descobriria depois que vigiou o que não pediu.
    if (key?.trim() && address?.trim()) {
      return reply
        .code(400)
        .send(
          erro(
            'wallet.keyOrAddress',
            'informe uma chave estendida ou um endereço, não os dois',
          ),
        )
    }
    if (!key?.trim() && !address?.trim()) {
      return reply
        .code(400)
        .send(
          erro(
            'wallet.keyOrAddressRequired',
            'informe a chave estendida da carteira ou um endereço a vigiar',
          ),
        )
    }

    const cfg = loadConfig()

    const network: Network = cfg.network

    // O backend é resolvido antes da detecção de tipo de script porque é ele
    // que responderá a consulta: detectar por um backend e vigiar por outro
    // seria perguntar a cadeia em dois lugares sem motivo — e, se um deles for
    // público, expor os endereços a mais um observador do que o necessário.
    let backend: BackendRow & { id: number }
    if (req.body.backendId !== undefined) {
      const escolhido = await backendDoUsuario(
        req.userId,
        Number(req.body.backendId),
        network,
      )
      if (!escolhido) {
        return reply.code(400).send(
          erro(
            'wallet.backendNotFound',
            `backend ${req.body.backendId} não existe ou não é seu. ` +
              'Consulte GET /api/backends para os disponíveis.',
          ),
        )
      }
      backend = { ...escolhido, network }
    } else {
      backend = {
        id: await ensureBackendGlobal(network),
        kind: cfg.backendKind,
        url: cfg.backendUrl,
        isPublic: cfg.publicBackend,
        network,
      }
    }

    // Endereço avulso e carteira divergem só aqui: o que se guarda e o que
    // precisa ser derivado. Daqui para baixo o motor não sabe a diferença.
    let scriptType: ScriptType
    let cifrada: Buffer | null = null
    let fingerprint: string | null = null
    let enderecoAvulso: string | null = null

    if (address?.trim()) {
      let avulso
      try {
        avulso = parseWatchAddress(address, network)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
      scriptType = avulso.scriptType
      enderecoAvulso = avulso.address
    } else {
      let parsed
      try {
        parsed = parseExtendedKey(key!)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }

      // Um backend Esplora atende uma rede só. Aceitar a chave da outra rede
      // faria o watchtower derivar endereços que o explorador recusa, e a
      // carteira morreria em `error` sem dizer o motivo. Melhor recusar aqui,
      // enquanto ainda dá para explicar. Signet e testnet compartilham as
      // mesmas version bytes, por isso a comparação é com `testnet`.
      const esperada: KeyNetwork = cfg.network === 'mainnet' ? 'mainnet' : 'testnet'
      if (parsed.keyNetwork !== esperada) {
        return reply.code(400).send(
          erro(
            'wallet.wrongNetwork',
            `esta chave é de ${parsed.keyNetwork}, mas este watchtower vigia ` +
              `${cfg.network}. Use uma chave de ${cfg.network}.`,
            { chave: parsed.keyNetwork, rede: cfg.network },
          ),
        )
      }

      // `xpub`/`tpub` não dizem o tipo de script: quem exporta por descriptor
      // usa a mesma codificação para legado, segwit e taproot. Assumir errado
      // não dá erro — a carteira sincroniza e mostra saldo zero para sempre.
      scriptType = parsed.scriptType
      if (parsed.scriptTypeAmbiguous) {
        const adapter = adapterFactory(backend)
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

      cifrada = seal(parsed.canonicalXpub, cfg.masterKeyHex)
      fingerprint = parsed.fingerprint
    }

    const kind = enderecoAvulso ? 'address' : 'xpub'
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO wallets
         (user_id, label, kind, xpub_encrypted, xpub_fingerprint, script_type,
          network, gap_limit, backend_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        req.userId,
        label.trim(),
        kind,
        cifrada,
        fingerprint,
        scriptType,
        network,
        gapLimit ?? 20,
        backend.id,
      ],
    )
    const walletId = Number(rows[0]!.id)

    if (enderecoAvulso) {
      // Registrado já: sem isto o motor não teria o que conferir, porque não
      // há chave da qual derivar.
      const avulso = parseWatchAddress(enderecoAvulso, network)
      await pool.query(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
         VALUES ($1, 0, 0, '', $2, $3)`,
        [walletId, avulso.address, avulso.scripthash],
      )
    }

    return reply.code(201).send({
      id: walletId,
      label: label.trim(),
      kind,
      scriptType,
      network,
      fingerprint,
      address: enderecoAvulso,
      syncState: 'pending',
    })
  })

  app.get('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rows } = await pool.query(
      `SELECT w.id, w.label, w.kind, w.script_type AS "scriptType", w.network,
              w.xpub_fingerprint AS fingerprint, w.sync_state AS "syncState",
              -- só o endereço avulso: uma carteira por chave tem dezenas, e
              -- eleger um deles seria mostrar um dado que não significa nada
              CASE WHEN w.kind = 'address' THEN (
                SELECT a.address FROM addresses a
                 WHERE a.wallet_id = w.id ORDER BY a.id LIMIT 1
              ) END AS address,
              w.sync_progress AS "syncProgress", w.sync_height AS "syncHeight",
              w.sync_error AS "syncError",
              b.is_public AS "backendIsPublic", b.url AS "backendUrl",
              p.score AS "privacyScore", p.grade AS "privacyGrade",
              p.scanned_at AS "privacyScannedAt",
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
         -- LATERAL em vez de subconsulta por coluna: uma varredura só traz
         -- score, nota e data da mesma análise, e não de três diferentes
         LEFT JOIN LATERAL (
           SELECT score, grade, scanned_at FROM privacy_scans ps
            WHERE ps.wallet_id = w.id
            ORDER BY ps.scanned_at DESC, ps.id DESC LIMIT 1
         ) p ON true
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC`,
      [req.userId],
    )
    // Se a análise está correndo é estado de processo, não de banco: vem do
    // registro em memória para que a tela não precise inferir pelo relógio.
    return reply.send(
      rows.map(r => ({ ...r, privacyScanning: scanEmAndamento(Number(r.id)) })),
    )
  })
}
