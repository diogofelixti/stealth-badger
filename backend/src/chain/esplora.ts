import type {
  AddressStatus,
  ChainAdapter,
  ChainCapabilities,
  Outspend,
  TxRef,
  Utxo,
} from './types'

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

interface EsploraOutspend {
  spent: boolean
  txid?: string
  status?: EsploraStatus
}

interface EsploraUtxo {
  txid: string
  vout: number
  value: number
  status: EsploraStatus
}

/**
 * Respostas que melhoram sozinhas com o tempo.
 *
 * `429` é o explorador dizendo que você pediu demais; `503`, que ele está
 * sobrecarregado agora. Nos dois casos repetir resolve. Um `404` não melhora
 * esperando: repetir só atrasa o erro e gasta a cota que o `429` já disputa.
 */
const VALE_ESPERAR = new Set([429, 503])

/** Quanto do corpo de erro cabe na mensagem. */
const TRECHO_DE_CORPO = 200

const TENTATIVAS_PADRAO = 4
const ESPERA_INICIAL_MS = 500
const ESPERA_MAXIMA_MS = 30_000

export interface EsploraOptions {
  isPublic?: boolean
  fetchFn?: typeof fetch
  /** injetável para que o teste não durma de verdade */
  sleepFn?: (ms: number) => Promise<void>
  maxRetries?: number
}

export function createEsploraAdapter(
  baseUrl: string,
  opts: EsploraOptions = {},
): ChainAdapter {
  const base = baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetchFn ?? fetch
  const dormir =
    opts.sleepFn ?? ((ms: number) => new Promise<void>(pronto => setTimeout(pronto, ms)))
  const maxRetries = opts.maxRetries ?? TENTATIVAS_PADRAO
  const host = (() => {
    try {
      return new URL(base).host
    } catch {
      return base
    }
  })()

  /**
   * Quanto esperar antes de tentar de novo.
   *
   * Quando o servidor manda `Retry-After`, é ele que decide: discutir com quem
   * está limitando é o caminho mais curto para ser bloqueado de vez. Sem esse
   * cabeçalho, a espera dobra a cada tentativa e ganha um ruído aleatório —
   * sem o ruído, várias carteiras sincronizando juntas voltariam todas no
   * mesmo instante e reproduziriam a rajada que causou o limite.
   */
  function esperaAntesDeRepetir(res: Response, tentativa: number): number {
    const cabecalho = res.headers.get('retry-after')
    if (cabecalho) {
      const segundos = Number(cabecalho)
      if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000
    }
    const base = Math.min(ESPERA_INICIAL_MS * 2 ** tentativa, ESPERA_MAXIMA_MS)
    return base + Math.floor(Math.random() * (base / 4))
  }

  async function get(path: string): Promise<Response> {
    let ultima: Response | null = null

    for (let tentativa = 0; tentativa <= maxRetries; tentativa += 1) {
      const res = await doFetch(base + path)
      if (res.ok) return res

      if (!VALE_ESPERAR.has(res.status)) {
        // O explorador costuma escrever o motivo no corpo — "Too many unspent
        // transaction outputs (>500)" foi um caso real. Sem trazê-lo, o log
        // registra só o número, e diagnosticar exige repetir a chamada à mão.
        const motivo = (await res.text().catch(() => '')).trim().slice(0, TRECHO_DE_CORPO)
        throw new Error(
          'Esplora respondeu ' +
            res.status +
            ' em ' +
            path +
            ' (' +
            host +
            ')' +
            (motivo ? ': ' + motivo : ''),
        )
      }

      ultima = res
      if (tentativa === maxRetries) break
      await dormir(esperaAntesDeRepetir(res, tentativa))
    }

    throw new Error(
      'Esplora ' + host + ' recusou ' + path + ' por limite de taxa (' +
        ultima?.status +
        ') depois de ' +
        maxRetries +
        ' tentativas. Aponte para infraestrutura própria, ou espere.',
    )
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

    async getOutspend(txid: string, vout: number): Promise<Outspend | null> {
      const r = (await (
        await get('/tx/' + txid + '/outspend/' + vout)
      ).json()) as EsploraOutspend
      if (!r.spent || !r.txid) return null
      return {
        spentByTxid: r.txid,
        height: r.status?.confirmed ? r.status.block_height ?? null : null,
        blockHash: r.status?.confirmed ? r.status.block_hash ?? null : null,
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
