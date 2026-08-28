import { open } from '../../crypto/secretbox'
import { pool } from '../../db/pool'
import type { Lang } from '../../i18n/catalog'
import { renderAlert } from '../../i18n/render'
import type { Severity } from '../rules'
import { sendToNtfy } from './ntfy'
import { sendToWebhook } from './webhook'

interface DeliveryDeps {
  ntfy?: typeof sendToNtfy
  webhook?: typeof sendToWebhook
}

export async function deliver(
  alert: {
    id: number
    walletId: number
    type: string
    severity: Severity
    params: Record<string, unknown>
  },
  userId: number,
  deps: DeliveryDeps = {},
): Promise<void> {
  const { rows: userRows } = await pool.query<{ language: Lang }>(
    'SELECT language FROM users WHERE id = $1',
    [userId],
  )
  const lang: Lang = userRows[0]?.language ?? 'pt'
  const { rows: walletRows } = await pool.query<{ label: string }>(
    'SELECT label FROM wallets WHERE id = $1 AND user_id = $2',
    [alert.walletId, userId],
  )
  const params = walletRows[0]?.label
    ? { ...alert.params, walletLabel: walletRows[0].label }
    : alert.params
  const { title, body } = renderAlert(alert.type, params, lang)
  const walletLabel = walletRows[0]?.label
  const titleWithWallet = walletLabel ? walletLabel + ' · ' + title : title
  const rendered = { ...alert, title: titleWithWallet, body }

  const { rows } = await pool.query<{ id: string; kind: string; config_encrypted: Buffer }>(
    'SELECT id, kind, config_encrypted FROM channels WHERE user_id = $1 AND enabled',
    [userId],
  )

  const report: Record<string, unknown> = {}
  for (const row of rows) {
    const config = JSON.parse(open(row.config_encrypted, process.env.MASTER_KEY_HEX!))
    const result =
      row.kind === 'ntfy'
        ? await (deps.ntfy ?? sendToNtfy)(rendered, config)
        : await (deps.webhook ?? sendToWebhook)(rendered, config)
    report[row.kind + ':' + row.id] = result
  }

  await pool.query('UPDATE alerts SET delivered = $2 WHERE id = $1', [
    alert.id,
    JSON.stringify(report),
  ])
}
