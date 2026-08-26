import { pool } from '../db/pool'
import type { PrivacyFinding } from './scan'

export interface TransacaoPendente {
  txid: string
  /** o evento que trouxe os fundos, para o alerta poder se amarrar a ele */
  eventId: number
}

export async function salvarTxScan(
  walletId: number,
  txid: string,
  findings: PrivacyFinding[],
  scannerVersion: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO tx_scans (wallet_id, txid, findings, scanner_version)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (wallet_id, txid) DO NOTHING`,
    [walletId, txid, JSON.stringify(findings), scannerVersion],
  )
}

/**
 * Transações que trouxeram fundos e ainda não foram analisadas.
 *
 * Da mais recente para a mais antiga: se o teto cortar a fila, o que fica de
 * fora é o passado distante, e não o depósito que acabou de chegar.
 */
export async function transacoesSemAnalise(
  walletId: number,
  limite: number,
): Promise<TransacaoPendente[]> {
  const { rows } = await pool.query<{ txid: string; id: string }>(
    `SELECT DISTINCT ON (e.txid) e.txid, e.id
       FROM chain_events e
      WHERE e.wallet_id = $1
        AND e.type = 'utxo_created'
        AND e.rolled_back_by IS NULL
        AND e.txid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tx_scans t
           WHERE t.wallet_id = e.wallet_id AND t.txid = e.txid
        )
      ORDER BY e.txid, e.id DESC`,
    [walletId],
  )
  // A ordenação por id precisa vir depois do DISTINCT ON, que exige ordenar
  // pelo txid primeiro.
  return rows
    .map(r => ({ txid: r.txid, eventId: Number(r.id) }))
    .sort((a, b) => b.eventId - a.eventId)
    .slice(0, limite)
}
