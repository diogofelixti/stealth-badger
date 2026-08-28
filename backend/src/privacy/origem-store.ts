import { pool } from '../db/pool'
import type { PrivacyFinding, TxScan } from './scan'

export interface TransacaoPendente {
  txid: string
  /** o evento que trouxe os fundos, para o alerta poder se amarrar a ele */
  eventId: number
}

export interface TxScanSalvo extends TxScan {
  txid: string
  scannedAt: Date
  error: string | null
}

interface LinhaTxScan {
  txid: string
  score: number | null
  grade: string | null
  tx_type: string | null
  tx_info: Record<string, unknown>
  chain_analysis: Record<string, unknown>
  boltzmann: Record<string, unknown> | null
  findings: PrivacyFinding[]
  scanner_version: string
  scanned_at: Date
  error: string | null
}

function daLinha(r: LinhaTxScan): TxScanSalvo {
  return {
    txid: r.txid,
    score: r.score,
    grade: r.grade,
    txType: r.tx_type,
    txInfo: r.tx_info,
    chainAnalysis: r.chain_analysis,
    boltzmann: r.boltzmann,
    findings: r.findings,
    scannerVersion: r.scanner_version,
    scannedAt: r.scanned_at,
    error: r.error,
  }
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

export async function salvarTxScanCompleto(
  walletId: number,
  txid: string,
  scan: TxScan,
  error: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO tx_scans
       (wallet_id, txid, score, grade, tx_type, tx_info, chain_analysis,
        boltzmann, findings, scanner_version, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (wallet_id, txid) DO UPDATE SET
       score           = EXCLUDED.score,
       grade           = EXCLUDED.grade,
       tx_type         = EXCLUDED.tx_type,
       tx_info         = EXCLUDED.tx_info,
       chain_analysis  = EXCLUDED.chain_analysis,
       boltzmann       = EXCLUDED.boltzmann,
       findings        = EXCLUDED.findings,
       scanner_version = EXCLUDED.scanner_version,
       error           = EXCLUDED.error,
       scanned_at      = now()`,
    [
      walletId,
      txid,
      scan.score ?? null,
      scan.grade ?? null,
      scan.txType ?? null,
      JSON.stringify(scan.txInfo ?? {}),
      JSON.stringify(scan.chainAnalysis ?? {}),
      scan.boltzmann == null ? null : JSON.stringify(scan.boltzmann),
      JSON.stringify(scan.findings),
      scan.scannerVersion,
      error,
    ],
  )
}

export async function ultimoTxScan(
  walletId: number,
  txid: string,
): Promise<TxScanSalvo | null> {
  const { rows } = await pool.query<LinhaTxScan>(
    `SELECT txid, score, grade, tx_type, tx_info, chain_analysis, boltzmann,
            findings, scanner_version, scanned_at, error
       FROM tx_scans
      WHERE wallet_id = $1 AND txid = $2
      ORDER BY scanned_at DESC LIMIT 1`,
    [walletId, txid],
  )
  return rows[0] ? daLinha(rows[0]) : null
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
