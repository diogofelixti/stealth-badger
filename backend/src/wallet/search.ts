import type { FastifyInstance } from 'fastify'
import { pool } from '../db/pool'

/**
 * Teto de resultados.
 *
 * Sem ele, buscar por um prefixo comum devolveria a carteira inteira, e o
 * campo de busca viraria um despejo de endereços — que não é o que ninguém
 * pede ao digitar um pedaço de endereço.
 */
const TETO = 50

export interface Achado {
  walletId: number
  walletLabel: string
  address: string
  derivationPath: string
  used: boolean
  balanceSats: number
}

export function registerSearchRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const termo = (req.query.q ?? '').trim()
    // Busca vazia devolve vazio, e não tudo: quem não digitou nada não pediu a
    // carteira inteira.
    if (!termo) return reply.send([])

    const { rows } = await pool.query<{
      wallet_id: string
      wallet_label: string
      address: string
      derivation_path: string
      is_used: boolean
      balance: string
    }>(
      `SELECT a.wallet_id, w.label AS wallet_label, a.address, a.derivation_path,
              a.is_used,
              COALESCE((
                SELECT sum(u.value_sats) FROM utxos u
                 WHERE u.wallet_id = a.wallet_id AND u.address_id = a.id
                   AND NOT u.spent
              ), 0)::bigint AS balance
         FROM addresses a
         JOIN wallets w ON w.id = a.wallet_id
        -- o filtro por dono vem antes de qualquer coisa: buscar endereço de
        -- outra pessoa não pode revelar que alguém o vigia
        WHERE w.user_id = $1
          AND (a.address ILIKE '%' || $2 || '%' OR w.label ILIKE '%' || $2 || '%')
        ORDER BY a.wallet_id, a.chain, a.idx
        LIMIT $3`,
      [req.userId, termo, TETO],
    )

    return reply.send(
      rows.map<Achado>(r => ({
        walletId: Number(r.wallet_id),
        walletLabel: r.wallet_label,
        address: r.address,
        derivationPath: r.derivation_path,
        used: r.is_used,
        balanceSats: Number(r.balance),
      })),
    )
  })
}
