import { pool } from '../db/pool'
import { activeEvents } from './log'

interface CreatedPayload {
  addressId: number
  valueSats: number
}

interface SpentPayload {
  spentAtTxid: string | null
}

export async function projectWallet(walletId: number): Promise<void> {
  const events = await activeEvents(walletId)
  const utxos = new Map<
    string,
    {
      txid: string
      vout: number
      addressId: number
      valueSats: number
      height: number | null
      spent: boolean
      spentAtTxid: string | null
    }
  >()

  for (const e of events) {
    if (e.type === 'utxo_created' && e.txid !== null && e.vout !== null) {
      const p = e.payload as unknown as CreatedPayload
      utxos.set(e.txid + ':' + e.vout, {
        txid: e.txid,
        vout: e.vout,
        addressId: p.addressId,
        valueSats: p.valueSats,
        height: e.height,
        spent: false,
        spentAtTxid: null,
      })
    } else if (e.type === 'utxo_spent' && e.txid !== null && e.vout !== null) {
      const found = utxos.get(e.txid + ':' + e.vout)
      if (!found) continue
      // O evento é que diz que foi gasto. O txid é detalhe, e pode faltar
      // quando o backend não soube dizer quem consumiu a saída.
      found.spent = true
      const quemGastou = (e.payload as unknown as SpentPayload).spentAtTxid
      // "desconhecido" é o sentinela que os eventos antigos gravavam quando o
      // motor era obrigado a preencher o campo. `chain_events` é append-only:
      // o texto continua lá, e é aqui que ele deixa de virar dado.
      found.spentAtTxid = quemGastou && quemGastou !== 'desconhecido' ? quemGastou : null
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM utxos WHERE wallet_id = $1', [walletId])
    for (const u of utxos.values()) {
      await client.query(
        `INSERT INTO utxos (wallet_id, txid, vout, address_id, value_sats, height, spent, spent_at_txid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [walletId, u.txid, u.vout, u.addressId, u.valueSats, u.height, u.spent, u.spentAtTxid],
      )
    }
    // O congelamento é do usuário e vive em `utxo_marks`, fora da projeção.
    // Aqui ele é apenas copiado de volta, para que as consultas que já leem
    // `utxos.frozen` continuem verdadeiras depois da reconstrução.
    await client.query(
      `UPDATE utxos u SET frozen = m.frozen
         FROM utxo_marks m
        WHERE m.wallet_id = u.wallet_id AND m.txid = u.txid AND m.vout = u.vout
          AND u.wallet_id = $1`,
      [walletId],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function walletBalance(walletId: number): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(sum(value_sats), 0)::bigint AS total
       FROM utxos WHERE wallet_id = $1 AND NOT spent`,
    [walletId],
  )
  return Number(rows[0]!.total)
}
