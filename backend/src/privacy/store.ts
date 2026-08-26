import { pool } from '../db/pool'
import type { PrivacyFinding, PrivacyScan } from './scan'

export interface ScanSalvo extends PrivacyScan {
  id: number
  scannedAt: Date
}

interface Linha {
  id: string
  score: number
  grade: string
  wallet_info: Record<string, unknown>
  findings: PrivacyFinding[]
  scanner_version: string
  scanned_at: Date
}

function daLinha(r: Linha): ScanSalvo {
  return {
    id: Number(r.id),
    score: r.score,
    grade: r.grade,
    walletInfo: r.wallet_info,
    findings: r.findings,
    scannerVersion: r.scanner_version,
    scannedAt: r.scanned_at,
  }
}

export async function salvarScan(
  walletId: number,
  scan: PrivacyScan,
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO privacy_scans
       (wallet_id, score, grade, wallet_info, findings, scanner_version)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      walletId,
      scan.score,
      scan.grade,
      JSON.stringify(scan.walletInfo),
      JSON.stringify(scan.findings),
      scan.scannerVersion,
    ],
  )
  return Number(rows[0]!.id)
}

export async function ultimoScan(walletId: number): Promise<ScanSalvo | null> {
  const { rows } = await pool.query<Linha>(
    `SELECT id, score, grade, wallet_info, findings, scanner_version, scanned_at
       FROM privacy_scans WHERE wallet_id = $1
      ORDER BY scanned_at DESC, id DESC LIMIT 1`,
    [walletId],
  )
  return rows[0] ? daLinha(rows[0]) : null
}

/** Do mais antigo para o mais novo: é assim que se lê uma linha do tempo. */
export async function historicoDeScans(walletId: number): Promise<ScanSalvo[]> {
  const { rows } = await pool.query<Linha>(
    `SELECT id, score, grade, wallet_info, findings, scanner_version, scanned_at
       FROM privacy_scans WHERE wallet_id = $1
      ORDER BY scanned_at ASC, id ASC`,
    [walletId],
  )
  return rows.map(daLinha)
}
