import { render } from './i18n'

export type Severity = 'info' | 'warning' | 'critical'

export type Lang = 'pt' | 'en'

export type SyncState = 'pending' | 'importing' | 'synced' | 'degraded' | 'error'

/**
 * Sem title nem body: o alerta guarda o tipo e os parâmetros, e o texto é
 * escolhido na hora de exibir, no idioma de quem lê.
 */
export const FONTES_DE_PRECO = ['coingecko', 'kraken', 'bitstamp', 'coinbase', 'mempool'] as const
export type FonteDePreco = (typeof FONTES_DE_PRECO)[number]

export interface Preferencias {
  theme: string
  currency: string
  priceSources: FonteDePreco[]
  feeSource: 'off' | 'node' | 'mempool'
}

export interface Precos {
  currency: string
  sources: { id: FonteDePreco; price: number | null; at: string; error?: string }[]
  median: number | null
}

export interface Taxas {
  source: 'off' | 'node' | 'mempool'
  blocks: Record<string, number | null> | null
  at: string
}

export interface Acessos {
  tor: { enabled: boolean; onion?: string }
  tailscale: { enabled: boolean; hostname?: string }
  cloudflare: { enabled: boolean; hostname?: string; warning: boolean }
}

export interface PontaDaCadeia {
  height: number
  backendHost: string
  isPublic: boolean
  at: string
}

export interface EventoDeCadeia {
  id: number
  type: string
  height: number | null
  blockHash: string | null
  txid: string | null
  vout: number | null
  payload: Record<string, unknown>
}

export interface AlertDetail {
  alert: Alert
  event: EventoDeCadeia | null
  wallet: { id: number; label: string; network: Network }
  confirmations: number | null
  siblings: Alert[]
}

export interface TxDetail {
  txid: string
  height: number | null
  blockHash: string | null
  vin: { txid: string; vout: number; address?: string; value?: number }[]
  vout: { n: number; address?: string; value: number }[]
  fee?: number
}

export interface PaginaDeAlertas {
  items: Alert[]
  /** cursor opaco da página seguinte; `null` quando acabou */
  nextCursor: string | null
}

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
  /** preenchida quando a carteira foi arquivada; o worker a ignora */
  archivedAt?: string | null
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
  preset?: string | null
  label?: string | null
  hasCredentials?: boolean
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
  wallets: (arquivadas = false) =>
    request<Wallet[]>('/api/wallets' + (arquivadas ? '?archived=true' : '')),
  changeWalletBackend: (id: number, backendId: number) =>
    request<Wallet>(`/api/wallets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ backendId }),
    }),
  preferences: () => request<Preferencias>('/api/preferences'),
  savePreferences: (mudanca: Partial<Preferencias>) =>
    request<Preferencias>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(mudanca),
    }),
  price: () => request<Precos>('/api/price'),
  fees: () => request<Taxas>('/api/fees'),
  chainTip: () => request<PontaDaCadeia>('/api/chain/tip'),
  access: () => request<Acessos>('/api/access'),
  alertDetail: (id: number) => request<AlertDetail>(`/api/alerts/${id}`),
  /**
   * A transação inteira, na fonte da carteira. **Só sai por clique**: num
   * explorador público esta chamada entrega mais um dado ao serviço.
   */
  transaction: (txid: string, walletId: number) =>
    request<TxDetail>(`/api/tx/${txid}?walletId=${walletId}`),
  archiveWallet: (id: number) =>
    request<Wallet>(`/api/wallets/${id}/archive`, { method: 'POST' }),
  unarchiveWallet: (id: number) =>
    request<Wallet>(`/api/wallets/${id}/unarchive`, { method: 'POST' }),
  removeWallet: async (id: number, confirm: string) => {
    const res = await fetch(`/api/wallets/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    })
    if (!res.ok) throw await res.json()
    return { ok: true as const }
  },
  addWallet: (
    label: string,
    entrada: { key?: string; address?: string; scriptType?: string },
    backendId?: number,
  ) =>
    request<Wallet>('/api/wallets', {
      method: 'POST',
      body: JSON.stringify({ label, ...entrada, backendId }),
    }),
  backends: () => request<Backend[]>('/api/backends'),
  addBackend: (corpo: {
    preset?: string
    kind?: BackendKind
    host?: string
    port?: number
    url?: string
    isPublic?: boolean
    network?: Network
    label?: string
    auth?: { mode: 'cookie' | 'userpass'; cookiePath?: string; user?: string; password?: string }
  }) =>
    request<Backend>('/api/backends', { method: 'POST', body: JSON.stringify(corpo) }),
  alerts: (
    params: {
      limit?: number
      cursor?: string
      type?: string
      severity?: string
      walletId?: number
    } = {},
  ) => {
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    if (params.cursor) q.set('cursor', params.cursor)
    if (params.type) q.set('type', params.type)
    if (params.severity) q.set('severity', params.severity)
    if (params.walletId) q.set('walletId', String(params.walletId))
    const busca = q.toString()
    return request<PaginaDeAlertas>('/api/alerts' + (busca ? '?' + busca : ''))
  },
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
