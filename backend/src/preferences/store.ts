import { pool } from '../db/pool'

/**
 * Lista branca de fontes de preço.
 *
 * Array vindo do cliente não vira URL: o que chega é comparado com estes
 * nomes, e a URL é montada aqui dentro. Sem isso, `priceSources` seria um
 * pedido para o servidor buscar qualquer endereço que o cliente mandasse.
 */
export const FONTES_DE_PRECO = [
  'coingecko',
  'kraken',
  'bitstamp',
  'coinbase',
  'mempool',
] as const

export type FonteDePreco = (typeof FONTES_DE_PRECO)[number]

export const FONTES_DE_TAXA = ['off', 'node', 'mempool'] as const
export type FonteDeTaxa = (typeof FONTES_DE_TAXA)[number]

export interface Preferencias {
  theme: string
  currency: string
  priceSources: FonteDePreco[]
  feeSource: FonteDeTaxa
}

export async function preferenciasDoUsuario(userId: number): Promise<Preferencias> {
  const { rows } = await pool.query<{
    theme: string
    currency: string
    price_sources: string[]
    fee_source: FonteDeTaxa
  }>(
    `INSERT INTO user_preferences (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING theme, currency, price_sources, fee_source`,
    [userId],
  )
  const p = rows[0]!
  return {
    theme: p.theme,
    currency: p.currency,
    priceSources: p.price_sources as FonteDePreco[],
    feeSource: p.fee_source,
  }
}

export async function salvarPreferencias(
  userId: number,
  mudanca: Partial<Preferencias>,
): Promise<Preferencias> {
  const atual = await preferenciasDoUsuario(userId)
  const nova = { ...atual, ...mudanca }

  const { rows } = await pool.query<{
    theme: string
    currency: string
    price_sources: string[]
    fee_source: FonteDeTaxa
  }>(
    `UPDATE user_preferences
        SET theme = $2, currency = $3, price_sources = $4, fee_source = $5,
            updated_at = now()
      WHERE user_id = $1
      RETURNING theme, currency, price_sources, fee_source`,
    [userId, nova.theme, nova.currency, nova.priceSources, nova.feeSource],
  )
  const p = rows[0]!
  return {
    theme: p.theme,
    currency: p.currency,
    priceSources: p.price_sources as FonteDePreco[],
    feeSource: p.fee_source,
  }
}
