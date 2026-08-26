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

describe('transporte TCP do Electrum', () => {
  /**
   * Sobe um servidor que fala o protocolo de verdade — JSON-RPC delimitado por
   * quebra de linha. O transporte real nunca é exercido pelos testes de cima,
   * e é nele que estão as partes que quebram calado: juntar pedaços de um
   * chunk, separar linhas e casar resposta com pedido pelo id.
   */
  async function servidorFalso(
    responder: (linha: string, escrever: (texto: string) => void) => void,
    espia: { aoAbrir?: () => void; aoFechar?: () => void } = {},
  ): Promise<{ porta: number; fechar: () => Promise<void> }> {
    const { createServer } = await import('node:net')
    const server = createServer(socket => {
      espia.aoAbrir?.()
      socket.on('close', () => espia.aoFechar?.())
      let buffer = ''
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8')
        let quebra: number
        while ((quebra = buffer.indexOf('\n')) !== -1) {
          const linha = buffer.slice(0, quebra)
          buffer = buffer.slice(quebra + 1)
          responder(linha, texto => socket.write(texto))
        }
      })
    })
    await new Promise<void>(pronto => server.listen(0, '127.0.0.1', pronto))
    const porta = (server.address() as { port: number }).port
    return {
      porta,
      fechar: () => new Promise<void>(pronto => server.close(() => pronto())),
    }
  }

  it('remonta a resposta partida em vários pedaços', async () => {
    const s = await servidorFalso((linha, escrever) => {
      const { id } = JSON.parse(linha) as { id: number }
      const resposta = JSON.stringify({ id, result: { height: 319333, hex: '00' } })
      // o TCP não preserva fronteira de mensagem: um JSON pode chegar em dois
      // pedaços, e o transporte tem de esperar a quebra de linha
      escrever(resposta.slice(0, 10))
      setTimeout(() => escrever(resposta.slice(10) + '\n'), 10)
    })
    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1', port: s.porta, network: 'signet',
      })
      expect(await a.tipHeight()).toBe(319333)
      a.close!()
    } finally {
      await s.fechar()
    }
  })

  it('ignora notificação de assinatura sem confundi-la com resposta', async () => {
    const s = await servidorFalso((linha, escrever) => {
      const { id } = JSON.parse(linha) as { id: number }
      // notificação chega sem id e não responde a pedido nenhum
      escrever(JSON.stringify({ method: 'blockchain.headers.subscribe', params: [{}] }) + '\n')
      escrever(JSON.stringify({ id, result: { height: 42 } }) + '\n')
    })
    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1', port: s.porta, network: 'signet',
      })
      expect(await a.tipHeight()).toBe(42)
      a.close!()
    } finally {
      await s.fechar()
    }
  })

  it('propaga o erro que o servidor devolve, nomeando o servidor', async () => {
    const s = await servidorFalso((linha, escrever) => {
      const { id, method } = JSON.parse(linha) as { id: number; method: string }
      if (method === 'blockchain.headers.subscribe') {
        escrever(JSON.stringify({ id, result: { height: 7 } }) + '\n')
        return
      }
      escrever(JSON.stringify({ id, error: { message: 'altura fora do alcance' } }) + '\n')
    })
    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1', port: s.porta, network: 'signet',
      })
      await expect(a.blockHashAt(999999999)).rejects.toThrow(/altura fora do alcance/)
      // erro de protocolo é resposta, não queda: a conexão continua servindo
      expect(await a.tipHeight()).toBe(7)
      a.close!()
    } finally {
      await s.fechar()
    }
  })

  it('falha com mensagem acionável quando não há servidor na porta', async () => {
    const a = createElectrumAdapter({
      host: '127.0.0.1', port: 1, network: 'signet',
    })
    await expect(a.tipHeight()).rejects.toThrow()
  })

  it('fecha a conexão quando é dispensado', async () => {
    // Sem isto o worker vaza um socket por carteira a cada ciclo: `tick` monta
    // um adapter novo toda volta, e um servidor Electrum acumularia as
    // conexões até esgotar os descritores.
    let abertas = 0
    let encerradas = 0
    const s = await servidorFalso(
      (linha, escrever) => {
        const { id } = JSON.parse(linha) as { id: number }
        escrever(JSON.stringify({ id, result: { height: 1 } }) + '\n')
      },
      {
        aoAbrir: () => { abertas += 1 },
        aoFechar: () => { encerradas += 1 },
      },
    )
    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1', port: s.porta, network: 'signet',
      })
      await a.tipHeight()
      expect(abertas).toBe(1)

      a.close!()
      await new Promise(pronto => setTimeout(pronto, 50))
      expect(encerradas).toBe(1)
    } finally {
      await s.fechar()
    }
  })
})
