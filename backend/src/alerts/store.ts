import { pool } from '../db/pool'
import type { AlertCandidate } from './rules'

export async function saveAlert(c: AlertCandidate): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [c.userId, c.walletId, c.type, c.severity, JSON.stringify(c.params), c.dedupeKey, c.eventId],
  )
  if (!rows[0]) return null

  const id = Number(rows[0].id)
  await pool.query(`SELECT pg_notify('sb_alerts', $1)`, [
    JSON.stringify({ id, userId: c.userId, walletId: c.walletId, severity: c.severity }),
  ])
  return id
}

export async function recentAlerts(userId: number, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, wallet_id AS "walletId", type, severity, params,
            created_at AS "createdAt", read_at AS "readAt"
       FROM alerts WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return rows
}

const TETO = 100
const PADRAO = 20

export interface FiltroDeAlertas {
  limit?: number
  cursor?: string
  type?: string
  severity?: string
  walletId?: number
  since?: string
  until?: string
}

export interface PaginaDeAlertas {
  items: Record<string, unknown>[]
  nextCursor: string | null
}

/**
 * O cursor é opaco para quem chama: base64 de `created_at|id`.
 *
 * Opaco de propósito. Um cliente que aprenda a ler o cursor passa a depender
 * da ordenação, e mudá-la depois quebra o cliente. Assim o formato é nosso.
 */
function lerCursor(cursor: string): { createdAt: string; id: number } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf8').split('|')
    if (!createdAt || !id) return null
    return { createdAt, id: Number(id) }
  } catch {
    return null
  }
}

function montarCursor(createdAt: Date | string, id: string | number): string {
  const quando = createdAt instanceof Date ? createdAt.toISOString() : createdAt
  return Buffer.from(quando + '|' + id, 'utf8').toString('base64')
}

/**
 * Uma página do feed, por cursor keyset em `(created_at, id)` decrescente.
 *
 * Não é `OFFSET`. O feed recebe alerta novo pelo topo em tempo real — é
 * empurrado por SSE —, e com `OFFSET` cada alerta que chega empurra a janela:
 * o leitor vê o mesmo alerta duas vezes, ou pula um e nunca fica sabendo.
 * O cursor aponta para baixo, e o que chega por cima não o afeta.
 *
 * O `id` desempata: o worker grava vários alertas no mesmo ciclo, portanto no
 * mesmo `created_at`, e sem desempate a paginação trava na mesma página.
 */
export async function listarAlertas(
  userId: number,
  filtro: FiltroDeAlertas = {},
): Promise<PaginaDeAlertas> {
  const limite = Math.min(Math.max(Number(filtro.limit) || PADRAO, 1), TETO)

  const condicoes = ['user_id = $1']
  const valores: unknown[] = [userId]

  const posicao = filtro.cursor ? lerCursor(filtro.cursor) : null
  if (posicao) {
    valores.push(posicao.createdAt, posicao.id)
    condicoes.push(`(created_at, id) < ($${valores.length - 1}::timestamptz, $${valores.length}::bigint)`)
  }
  if (filtro.type) {
    valores.push(filtro.type)
    condicoes.push(`type = $${valores.length}`)
  }
  if (filtro.severity) {
    valores.push(filtro.severity)
    condicoes.push(`severity = $${valores.length}`)
  }
  if (filtro.walletId) {
    valores.push(filtro.walletId)
    condicoes.push(`wallet_id = $${valores.length}`)
  }
  if (filtro.since) {
    valores.push(filtro.since)
    condicoes.push(`created_at >= $${valores.length}::timestamptz`)
  }
  if (filtro.until) {
    valores.push(filtro.until)
    condicoes.push(`created_at <= $${valores.length}::timestamptz`)
  }

  // Pede um a mais do que o limite: é o que diz se existe página seguinte sem
  // uma segunda consulta contando o total.
  valores.push(limite + 1)

  const { rows } = await pool.query(
    `SELECT id, wallet_id AS "walletId", type, severity, params,
            created_at AS "createdAt", read_at AS "readAt"
       FROM alerts
      WHERE ${condicoes.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${valores.length}`,
    valores,
  )

  const items = rows.slice(0, limite) as Record<string, unknown>[]
  const ultimo = items[items.length - 1]
  return {
    items,
    nextCursor:
      rows.length > limite && ultimo
        ? montarCursor(ultimo['createdAt'] as Date, ultimo['id'] as string)
        : null,
  }
}

/**
 * O detalhe completo de um alerta, montado por junção — nunca remendando os
 * `params`.
 *
 * Os params guardam o txid truncado, porque são texto para caber na frase.
 * O identificador de verdade está em `chain_events`, e é de lá que ele sai.
 * `event_id` é nulável: alerta de queda de score não vem de evento de cadeia,
 * e nesses o detalhe existe sem transação em vez de mostrar campo vazio.
 */
export async function detalheDoAlerta(
  userId: number,
  alertId: number,
): Promise<Record<string, unknown> | null> {
  if (!Number.isFinite(alertId)) return null

  const { rows } = await pool.query<{
    id: string
    walletId: string
    type: string
    severity: string
    params: Record<string, unknown>
    createdAt: Date
    readAt: Date | null
    eventId: string | null
    eventType: string | null
    height: number | null
    blockHash: string | null
    txid: string | null
    vout: number | null
    eventPayload: Record<string, unknown> | null
    walletLabel: string
    walletNetwork: string
    syncHeight: number | null
  }>(
    `SELECT a.id, a.wallet_id AS "walletId", a.type, a.severity, a.params,
            a.created_at AS "createdAt", a.read_at AS "readAt",
            e.id AS "eventId", e.type AS "eventType", e.height, e.block_hash AS "blockHash",
            e.txid, e.vout, e.payload AS "eventPayload",
            w.label AS "walletLabel", w.network AS "walletNetwork",
            w.sync_height AS "syncHeight"
       FROM alerts a
       JOIN wallets w ON w.id = a.wallet_id
       LEFT JOIN chain_events e ON e.id = a.event_id
      WHERE a.id = $1 AND a.user_id = $2`,
    [alertId, userId],
  )

  const linha = rows[0]
  if (!linha) return null

  // Confirmações a partir da ponta que a carteira conhece. Altura nula é
  // mempool, e mempool é zero confirmação — não é "não sei".
  const confirmations =
    linha.eventId === null
      ? null
      : linha.height === null || linha.syncHeight === null
        ? 0
        : Math.max(0, linha.syncHeight - linha.height + 1)

  const irmaos = linha.txid
    ? (
        await pool.query(
          `SELECT a.id, a.type, a.severity, a.params, a.created_at AS "createdAt"
             FROM alerts a JOIN chain_events e ON e.id = a.event_id
            WHERE a.user_id = $1 AND e.txid = $2 AND a.id <> $3
            ORDER BY a.created_at DESC`,
          [userId, linha.txid, alertId],
        )
      ).rows
    : []

  return {
    alert: {
      id: linha.id,
      walletId: linha.walletId,
      type: linha.type,
      severity: linha.severity,
      params: linha.params,
      createdAt: linha.createdAt,
      readAt: linha.readAt,
    },
    event:
      linha.eventId === null
        ? null
        : {
            id: linha.eventId,
            type: linha.eventType,
            height: linha.height,
            blockHash: linha.blockHash,
            txid: linha.txid,
            vout: linha.vout,
            payload: linha.eventPayload,
          },
    wallet: { id: linha.walletId, label: linha.walletLabel, network: linha.walletNetwork },
    confirmations,
    siblings: irmaos,
  }
}
