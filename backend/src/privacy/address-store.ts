import { pool } from '../db/pool'
import type { PrivacyFinding, PrivacyScan } from './scan'

export interface AddressScanSalvo extends PrivacyScan {
  id: number
  addressId: number
  scannedAt: Date
}

interface Linha {
  id: string
  address_id: string
  score: number
  grade: string
  address_info: Record<string, unknown>
  findings: PrivacyFinding[]
  scanner_version: string
  scanned_at: Date
}

function daLinha(r: Linha): AddressScanSalvo {
  return {
    id: Number(r.id),
    addressId: Number(r.address_id),
    score: r.score,
    grade: r.grade,
    walletInfo: r.address_info,
    findings: r.findings,
    scannerVersion: r.scanner_version,
    scannedAt: r.scanned_at,
  }
}

export async function salvarAddressScan(
  walletId: number,
  addressId: number,
  scan: PrivacyScan,
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO address_privacy_scans
       (wallet_id, address_id, score, grade, address_info, findings, scanner_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      walletId,
      addressId,
      scan.score,
      scan.grade,
      JSON.stringify(scan.walletInfo),
      JSON.stringify(scan.findings),
      scan.scannerVersion,
    ],
  )
  return Number(rows[0]!.id)
}

export async function ultimoAddressScan(
  walletId: number,
  addressId: number,
): Promise<AddressScanSalvo | null> {
  const { rows } = await pool.query<Linha>(
    `SELECT id, address_id, score, grade, address_info, findings, scanner_version, scanned_at
       FROM address_privacy_scans
      WHERE wallet_id = $1 AND address_id = $2
      ORDER BY scanned_at DESC, id DESC LIMIT 1`,
    [walletId, addressId],
  )
  return rows[0] ? daLinha(rows[0]) : null
}
