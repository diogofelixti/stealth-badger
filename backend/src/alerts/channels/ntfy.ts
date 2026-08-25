export interface DeliverableAlert {
  id: number
  walletId: number
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
}

export interface DeliveryResult {
  ok: boolean
  error?: string
}

export interface NtfyConfig {
  server: string
  topic: string
  token?: string
}

const PRIORITY: Record<DeliverableAlert['severity'], string> = {
  info: 'default',
  warning: 'high',
  critical: 'high',
}

const TAG: Record<DeliverableAlert['severity'], string> = {
  info: 'information_source',
  warning: 'warning',
  critical: 'rotating_light',
}

export async function sendToNtfy(
  alert: DeliverableAlert,
  config: NtfyConfig,
  fetchFn: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    Title: alert.title,
    Priority: PRIORITY[alert.severity],
    Tags: TAG[alert.severity],
  }
  if (config.token) headers.Authorization = 'Bearer ' + config.token

  try {
    const res = await fetchFn(config.server.replace(/\/+$/, '') + '/' + config.topic, {
      method: 'POST',
      headers,
      body: alert.body,
    })
    return res.ok ? { ok: true } : { ok: false, error: 'ntfy respondeu ' + res.status }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
