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
  privacyScore: number | null
  privacyGrade: string | null
  privacyScannedAt: string | null
  privacyScanning?: boolean
}

export interface PrivacyFinding {
  id: string
  severity: string
  confidence: string
  title: string
  description: string
  recommendation: string
  scoreImpact: number
}

export interface PrivacyReport {
  latest: {
    score: number
    grade: string
    findings: PrivacyFinding[]
    scannerVersion: string
    scannedAt: string
  } | null
  history: { score: number; grade: string; scannedAt: string }[]
  running: boolean
  error: string | null
}

export type BackendKind = 'esplora' | 'electrum'

export interface Backend {
  id: number
  kind: BackendKind
  url: string
  isPublic: boolean
  network: string
  /** `global` é o backend da instância; `own`, o que o usuário cadastrou */
  scope: 'global' | 'own'
}

export interface Utxo {
  txid: string
  vout: number
  valueSats: number
  height: number | null
  address: string
  derivationPath: string
  label: string | null
  tags: string[]
  frozen: boolean
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
  addWallet: (label: string, key: string, backendId?: number) =>
    request<Wallet>('/api/wallets', {
      method: 'POST',
      body: JSON.stringify({ label, key, backendId }),
    }),
  backends: () => request<Backend[]>('/api/backends'),
  addBackend: (kind: BackendKind, url: string, isPublic: boolean) =>
    request<Backend>('/api/backends', {
      method: 'POST',
      body: JSON.stringify({ kind, url, isPublic }),
    }),
  alerts: () => request<Alert[]>('/api/alerts'),
  scanPrivacy: (walletId: number) =>
    request<{ status: string }>(`/api/wallets/${walletId}/scan`, { method: 'POST' }),
  privacy: (walletId: number) => request<PrivacyReport>(`/api/wallets/${walletId}/privacy`),
  utxos: (walletId: number) => request<Utxo[]>(`/api/wallets/${walletId}/utxos`),
  markUtxo: (
    walletId: number,
    txid: string,
    vout: number,
    marca: { label?: string | null; tags?: string[]; frozen?: boolean },
  ) =>
    request<{ ok: true }>(`/api/wallets/${walletId}/utxos/${txid}/${vout}`, {
      method: 'PUT',
      body: JSON.stringify(marca),
    }),
  exportLabels: (walletId: number) => `/api/wallets/${walletId}/labels`,
  importLabels: async (walletId: number, arquivo: string) => {
    const res = await fetch(`/api/wallets/${walletId}/labels`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain' },
      body: arquivo,
    })
    if (!res.ok) throw new Error((await res.json()).error ?? `erro ${res.status}`)
    return (await res.json()) as { imported: number; ignored: number }
  },
  catalog: (lang: Lang) => request<Catalog>(`/api/i18n/${lang}`),
  setLanguage: (language: Lang) =>
    request<{ ok: true; language: Lang }>('/api/auth/language', {
      method: 'PUT',
      body: JSON.stringify({ language }),
    }),
}
