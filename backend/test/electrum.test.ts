import { describe, it, expect } from 'vitest'
import { causaDaFalha, createElectrumAdapter } from '../src/chain/electrum'

/**
 * Transporte falso: responde por método, sem abrir socket.
 *
 * Responde ao `server.version` por padrão porque qualquer servidor real
 * responde — foi justamente não cobrar o handshake que deixou o adapter passar
 * nos testes e falhar contra um ElectrumX de verdade.
 */
function fakeTransport(handlers: Record<string, (params: unknown[]) => unknown>) {
  return async () => ({
    call: async (method: string, params: unknown[]) => {
      if (method === 'server.version' && !handlers[method]) {
        return ['ElectrumX 1.19.0', '1.4']
      }
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
      connect: fakeTransport({ 'server.version': () => ['ElectrumX', '1.4'] }),
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
          // o handshake é respondido aqui, como faria qualquer servidor
          if (linha.includes('server.version')) {
            const { id } = JSON.parse(linha) as { id: number }
            socket.write(JSON.stringify({ id, result: ['ElectrumX 1.19.0', '1.4'] }) + '\n')
            continue
          }
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

describe('causaDaFalha', () => {
  // Conectar a um host com IPv6 quebrado devolve um AggregateError cuja
  // `message` é string vazia — as causas moram em `errors`. O adapter
  // registrava "falhou em blockchain.headers.subscribe: " e ponto, sem dizer
  // nada. Diagnosticar exigiu abrir um socket à mão.
  it('abre o AggregateError, que vem com mensagem vazia', () => {
    const erro = new AggregateError(
      [
        Object.assign(new Error('connect ETIMEDOUT 2401:2500::1:50001'), { code: 'ETIMEDOUT' }),
        Object.assign(new Error('connect ECONNREFUSED 153.126.143.201:50001'), { code: 'ECONNREFUSED' }),
      ],
      '',
    )
    const texto = causaDaFalha(erro)
    expect(texto).toMatch(/ETIMEDOUT/)
    expect(texto).toMatch(/ECONNREFUSED/)
  })

  it('usa o código quando o erro não traz mensagem alguma', () => {
    const erro = Object.assign(new Error(''), { code: 'ENOTFOUND' })
    expect(causaDaFalha(erro)).toMatch(/ENOTFOUND/)
  })

  it('repassa a mensagem quando ela existe', () => {
    expect(causaDaFalha(new Error('altura fora do alcance'))).toBe('altura fora do alcance')
  })

  it('não devolve string vazia, aconteça o que acontecer', () => {
    expect(causaDaFalha(new AggregateError([], ''))).not.toBe('')
    expect(causaDaFalha(undefined)).not.toBe('')
  })
})

describe('servidor que aceita e não responde', () => {
  // Aconteceu de verdade: um servidor Electrum público parou de responder
  // depois de algumas conexões seguidas, aceitando o socket e ficando calado.
  // Sem limite de tempo, `call` nunca resolve nem rejeita — e o ciclo de
  // sincronização do worker congela para sempre, sem erro, sem log, sem nada
  // na tela. É a pior forma de falhar.
  it('desiste da chamada depois do limite, em vez de esperar para sempre', async () => {
    const { createServer } = await import('node:net')
    const abertos: { destroy: () => void }[] = []
    const mudo = createServer(socket => {
      // aceita a conexão e nunca responde
      abertos.push(socket)
    })
    await new Promise<void>(pronto => mudo.listen(0, '127.0.0.1', pronto))
    const porta = (mudo.address() as { port: number }).port

    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1',
        port: porta,
        network: 'signet',
        timeoutMs: 300,
      })
      const t0 = Date.now()
      await expect(a.tipHeight()).rejects.toThrow(/tempo|timeout/i)
      expect(Date.now() - t0).toBeLessThan(3000)
      a.close!()
    } finally {
      for (const socket of abertos) socket.destroy()
      await new Promise<void>(pronto => mudo.close(() => pronto()))
    }
  })

  it('não deixa a chamada seguinte herdar o silêncio da anterior', async () => {
    const { createServer } = await import('node:net')
    let responder = false
    const servidor = createServer(socket => {
      socket.on('data', chunk => {
        if (!responder) return
        const { id } = JSON.parse(chunk.toString().trim()) as { id: number }
        socket.write(JSON.stringify({ id, result: { height: 5 } }) + '\n')
      })
    })
    await new Promise<void>(pronto => servidor.listen(0, '127.0.0.1', pronto))
    const porta = (servidor.address() as { port: number }).port

    try {
      const a = createElectrumAdapter({
        host: '127.0.0.1',
        port: porta,
        network: 'signet',
        timeoutMs: 300,
      })
      await expect(a.tipHeight()).rejects.toThrow(/tempo|timeout/i)
      responder = true
      expect(await a.tipHeight()).toBe(5)
      a.close!()
    } finally {
      await new Promise<void>(pronto => servidor.close(() => pronto()))
    }
  })
})

describe('handshake do protocolo', () => {
  // O ElectrumX recusa qualquer chamada antes de `server.version`, com
  // "use server.version to identify client". O adapter nunca o enviava, e
  // por isso nunca teria funcionado contra servidor de verdade — o transporte
  // falso dos testes de cima não cobra o handshake, e o defeito só apareceu
  // ao falar com um ElectrumX 1.19 real.
  it('identifica o cliente antes de qualquer outra chamada', async () => {
    const ordem: string[] = []
    const a = createElectrumAdapter({
      host: 'x', port: 1, network: 'mainnet',
      connect: async () => ({
        call: async (method: string) => {
          ordem.push(method)
          if (method === 'server.version') return ['ElectrumX 1.19.0', '1.4']
          return { height: 42 }
        },
        close: () => {},
      }),
    })
    await a.tipHeight()
    expect(ordem[0]).toBe('server.version')
    expect(ordem[1]).toBe('blockchain.headers.subscribe')
  })

  it('diz quem é e que versão de protocolo fala', async () => {
    let params: unknown[] = []
    const a = createElectrumAdapter({
      host: 'x', port: 1, network: 'mainnet',
      connect: async () => ({
        call: async (method: string, p: unknown[]) => {
          if (method === 'server.version') params = p
          return method === 'server.version' ? ['ElectrumX', '1.4'] : { height: 1 }
        },
        close: () => {},
      }),
    })
    await a.tipHeight()
    expect(String(params[0])).toMatch(/stealth.badger/i)
    expect(params[1]).toBe('1.4')
  })

  // Um handshake por conexão, e não por chamada: repeti-lo a cada consulta
  // dobraria o tráfego com o servidor para não dizer nada de novo.
  it('não repete o handshake a cada chamada', async () => {
    let versoes = 0
    const a = createElectrumAdapter({
      host: 'x', port: 1, network: 'mainnet',
      connect: async () => ({
        call: async (method: string) => {
          if (method === 'server.version') versoes += 1
          return method === 'server.version' ? ['ElectrumX', '1.4'] : { height: 1 }
        },
        close: () => {},
      }),
    })
    await a.tipHeight()
    await a.tipHeight()
    await a.tipHeight()
    expect(versoes).toBe(1)
  })

  // Conexão nova é servidor que não sabe quem somos: o handshake tem de
  // acontecer de novo, senão a reconexão volta a esbarrar na recusa.
  it('refaz o handshake quando a conexão é reaberta', async () => {
    let versoes = 0
    let conexoes = 0
    const a = createElectrumAdapter({
      host: 'x', port: 1, network: 'mainnet',
      connect: async () => {
        conexoes += 1
        const daVez = conexoes
        return {
          call: async (method: string) => {
            if (method === 'server.version') {
              versoes += 1
              return ['ElectrumX', '1.4']
            }
            if (daVez === 1) throw new Error('conexão caiu')
            return { height: 9 }
          },
          close: () => {},
        }
      },
    })
    await expect(a.tipHeight()).rejects.toThrow()
    expect(await a.tipHeight()).toBe(9)
    expect(versoes).toBe(2)
  })
})
