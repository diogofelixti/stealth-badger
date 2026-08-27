import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarPrecos, limparCacheDePreco, urlDaFonte } from '../src/price/service'
import { FONTES_DE_PRECO } from '../src/preferences/store'

function fetchFalso(
  respostas: Record<string, unknown>,
  registro: string[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    registro.push(url)
    const chave = Object.keys(respostas).find(k => url.includes(k))
    if (!chave) return new Response('fora do ar', { status: 503 })
    return new Response(JSON.stringify(respostas[chave]), { status: 200 })
  }) as typeof fetch
}

beforeEach(() => {
  limparCacheDePreco()
})

describe('a consulta de preço não identifica ninguém', () => {
  // Um watchtower de privacidade não pode entregar endereço, txid ou nome de
  // instância ao perguntar quanto vale um bitcoin. A URL leva o par de moedas,
  // e nada mais.
  it('a URL de cada fonte contém só o par de moedas', () => {
    for (const fonte of FONTES_DE_PRECO) {
      const url = urlDaFonte(fonte, 'USD')
      expect(url).toBeTruthy()
      expect(url).not.toMatch(/tb1|bc1|txid|wallet|user|instance|badger/i)
      expect(url.length).toBeLessThan(200)
    }
  })
})

describe('buscarPrecos', () => {
  it('sem fonte ligada, não faz requisição nenhuma', async () => {
    const chamadas: string[] = []
    const resultado = await buscarPrecos([], 'USD', fetchFalso({}, chamadas))

    expect(resultado.sources).toEqual([])
    expect(resultado.median).toBeNull()
    expect(chamadas).toHaveLength(0)
  })

  it('mostra a mediana quando mais de uma fonte responde', async () => {
    const resultado = await buscarPrecos(
      ['coingecko', 'coinbase'],
      'USD',
      fetchFalso({
        coingecko: { bitcoin: { usd: 100000 } },
        coinbase: { data: { amount: '102000' } },
      }),
    )

    expect(resultado.sources.map(s => s.price)).toEqual([100000, 102000])
    expect(resultado.median).toBe(101000)
  })

  // Duas fontes discordando é informação, não erro; e uma fora do ar não pode
  // derrubar as outras.
  it('uma fonte fora do ar não derruba as demais', async () => {
    const resultado = await buscarPrecos(
      ['coingecko', 'kraken'],
      'USD',
      fetchFalso({ coingecko: { bitcoin: { usd: 100000 } } }),
    )

    const kraken = resultado.sources.find(s => s.id === 'kraken')!
    expect(kraken.error).toBeTruthy()
    expect(kraken.price).toBeNull()
    expect(resultado.median).toBe(100000)
  })

  it('não repete a consulta dentro do tempo de cache', async () => {
    const chamadas: string[] = []
    const fetchFn = fetchFalso({ coingecko: { bitcoin: { usd: 100000 } } }, chamadas)

    await buscarPrecos(['coingecko'], 'USD', fetchFn)
    await buscarPrecos(['coingecko'], 'USD', fetchFn)

    expect(chamadas).toHaveLength(1)
  })

  it('moeda diferente é consulta diferente, e não vem do cache da outra', async () => {
    const chamadas: string[] = []
    const fetchFn = fetchFalso(
      { coingecko: { bitcoin: { usd: 100000, brl: 550000 } } },
      chamadas,
    )

    await buscarPrecos(['coingecko'], 'USD', fetchFn)
    await buscarPrecos(['coingecko'], 'BRL', fetchFn)

    expect(chamadas).toHaveLength(2)
  })
})
