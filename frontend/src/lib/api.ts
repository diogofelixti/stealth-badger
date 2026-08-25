export type Severity = 'info' | 'warning' | 'critical'

export type Lang = 'pt' | 'en'

export type SyncState = 'pending' | 'importing' | 'synced' | 'degraded' | 'error'

/**
 * Sem title nem body: o alerta guarda o tipo e os parâmetros, e o texto é
 * escolhido na hora de exibir, no idioma de quem lê.
 */
export interface Alert {
  id: number
  walletId: number
  type: string
  severity: Severity
  params: Record<string, unknown>
  createdAt: string
  readAt?: string | null
}

export type Catalog = Record<string, string>

export interface Wallet {
  id: number
  label: string
  scriptType: string
  network: string
  fingerprint: string
  syncState: SyncState
  syncProgress: number
  syncHeight: number | null
  balanceSats: string
  utxoCount: number
  frozenCount: number
  backendIsPublic: boolean
  backendUrl: string
}

export interface Me {
  email: string
  isAdmin: boolean
  language: Lang
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, language: Lang) =>
    request<{ ok: true; isAdmin: boolean }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, language }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/api/auth/me'),
  wallets: () => request<Wallet[]>('/api/wallets'),
  addWallet: (label: string, key: string) =>
    request<Wallet>('/api/wallets', {
      method: 'POST',
      body: JSON.stringify({ label, key }),
    }),
  alerts: () => request<Alert[]>('/api/alerts'),
  catalog: (lang: Lang) => request<Catalog>(`/api/i18n/${lang}`),
  setLanguage: (language: Lang) =>
    request<{ ok: true; language: Lang }>('/api/auth/language', {
      method: 'PUT',
      body: JSON.stringify({ language }),
    }),
}
