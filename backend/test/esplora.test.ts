import { describe, expect, it } from 'vitest'
import { createEsploraAdapter } from '../src/chain/esplora'

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(routes).find(k => url.endsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    const body = routes[key]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
    })
  }) as typeof fetch
}

describe('adapter Esplora', () => {
  it('declara acesso aleatório e nega registro e assinatura', () => {
    const a = createEsploraAdapter('https://exemplo/api', { fetchFn: fakeFetch({}) })
    expect(a.capabilities()).toMatchObject({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
    })
  })

  it('marca a postura pública, que alimenta o aviso na interface', () => {
    const pub = createEsploraAdapter('https://mempool.space/signet/api', {
      isPublic: true,
      fetchFn: fakeFetch({}),
    })
    const own = createEsploraAdapter('http://127.0.0.1:3002', {
      isPublic: false,
      fetchFn: fakeFetch({}),
    })
    expect(pub.capabilities().isPublic).toBe(true)
    expect(own.capabilities().isPublic).toBe(false)
  })

  it('lê a altura da ponta da cadeia', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({ '/blocks/tip/height': '319233' }),
    })
    expect(await a.tipHeight()).toBe(319233)
  })

  it('lê o hash de um bloco por altura', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({ '/block-height/319233': '0000abc' }),
    })
    expect(await a.blockHashAt(319233)).toBe('0000abc')
  })

  it('traduz o histórico de um endereço, separando confirmado de mempool', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({
        '/address/tb1qexemplo/txs': [
          { txid: 'aa', status: { confirmed: true, block_height: 100, block_hash: 'bb' } },
          { txid: 'cc', status: { confirmed: false } },
        ],
      }),
    })
    const hist = await a.getHistoryForAddress!('tb1qexemplo')
    expect(hist).toEqual([
      { txid: 'aa', height: 100, blockHash: 'bb' },
      { txid: 'cc', height: null, blockHash: null },
    ])
  })

  it('lista os UTXOs de um endereço', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({
        '/address/tb1qexemplo/utxo': [
          { txid: 'aa', vout: 0, value: 5000, status: { confirmed: true, block_height: 100 } },
        ],
      }),
    })
    expect(await a.getUtxosForAddress!('tb1qexemplo')).toEqual([
      { txid: 'aa', vout: 0, value: 5000, height: 100 },
    ])
  })

  it('erra com mensagem legível quando o explorador responde erro', async () => {
    const a = createEsploraAdapter('https://exemplo/api', { fetchFn: fakeFetch({}) })
    await expect(a.tipHeight()).rejects.toThrow(/Esplora/)
  })
})

describe('resumo de endereço', () => {
  const virgem = {
    chain_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
    mempool_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
  }

  function comContadores(stats: unknown) {
    return createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({ '/address/bc1qx': stats }),
    })
  }

  it('não marca como usado o endereço sem nenhuma transação', async () => {
    const s = await comContadores(virgem).getAddressStatus!('bc1qx')
    expect(s.used).toBe(false)
  })

  it('marca como usado o endereço que só aparece no mempool', async () => {
    const s = await comContadores({
      ...virgem,
      mempool_stats: { funded_txo_count: 1, spent_txo_count: 0, tx_count: 1 },
    }).getAddressStatus!('bc1qx')
    expect(s.used).toBe(true)
  })

  it('muda o status quando a transação sai do mempool e confirma', async () => {
    const noMempool = await comContadores({
      chain_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
      mempool_stats: { funded_txo_count: 1, spent_txo_count: 0, tx_count: 1 },
    }).getAddressStatus!('bc1qx')

    const confirmada = await comContadores({
      chain_stats: { funded_txo_count: 1, spent_txo_count: 0, tx_count: 1 },
      mempool_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
    }).getAddressStatus!('bc1qx')

    expect(confirmada.status).not.toBe(noMempool.status)
  })

  it('repete o mesmo status enquanto nada muda no endereço', async () => {
    const stats = {
      chain_stats: { funded_txo_count: 3, spent_txo_count: 2, tx_count: 4 },
      mempool_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
    }
    const primeira = await comContadores(stats).getAddressStatus!('bc1qx')
    const segunda = await comContadores(stats).getAddressStatus!('bc1qx')
    expect(segunda.status).toBe(primeira.status)
  })

  it('muda o status quando um UTXO do endereço é gasto', async () => {
    const antes = await comContadores({
      chain_stats: { funded_txo_count: 1, spent_txo_count: 0, tx_count: 1 },
      mempool_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
    }).getAddressStatus!('bc1qx')

    const depois = await comContadores({
      chain_stats: { funded_txo_count: 1, spent_txo_count: 1, tx_count: 2 },
      mempool_stats: { funded_txo_count: 0, spent_txo_count: 0, tx_count: 0 },
    }).getAddressStatus!('bc1qx')

    expect(depois.status).not.toBe(antes.status)
  })
})

