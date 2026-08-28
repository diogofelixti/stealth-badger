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

export interface Deteccao {
  found: boolean
  network?: Network
  host?: string
  url?: string
  rpcPort?: number
  cookiePath?: string
  cookieReadable?: boolean
  reachable?: boolean
  blocks?: number
  chain?: string
  reason?: 'notMounted' | 'noCookie' | 'unreachable'
  hint?: string
  compose?: string
}

/**
 * `enabled` diz que alguém configurou o caminho; `status` diz se ele respondeu.
 *
 * São medidas diferentes, e a diferença entre elas é o caso em que a pessoa
 * acha que está publicada e não está: o `.onion` no arquivo, e o Tor parado.
 * `unknown` é o terceiro valor de propósito, e nunca é pintado de vermelho: ele
 * quer dizer que a sonda não conseguiu perguntar, e não que a resposta foi não.
 */
export type EstadoDoAcesso = 'up' | 'down' | 'unknown'
export type FonteDoEstado = 'docker' | 'dns' | 'http' | 'none'

export interface CaminhoDeAcesso {
  enabled: boolean
  status: EstadoDoAcesso
  statusSource: FonteDoEstado
  /** o painel está criando o container deste caminho agora */
  creating?: boolean
  /** o que a última criação deixou como erro, quando falhou */
  error?: string
}

export interface Acessos {
  tor: CaminhoDeAcesso & { onion?: string }
  tailscale: CaminhoDeAcesso & { hostname?: string }
  cloudflare: CaminhoDeAcesso & { hostname?: string; warning: boolean }
  /**
   * Se esta instância oferece ligar e desligar pela tela, e se este usuário
   * pode. `available: false` é o padrão: sem `DOCKER_SOCKET` montado por quem
   * hospeda, o painel lê os acessos e não os controla.
   */
  control: {
    available: boolean
    isAdmin: boolean
    /** se o painel sabe **criar** o container, e não só ligar o que existe */
    canCreate?: boolean
  }
}

export type PerfilDeAcesso = 'tor' | 'tailscale' | 'cloudflared'

export interface ResultadoDoControle {
  ok: boolean
  profile: PerfilDeAcesso
  action: 'up' | 'down'
  /** `creating` é o container sendo criado agora, e não um estado do Docker */
  state?: string
  reason?: 'notCreated' | 'ambiguous' | 'unreachable' | 'engineError'
  hint?: string
  /** o comando de uma linha, quando o painel não pode resolver sozinho */
  command?: string
}

export interface AccessConfigSummary {
  profile: PerfilDeAcesso
  configured: boolean
  hostname: string | null
  hasSecret: boolean
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
  wallet?: { id: number; label: string }
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
  spentUtxoCount: number
  usedAddressCount: number
  backendIsPublic: boolean
  backendUrl: string
  /** `core`, `electrum` ou `esplora`: a espera do import depende disto */
  backendKind: BackendKind
  privacyScore: number | null
  privacyGrade: string | null
  privacyScannedAt: string | null
  privacyScanning?: boolean
  /** preenchida quando a carteira foi arquivada; o worker a ignora */
  archivedAt?: string | null
}

export interface RecommendationTool {
  name?: string
  title?: string
  url?: string
  [campo: string]: unknown
}

export type PrivacyRecommendation =
  | string
  | {
      urgency?: string
      headline?: string
      title?: string
      text?: string
      detail?: string
      action?: string
      tools?: RecommendationTool[]
      [campo: string]: unknown
    }

export interface PrivacyFinding {
  id: string
  severity: string
  confidence: string
  title: string
  description: string
  recommendation: PrivacyRecommendation
  scoreImpact: number
  params?: Record<string, unknown>
}

export interface PrivacyReport {
  latest: {
    score: number
    grade: string
    walletInfo: Record<string, unknown>
    findings: PrivacyFinding[]
    scannerVersion: string
    scannedAt: string
  } | null
  history: { score: number; grade: string; scannedAt: string }[]
  running: boolean
  error: string | null
  /**
   * O código da recusa, quando ela tem um.
   *
   * A mensagem do servidor não se traduz, e a tela é bilíngue. Recusas com
   * significado — como a varredura que não conseguiu consultar a cadeia —
   * precisam chegar traduzíveis: a pessoa tem de entender **por que** o sistema
   * não sabe, e não ler português no meio de uma interface em inglês.
   */
  errorCode?: string | null
  /**
   * O que o watchtower mediu sozinho, na cadeia que ele mesmo sincronizou.
   *
   * O painel prefere isto ao `walletInfo` do scanner: é de primeira mão, e
   * continua valendo quando o scanner não conseguiu consultar nada. Foi assim
   * que a barra de reuso mostrou "0 de 0" numa carteira com dois alertas de
   * `address reuse` que o próprio watchtower tinha gerado.
   */
  measured?: { activeAddresses: number; reusedAddresses: number }
}

