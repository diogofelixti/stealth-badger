import { createConnection, type Socket } from 'node:net'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import * as btc from '@scure/btc-signer'
import { electrumScripthash } from '../wallet/derive'
import type { Network } from '../wallet/descriptor'
import type { AddressStatus, ChainAdapter, ChainCapabilities, TxRef, Utxo } from './types'

/**
 * Erro que o próprio servidor devolveu na resposta — bloco inexistente,
 * parâmetro recusado. É resposta legítima, não conexão quebrada: derrubar o
 * socket por causa dela custaria uma reconexão a cada consulta de altura fora
 * do alcance.
 */
class ElectrumRpcError extends Error {}

interface Transport {
  call(method: string, params: unknown[]): Promise<unknown>
  close(): void
}
type ConnectFn = () => Promise<Transport>

export interface ElectrumOptions {
  host: string
  port: number
  network: Network
  isPublic?: boolean
  connect?: ConnectFn
}

interface ElectrumHistory {
  tx_hash: string
  height: number
}

interface ElectrumUnspent {
  tx_hash: string
  tx_pos: number
  value: number
  height: number
}

/** JSON-RPC delimitado por quebra de linha sobre TCP. */
function tcpTransport(host: string, port: number): ConnectFn {
  return () =>
    new Promise<Transport>((resolve, reject) => {
      const socket: Socket = createConnection({ host, port }, () => {
        let buffer = ''
        let nextId = 1
        const pending = new Map<
          number,
          { ok: (v: unknown) => void; fail: (e: Error) => void }
        >()

        socket.on('data', chunk => {
          buffer += chunk.toString('utf8')
          let newline: number
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline)
            buffer = buffer.slice(newline + 1)
            if (!line.trim()) continue
            const msg = JSON.parse(line) as {
              id?: number
              result?: unknown
              error?: { message: string }
            }
            // notificação de assinatura: chega sem id e não responde a ninguém
            if (msg.id === undefined) continue
            const waiting = pending.get(msg.id)
            if (!waiting) continue
            pending.delete(msg.id)
            if (msg.error) waiting.fail(new ElectrumRpcError(msg.error.message))
            else waiting.ok(msg.result)
          }
        })

        socket.on('error', err => {
          for (const w of pending.values()) w.fail(err)
          pending.clear()
        })

        resolve({
          call(method, params) {
            const id = nextId++
            return new Promise((ok, fail) => {
              pending.set(id, { ok, fail })
              socket.write(`${JSON.stringify({ id, method, params })}\n`)
            })
          },
          close: () => socket.destroy(),
        })
      })
      socket.on('error', reject)
    })
}

function addressToScripthash(address: string, network: Network): string {
  const net = network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
  const decoded = btc.Address(net).decode(address)
  return electrumScripthash(btc.OutScript.encode(decoded))
}

export function createElectrumAdapter(opts: ElectrumOptions): ChainAdapter {
  const connect = opts.connect ?? tcpTransport(opts.host, opts.port)
  let transport: Transport | null = null

  async function call(method: string, params: unknown[] = []): Promise<unknown> {
    if (!transport) transport = await connect()
    try {
      return await transport.call(method, params)
    } catch (err) {
      // insistir numa conexão já quebrada faria toda consulta seguinte falhar
      // com a mesma causa até o processo reiniciar. Fechar antes de soltar a
      // referência importa: soltá-la sozinha deixaria o socket aberto e sem
      // dono, que é vazamento silencioso.
      if (!(err instanceof ElectrumRpcError)) {
        transport?.close()
        transport = null
      }
      throw new Error(
        `Electrum ${opts.host}:${opts.port} falhou em ${method}: ${(err as Error).message}`,
      )
    }
  }

  const caps: ChainCapabilities = {
    randomAccess: true,
    needsRegistration: false,
    supportsSubscribe: true,
    hasTxIndex: true,
    // um servidor Electrum é quase sempre o do próprio usuário; o Esplora
    // público é que é a exceção consciente
    isPublic: opts.isPublic ?? false,
    host: `${opts.host}:${opts.port}`,
  }

  return {
    capabilities: () => caps,

    async tipHeight() {
      const r = (await call('blockchain.headers.subscribe')) as { height: number }
      return r.height
    },

    async blockHashAt(height: number) {
      const headerHex = (await call('blockchain.block.header', [height])) as string
      // hash do bloco = sha256 duplo do cabeçalho de 80 bytes, em ordem invertida
      const digest = sha256(sha256(hexToBytes(headerHex)))
      return bytesToHex(Uint8Array.from(digest).reverse())
    },

    /**
     * O protocolo Electrum já publica exatamente o retrato que a varredura
     * incremental precisa: o *status* do scripthash, um hash do histórico que
     * só muda quando o histórico muda. Custa uma chamada e devolve 32 bytes.
     */
    async getAddressStatus(address: string): Promise<AddressStatus> {
      const scripthash = addressToScripthash(address, opts.network)
      const status = (await call('blockchain.scripthash.subscribe', [scripthash])) as
        | string
        | null
      return { used: status !== null, status }
    },

    async getHistoryForAddress(address: string): Promise<TxRef[]> {
      const scripthash = addressToScripthash(address, opts.network)
      const rows = (await call('blockchain.scripthash.get_history', [
        scripthash,
      ])) as ElectrumHistory[]
      return rows.map(r => ({
        txid: r.tx_hash,
        // 0 ou negativo significa mempool
        height: r.height > 0 ? r.height : null,
        // o protocolo não entrega o hash junto do histórico; o motor busca
        // por altura quando precisa, ao custo de uma chamada extra
        blockHash: null,
      }))
    },

    close() {
      transport?.close()
      transport = null
    },

    async getUtxosForAddress(address: string): Promise<Utxo[]> {
      const scripthash = addressToScripthash(address, opts.network)
      const rows = (await call('blockchain.scripthash.listunspent', [
        scripthash,
      ])) as ElectrumUnspent[]
      return rows.map(r => ({
        txid: r.tx_hash,
        vout: r.tx_pos,
        value: r.value,
        height: r.height > 0 ? r.height : null,
      }))
    },
  }
}
