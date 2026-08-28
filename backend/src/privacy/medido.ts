import { pool } from '../db/pool'

/**
 * O que o watchtower mediu sozinho, na cadeia que ele mesmo sincronizou.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * O painel lia o reuso de endereço do **scanner** — `walletInfo.reusedAddresses`
 * e `activeAddresses`. Em 28/08 o scanner devolveu tudo zero, porque nem chegava
 * a consultar a cadeia, e a barra mostrou "0 de 0" numa carteira que tinha
 * reuso.
 *
 * O dado certo já estava no banco. O watchtower **detectou o reuso sozinho**: a
 * mesma carteira tinha dois alertas `address_reused`, gerados a partir dos
 * eventos que ele gravou ao sincronizar. O painel ignorava o que a aplicação
 * observou e repetia o que um processo externo disse.
 *
 * Vale mesmo com o scanner funcionando: o número medido na cadeia que o
 * watchtower sincronizou é de **primeira mão**, e o do scanner é de segunda.
 * Conferidos no banco de desenvolvimento, os dois concordam — 30 ativos, 2
 * reusados, 2 alertas — porque leem o mesmo log.
 */
export interface ReusoMedido {
  /** endereços que receberam pelo menos uma vez */
  activeAddresses: number
  /** endereços que receberam mais de uma vez */
  reusedAddresses: number
}

export async function reusoMedido(walletId: number): Promise<ReusoMedido> {
  const { rows } = await pool.query<{ ativos: string; reusados: string }>(
    `SELECT count(*) FILTER (WHERE recebimentos >= 1) AS ativos,
            count(*) FILTER (WHERE recebimentos >= 2) AS reusados
       FROM (
         SELECT a.id, count(e.id) AS recebimentos
           FROM addresses a
           -- LEFT JOIN, e não WHERE: endereço derivado que nunca recebeu
           -- precisa aparecer com zero, para não ser contado como ativo.
           -- Contá-lo diluiria o percentual — uma carteira com gap limit de 20
           -- pareceria melhor do que é só por ter endereços vazios à frente.
           LEFT JOIN chain_events e
             ON e.wallet_id = a.wallet_id
            AND e.type = 'utxo_created'
            -- reorg compensado deixa de contar: sem isto, um endereço que
            -- recebeu uma vez e sofreu reorg ficaria reusado para sempre
            AND e.rolled_back_by IS NULL
            AND (e.payload->>'addressId')::bigint = a.id
          WHERE a.wallet_id = $1
          GROUP BY a.id
       ) t`,
    [walletId],
  )
  return {
    activeAddresses: Number(rows[0]?.ativos ?? 0),
    reusedAddresses: Number(rows[0]?.reusados ?? 0),
  }
}