export interface AddressPrivacyReport {
  latest: {
    id: number
    addressId: number
    score: number
    grade: string
    walletInfo: Record<string, unknown>
    findings: PrivacyFinding[]
    scannerVersion: string
    scannedAt: string
  } | null
  running: boolean
  error: string | null
}

export interface WalletAddress {
  id: number
  address: string
  derivationPath: string
  used: boolean
  utxoCount: number
  balanceSats: string
  privacyScore: number | null
  privacyGrade: string | null
  privacyScannedAt: string | null
}

export interface TxPrivacyReport {
  latest: {
    txid: string
    score: number | null
    grade: string | null
    txType: string | null
    txInfo: Record<string, unknown>
    chainAnalysis: Record<string, unknown>
    boltzmann: Record<string, unknown> | null
    findings: PrivacyFinding[]
    scannerVersion: string
    scannedAt: string
    error: string | null
  } | null
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
  /**
   * O que a última sonda mediu. `unknown` é fonte ainda não medida, e não
   * fonte ruim — o seletor de carteira esconde só o que respondeu que não.
   */
  status?: 'up' | 'down' | 'unknown'
  height?: number
  statusError?: string
  checkedAt?: string
}

export interface Utxo {
  txid: string
  vout: number
  addressId: number
  valueSats: number
  height: number | null
  spent: boolean
  spentAtTxid: string | null
  address: string
  derivationPath: string
  addressPrivacyScore: number | null
  addressPrivacyGrade: string | null
  addressPrivacyScannedAt: string | null
  label: string | null
  tags: string[]
  frozen: boolean
}

/**
 * Uma fonte que pode analisar: só `esplora`, porque é o único formato que o
 * `am-i-exposed` fala. As da própria pessoa vêm antes das públicas.
 */
export interface CandidataDeAnalise {
  id: number
  url: string
  isPublic: boolean
  preset: string | null
  label: string | null
  escolhida: boolean
}

export interface FonteDeAnaliseDaRede {
  network: Network
  candidates: CandidataDeAnalise[]
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
  accessControl: (profile: PerfilDeAcesso, action: 'up' | 'down') =>
    request<ResultadoDoControle>('/api/access/control', {
      method: 'POST',
      body: JSON.stringify({ profile, action }),
    }),
  accessConfig: (profile: PerfilDeAcesso) =>
    request<AccessConfigSummary>(`/api/access/config/${profile}`),
  saveAccessConfig: (
    profile: PerfilDeAcesso,
    config: { hostname?: string; token?: string; authKey?: string },
  ) =>
    request<AccessConfigSummary>(`/api/access/config/${profile}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
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
  detectNode: (datadir: string) =>
    request<Deteccao>('/api/backends/detect', {
      method: 'POST',
      body: JSON.stringify({ datadir }),
    }),
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
  testBackend: (id: number) =>
    request<{ ok: boolean; height?: number; ms: number; reason?: string }>(
      `/api/backends/${id}/test`,
      { method: 'POST' },
    ),
  analysisSource: (network: Network) =>
    request<FonteDeAnaliseDaRede>(`/api/analysis-source?network=${network}`),
  chooseAnalysisSource: (network: Network, backendId: number) =>
    request<FonteDeAnaliseDaRede>('/api/analysis-source', {
      method: 'PUT',
      body: JSON.stringify({ network, backendId }),
    }),
  scanAddressPrivacy: (walletId: number, addressId: number) =>
    request<{ status: string }>(`/api/wallets/${walletId}/addresses/${addressId}/privacy`, {
      method: 'POST',
    }),
  scanUsedAddressPrivacy: (walletId: number) =>
    request<{ status: string; addresses: number }>(`/api/wallets/${walletId}/addresses/privacy`, {
      method: 'POST',
    }),
  addressPrivacy: (walletId: number, addressId: number) =>
    request<AddressPrivacyReport>(`/api/wallets/${walletId}/addresses/${addressId}/privacy`),
  addresses: (walletId: number) =>
    request<WalletAddress[]>(`/api/wallets/${walletId}/addresses`),
  scanTxPrivacy: (walletId: number, txid: string) =>
    request<{ status: string }>(`/api/wallets/${walletId}/tx/${txid}/privacy`, {
      method: 'POST',
    }),
  txPrivacy: (walletId: number, txid: string) =>
    request<TxPrivacyReport>(`/api/wallets/${walletId}/tx/${txid}/privacy`),
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
