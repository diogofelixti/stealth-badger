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
