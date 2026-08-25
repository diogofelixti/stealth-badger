import type { ChainAdapter, ChainCapabilities, TxRef, Utxo } from './types'

interface EsploraStatus {
  confirmed: boolean
  block_height?: number
  block_hash?: string
}

interface EsploraTx {
  txid: string
  status: EsploraStatus
}

interface EsploraUtxo {
  txid: string
  vout: number
  value: number
  status: EsploraStatus
}

export function createEsploraAdapter(
  baseUrl: string,
  opts: { isPublic?: boolean; fetchFn?: typeof fetch } = {},
): ChainAdapter {
  const base = baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetchFn ?? fetch
  const host = (() => {
    try {
      return new URL(base).host
    } catch {
      return base
    }
  })()

  async function get(path: string): Promise<Response> {
    const res = await doFetch(base + path)
    if (!res.ok) {
      throw new Error('Esplora respondeu ' + res.status + ' em ' + path + ' (' + host + ')')
    }
    return res
  }

  const caps: ChainCapabilities = {
    randomAccess: true,
    needsRegistration: false,
    supportsSubscribe: false,
    hasTxIndex: true,
    isPublic: opts.isPublic ?? true,
    host,
  }

  return {
    capabilities: () => caps,

    async tipHeight() {
      return Number((await (await get('/blocks/tip/height')).text()).trim())
    },

    async blockHashAt(height: number) {
      return (await (await get('/block-height/' + height)).text()).trim()
    },

    async getHistoryForAddress(address: string): Promise<TxRef[]> {
      const txs = (await (await get('/address/' + address + '/txs')).json()) as EsploraTx[]
      return txs.map(t => ({
        txid: t.txid,
        height: t.status.confirmed ? t.status.block_height ?? null : null,
        blockHash: t.status.confirmed ? t.status.block_hash ?? null : null,
      }))
    },

    async getUtxosForAddress(address: string): Promise<Utxo[]> {
      const utxos = (await (await get('/address/' + address + '/utxo')).json()) as EsploraUtxo[]
      return utxos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        height: u.status.confirmed ? u.status.block_height ?? null : null,
      }))
    },
  }
}