describe('limite de taxa do explorador público', () => {
  /** Devolve 429 nas primeiras `vezes` chamadas, depois responde de verdade. */
  function fetchQueLimita(vezes: number, corpo = '319233', retryAfter?: string) {
    let chamadas = 0
    const f = async () => {
      chamadas += 1
      if (chamadas <= vezes) {
        return new Response('rate limited', {
          status: 429,
          headers: retryAfter ? { 'retry-after': retryAfter } : {},
        })
      }
      return new Response(corpo, { status: 200 })
    }
    return f as unknown as typeof fetch
  }

  function esperas() {
    const registradas: number[] = []
    return {
      registradas,
      dormir: async (ms: number) => {
        registradas.push(ms)
      },
    }
  }

  // Um 429 hoje derruba a sincronização inteira e a carteira aparece em
  // `error` na tela. O explorador público limita justamente quando a carteira
  // é grande, que é quando vigiar importa mais.
  it('repete a consulta quando o explorador responde 429', async () => {
    const { dormir } = esperas()
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fetchQueLimita(2),
      sleepFn: dormir,
    })
    expect(await a.tipHeight()).toBe(319233)
  })

  it('espera mais a cada tentativa, em vez de martelar o explorador', async () => {
    const e = esperas()
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fetchQueLimita(3),
      sleepFn: e.dormir,
    })
    await a.tipHeight()
    expect(e.registradas).toHaveLength(3)
    expect(e.registradas[1]).toBeGreaterThan(e.registradas[0]!)
    expect(e.registradas[2]).toBeGreaterThan(e.registradas[1]!)
  })

  // Quando o servidor diz quanto esperar, discutir com ele é o caminho mais
  // curto para ser bloqueado de vez.
  it('obedece o Retry-After que o explorador manda', async () => {
    const e = esperas()
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fetchQueLimita(1, '319233', '7'),
      sleepFn: e.dormir,
    })
    await a.tipHeight()
    expect(e.registradas[0]).toBe(7000)
  })

  it('desiste depois do limite de tentativas, dizendo que foi limite de taxa', async () => {
    const e = esperas()
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fetchQueLimita(99),
      sleepFn: e.dormir,
      maxRetries: 3,
    })
    await expect(a.tipHeight()).rejects.toThrow(/limite de taxa|429/i)
    expect(e.registradas).toHaveLength(3)
  })

  // Endereço inexistente não melhora esperando: repetir só atrasa o erro e
  // gasta a cota que o 429 já está disputando.
  it('não repete erro que não é de limite de taxa', async () => {
    const e = esperas()
    let chamadas = 0
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: (async () => {
        chamadas += 1
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
      sleepFn: e.dormir,
    })
    await expect(a.tipHeight()).rejects.toThrow(/404/)
    expect(chamadas).toBe(1)
    expect(e.registradas).toHaveLength(0)
  })

  // 503 é o explorador dizendo que está sobrecarregado agora. Vale a mesma
  // paciência do 429.
  it('também espera quando o explorador diz que está indisponível', async () => {
    const e = esperas()
    let chamadas = 0
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: (async () => {
        chamadas += 1
        return chamadas === 1
          ? new Response('overloaded', { status: 503 })
          : new Response('319233', { status: 200 })
      }) as typeof fetch,
      sleepFn: e.dormir,
    })
    expect(await a.tipHeight()).toBe(319233)
    expect(e.registradas).toHaveLength(1)
  })
})

describe('recusa explicada pelo explorador', () => {
  // Aconteceu de verdade: `/address/<a>/utxo` devolveu 400 com o corpo
  // "Too many unspent transaction outputs (>500)". A mensagem registrada dizia
  // só "Esplora respondeu 400", e diagnosticar exigiu repetir a chamada com
  // curl. O motivo estava no corpo o tempo todo.
  it('traz a explicação que o explorador escreveu no corpo', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: (async () =>
        new Response('Too many unspent transaction outputs (>500).', {
          status: 400,
        })) as typeof fetch,
    })
    await expect(a.getUtxosForAddress!('bc1qx')).rejects.toThrow(/Too many unspent/)
  })

  it('não deixa a mensagem crescer com uma página de erro inteira', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: (async () =>
        new Response('<html>' + 'x'.repeat(9000) + '</html>', { status: 500 })) as typeof fetch,
      maxRetries: 0,
    })
    await expect(a.tipHeight()).rejects.toThrow(
      /^(?=[\s\S]{0,600}$)[\s\S]*$/,
    )
  })
})
