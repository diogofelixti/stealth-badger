import type { DeliverableAlert, DeliveryResult } from './ntfy'

export interface WebhookConfig {
  url: string
  secret?: string
}

export async function sendToWebhook(
  alert: DeliverableAlert,
  config: WebhookConfig,
  fetchFn: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.secret) headers['X-Stealth-Badger-Secret'] = config.secret

  try {
    const res = await fetchFn(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(alert),
    })
    return res.ok ? { ok: true } : { ok: false, error: 'webhook respondeu ' + res.status }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
