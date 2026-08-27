import { render } from './i18n'

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

export type WalletKind = 'xpub' | 'address'

export type Network = 'mainnet' | 'signet' | 'testnet'

export interface Wallet {
  id: number
  label: string
  kind: WalletKind
  /** preenchido apenas quando `kind` é `address` */
  address: string | null
  scriptType: string
  network: Network
  fingerprint: string
  syncState: SyncState
  syncProgress: number
  syncHeight: number | null
  syncError: string | null
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

export type BackendKind = 'esplora' | 'electrum' | 'core'

export interface Backend {
  id: number
  kind: BackendKind
  url: string
  isPublic: boolean
  network: Network
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

export type ChannelKind = 'ntfy' | 'webhook'

export interface Channel {
  id: number
  kind: ChannelKind
  enabled: boolean
}

export interface Achado {
  walletId: number
  walletLabel: string
  address: string
  derivationPath: string
  used: boolean
  balanceSats: number
}

export interface Me {
  email: string
  isAdmin: boolean
  language: Lang
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // O cabeçalho só entra quando existe corpo. O Fastify recusa corpo vazio
  // anunciado como JSON — `FST_ERR_CTP_EMPTY_JSON_BODY` —, e mandá-lo sempre
  // quebrava todo POST sem corpo: sair, analisar privacidade, testar canal.
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      code?: string
      params?: Record<string, unknown>
    }
    throw Object.assign(new Error(body.error ?? `erro ${res.status}`), {
      code: body.code,
      params: body.params,
    })
  }
  return res.json() as Promise<T>
}

/**
 * Erro da API, com o código que permite traduzir a frase na tela.
 *
 * A mensagem do servidor viaja junto como reserva: código novo no servidor e
 * catálogo antigo na tela é situação normal num deploy, e cair no texto em
 * português é pior que traduzido, mas muito melhor que mostrar a chave crua.
 */
export interface ErroDaApi extends Error {
  code?: string
  params?: Record<string, unknown>
}

export function mensagemDoErro(catalog: Catalog, err: unknown, lang: Lang): string {
  const e = err as ErroDaApi
  const chave = e?.code ? 'error.' + e.code : null
  if (chave && catalog[chave]) return render(catalog, chave, e.params ?? {}, lang)
  return e?.message ?? String(err)
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
  addWallet: (
    label: string,
    entrada: { key?: string; address?: string },
    backendId?: number,
  ) =>
    request<Wallet>('/api/wallets', {
      method: 'POST',
      body: JSON.stringify({ label, ...entrada, backendId }),
    }),
  backends: () => request<Backend[]>('/api/backends'),
  addBackend: (kind: BackendKind, url: string, isPublic: boolean, network?: Network) =>
    request<Backend>('/api/backends', {
      method: 'POST',
      body: JSON.stringify({ kind, url, isPublic, network }),
    }),
  alerts: () => request<Alert[]>('/api/alerts'),
  search: (q: string) => request<Achado[]>(`/api/search?q=${encodeURIComponent(q)}`),
  channels: () => request<Channel[]>('/api/channels'),
  addChannel: (config: { kind: ChannelKind; topic?: string; server?: string; url?: string }) =>
    request<Channel>('/api/channels', { method: 'POST', body: JSON.stringify(config) }),
  testChannel: (id: number) =>
    request<{ ok: boolean; error?: string }>(`/api/channels/${id}/test`, { method: 'POST' }),
  removeChannel: async (id: number) => {
    const res = await fetch(`/api/channels/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) throw new Error(`erro ${res.status}`)
  },
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
