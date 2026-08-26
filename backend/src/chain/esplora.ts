import type { AddressStatus, ChainAdapter, ChainCapabilities, TxRef, Utxo } from './types'

interface EsploraStatus {
  confirmed: boolean
  block_height?: number
  block_hash?: string
}

interface EsploraTx {
  txid: string
  status: EsploraStatus
}

interface EsploraStats {
  funded_txo_count: number
  spent_txo_count: number
  tx_count: number
}

interface EsploraAddress {
  chain_stats: EsploraStats
  mempool_stats: EsploraStats
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

    /**
     * `/address/:a` devolve só contadores — uns 200 bytes — enquanto
     * `/address/:a/txs` devolve as transações inteiras. Como o motor só quer
     * saber *se* algo mudou, os contadores bastam e custam uma fração da
     * banda no explorador público.
     */
    async getAddressStatus(address: string): Promise<AddressStatus> {
      const a = (await (await get('/address/' + address)).json()) as EsploraAddress
      const chain = a.chain_stats
      const mempool = a.mempool_stats
      return {
        used: chain.tx_count + mempool.tx_count > 0,
        // gastar não muda tx_count sozinho, e confirmar move a contagem de um
        // lado para o outro sem mexer no total: os seis contadores juntos é
        // que fecham o retrato.
        status: [
          chain.tx_count,
          chain.funded_txo_count,
          chain.spent_txo_count,
          mempool.tx_count,
          mempool.funded_txo_count,
          mempool.spent_txo_count,
        ].join(':'),
      }
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
