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
  error: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO tx_scans (wallet_id, txid, findings, scanner_version, error)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (wallet_id, txid) DO UPDATE SET
       findings        = EXCLUDED.findings,
       scanner_version = EXCLUDED.scanner_version,
       error           = EXCLUDED.error,
       scanned_at      = now()`,
    [walletId, txid, JSON.stringify(findings), scannerVersion, error],
  )
}

/**
 * Transações que trouxeram fundos e ainda esperam análise.
 *
 * Nunca tentadas vêm primeiro; as que falharam ficam no fim da fila. Sem essa
 * ordem, transação que falha sempre — as vistas no mempool e substituídas
 * depois retornam 404 para sempre — consome a cota a cada clique e as outras
 * nunca chegam a ser olhadas. Ficar no fim, em vez de fora, dá outra chance às
 * que falharam por rede instável.
 *
 * Dentro de cada grupo, da mais recente para a mais antiga: se o teto cortar,
 * o que fica de fora é o passado distante, não o depósito que acabou de
 * chegar.
 */
export async function transacoesSemAnalise(
  walletId: number,
  limite: number,
): Promise<TransacaoPendente[]> {
  const { rows } = await pool.query<{ txid: string; id: string; tentada: boolean }>(
    `SELECT DISTINCT ON (e.txid)
            e.txid,
            e.id,
            EXISTS (
              SELECT 1 FROM tx_scans t
               WHERE t.wallet_id = e.wallet_id AND t.txid = e.txid
            ) AS tentada
       FROM chain_events e
      WHERE e.wallet_id = $1
        AND e.type = 'utxo_created'
        AND e.rolled_back_by IS NULL
        AND e.txid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tx_scans t
           WHERE t.wallet_id = e.wallet_id AND t.txid = e.txid
             AND t.error IS NULL
        )
      ORDER BY e.txid, e.id DESC`,
    [walletId],
  )
  // O DISTINCT ON obriga a ordenar pelo txid primeiro; a ordem que interessa
  // é aplicada depois.
  return rows
    .map(r => ({ txid: r.txid, eventId: Number(r.id), tentada: r.tentada }))
    .sort((a, b) => Number(a.tentada) - Number(b.tentada) || b.eventId - a.eventId)
    .map(({ txid, eventId }) => ({ txid, eventId }))
    .slice(0, limite)
}
