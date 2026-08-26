import { describe, it, expect } from 'vitest'
import { createElectrumAdapter } from '../src/chain/electrum'

/** Transporte falso: responde por método, sem abrir socket. */
function fakeTransport(handlers: Record<string, (params: unknown[]) => unknown>) {
  return async () => ({
    call: async (method: string, params: unknown[]) => {
      const h = handlers[method]
      if (!h) throw new Error(`método não simulado: ${method}`)
      return h(params)
    },
    close: () => {},
  })
}

const ENDERECO = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'

describe('adapter Electrum', () => {
  it('declara acesso aleatório e suporte a assinatura', () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({}),
    })
    expect(a.capabilities()).toMatchObject({
      randomAccess: true, needsRegistration: false, supportsSubscribe: true,
    })
  })

  it('lê a altura da ponta pela assinatura de cabeçalhos', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.headers.subscribe': () => ({ height: 963938, hex: '00' }),
      }),
    })
    expect(await a.tipHeight()).toBe(963938)
  })

  it('traduz histórico usando o scripthash derivado do endereço', async () => {
    let scripthashRecebido = ''
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.get_history': params => {
          scripthashRecebido = params[0] as string
          return [{ tx_hash: 'aa', height: 100 }, { tx_hash: 'bb', height: 0 }]
        },
        'blockchain.block.header': () => '00'.repeat(80),
      }),
    })

    const hist = await a.getHistoryForAddress!(ENDERECO)
    expect(scripthashRecebido).toHaveLength(64)
    // altura 0 no protocolo Electrum significa mempool
    expect(hist.map(h => h.height)).toEqual([100, null])
  })

  it('traduz UTXOs não gastos', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.listunspent': () => [
          { tx_hash: 'aa', tx_pos: 0, value: 5000, height: 100 },
          { tx_hash: 'bb', tx_pos: 1, value: 1000, height: 0 },
        ],
      }),
    })
    expect(await a.getUtxosForAddress!(ENDERECO)).toEqual([
      { txid: 'aa', vout: 0, value: 5000, height: 100 },
      { txid: 'bb', vout: 1, value: 1000, height: null },
    ])
  })

  it('calcula o hash do bloco a partir do cabeçalho', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({ 'blockchain.block.header': () => '00'.repeat(80) }),
    })
    const hash = await a.blockHashAt(100)
    expect(hash).toHaveLength(64)
  })

  it('marca postura soberana quando aponta para infraestrutura própria', () => {
    const a = createElectrumAdapter({
      host: '127.0.0.1', port: 50001, network: 'signet',
      isPublic: false, connect: fakeTransport({}),
    })
    expect(a.capabilities().isPublic).toBe(false)
    expect(a.capabilities().host).toBe('127.0.0.1:50001')
  })

  it('nomeia o servidor e o método quando a chamada falha', async () => {
    const a = createElectrumAdapter({
      host: 'nó.local', port: 50001, network: 'mainnet',
      connect: fakeTransport({}),
    })
    await expect(a.tipHeight()).rejects.toThrow(/nó\.local:50001.*blockchain\.headers\.subscribe/)
  })

  it('abre uma conexão nova depois de uma falha, em vez de insistir na quebrada', async () => {
    let conexoes = 0
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: async () => {
        conexoes += 1
        const daVez = conexoes
        return {
          call: async () => {
            if (daVez === 1) throw new Error('conexão caiu')
            return { height: 7 }
          },
          close: () => {},
        }
      },
    })

    await expect(a.tipHeight()).rejects.toThrow()
    expect(await a.tipHeight()).toBe(7)
    expect(conexoes).toBe(2)
  })
})

describe('resumo de endereço no Electrum', () => {
  it('devolve o status que o próprio protocolo calcula', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.subscribe': () => 'ff'.repeat(32),
      }),
    })
    const s = await a.getAddressStatus!(ENDERECO)
    expect(s).toEqual({ used: true, status: 'ff'.repeat(32) })
  })

  it('lê status nulo como endereço nunca usado', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({ 'blockchain.scripthash.subscribe': () => null }),
    })
    expect(await a.getAddressStatus!(ENDERECO)).toEqual({ used: false, status: null })
  })

  it('pergunta pelo scripthash, não pelo endereço', async () => {
    let recebido: unknown = null
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.subscribe': params => {
          recebido = params[0]
          return null
        },
      }),
    })
    await a.getAddressStatus!(ENDERECO)
    expect(recebido).not.toBe(ENDERECO)
    expect(recebido).toHaveLength(64)
  })
})
