import { pool } from '../db/pool'

export interface Marca {
  txid: string
  vout: number
  label: string | null
  tags: string[]
  frozen: boolean
}

export interface UtxoNaTela extends Marca {
  addressId: number
  valueSats: number
  height: number | null
  address: string
  derivationPath: string
  addressPrivacyScore: number | null
  addressPrivacyGrade: string | null
  addressPrivacyScannedAt: Date | null
}

export interface Alteracao {
  label?: string | null
  tags?: string[]
  frozen?: boolean
}

/**
 * Grava só o que foi informado.
 *
 * Um formulário que manda apenas `frozen` não pode apagar o rótulo que o
 * usuário escreveu antes — `COALESCE` no valor nulo é o que separa "não
 * mencionei" de "quero limpar". Limpar rótulo é possível mandando string
 * vazia, que vira `NULL` na entrada.
 */
export async function marcarUtxo(
  walletId: number,
  txid: string,
  vout: number,
  mudanca: Alteracao,
): Promise<void> {
  const label = mudanca.label === undefined ? null : mudanca.label?.trim() || null
  await pool.query(
    `INSERT INTO utxo_marks (wallet_id, txid, vout, label, tags, frozen)
     VALUES ($1,$2,$3,$4,COALESCE($5::text[],'{}'),COALESCE($6::boolean,false))
     ON CONFLICT (wallet_id, txid, vout) DO UPDATE SET
       label      = CASE WHEN $7::boolean THEN $4 ELSE utxo_marks.label END,
       tags       = COALESCE($5::text[], utxo_marks.tags),
       frozen     = COALESCE($6::boolean, utxo_marks.frozen),
       updated_at = now()`,
    [
      walletId,
      txid,
      vout,
      label,
      mudanca.tags ?? null,
      mudanca.frozen ?? null,
      mudanca.label !== undefined,
    ],
  )
}

export async function marcasDaCarteira(walletId: number): Promise<Marca[]> {
  const { rows } = await pool.query<{
    txid: string
    vout: number
    label: string | null
    tags: string[]
    frozen: boolean
  }>(
    `SELECT txid, vout, label, tags, frozen FROM utxo_marks
      WHERE wallet_id = $1 ORDER BY txid, vout`,
    [walletId],
  )
  return rows
}

/** UTXOs não gastos, já com a marca do usuário costurada. */
export async function utxosDaCarteira(walletId: number): Promise<UtxoNaTela[]> {
  const { rows } = await pool.query<{
    txid: string
    vout: number
    value_sats: string
    height: number | null
    address_id: string
    address: string
    derivation_path: string
    address_privacy_score: number | null
    address_privacy_grade: string | null
    address_privacy_scanned_at: Date | null
    label: string | null
    tags: string[] | null
    frozen: boolean | null
  }>(
    `SELECT u.txid, u.vout, u.value_sats, u.height,
            a.id AS address_id, a.address, a.derivation_path,
            aps.score AS address_privacy_score,
            aps.grade AS address_privacy_grade,
            aps.scanned_at AS address_privacy_scanned_at,
            m.label, m.tags, m.frozen
       FROM utxos u
       JOIN addresses a ON a.id = u.address_id
       LEFT JOIN utxo_marks m
         ON m.wallet_id = u.wallet_id AND m.txid = u.txid AND m.vout = u.vout
       LEFT JOIN LATERAL (
         SELECT score, grade, scanned_at
           FROM address_privacy_scans s
          WHERE s.wallet_id = u.wallet_id AND s.address_id = a.id
          ORDER BY s.scanned_at DESC, s.id DESC LIMIT 1
       ) aps ON true
      WHERE u.wallet_id = $1 AND NOT u.spent
      ORDER BY u.value_sats DESC, u.txid, u.vout`,
    [walletId],
  )
  return rows.map(r => ({
    txid: r.txid,
    vout: r.vout,
    addressId: Number(r.address_id),
    valueSats: Number(r.value_sats),
    height: r.height,
    address: r.address,
    derivationPath: r.derivation_path,
    addressPrivacyScore: r.address_privacy_score,
    addressPrivacyGrade: r.address_privacy_grade,
    addressPrivacyScannedAt: r.address_privacy_scanned_at,
    label: r.label,
    tags: r.tags ?? [],
    frozen: r.frozen ?? false,
  }))
}
