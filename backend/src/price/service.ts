import type { FonteDePreco } from '../preferences/store'

/**
 * O preço do bitcoin, por fontes públicas que o usuário ligou.
 *
 * Três regras moram aqui, e nenhuma é detalhe:
 *
 * 1. **A requisição sai do servidor, nunca do navegador.** Do navegador, cada
 *    usuário entrega o próprio IP ao serviço de preço; daqui é um IP só, e ele
 *    pode estar atrás de Tor.
 * 2. **A consulta não carrega identificador nenhum**: nem endereço, nem txid,
 *    nem nome de instância. Só o par de moedas — e há teste que confere a URL.
 * 3. **Preço não acende a listra de exposição.** A listra é sobre endereços
 *    vigiados; inflá-la com o que não vaza endereço transformaria o aviso em
 *    ruído, e aviso que vira ruído deixa de ser lido.
 */
interface Fonte {
  url: (moeda: string) => string
  ler: (json: unknown, moeda: string) => number | null
}

const FONTES: Record<FonteDePreco, Fonte> = {
  coingecko: {
    url: m => `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${m.toLowerCase()}`,
    ler: (j, m) =>
      Number((j as { bitcoin?: Record<string, number> }).bitcoin?.[m.toLowerCase()]) || null,
  },
  kraken: {
    url: m => `https://api.kraken.com/0/public/Ticker?pair=XBT${m.toUpperCase()}`,
    ler: j => {
      const resultado = (j as { result?: Record<string, { c?: string[] }> }).result ?? {}
      const par = Object.values(resultado)[0]
      return Number(par?.c?.[0]) || null
    },
  },
  bitstamp: {
    url: m => `https://www.bitstamp.net/api/v2/ticker/btc${m.toLowerCase()}/`,
    ler: j => Number((j as { last?: string }).last) || null,
  },
  coinbase: {
    url: m => `https://api.coinbase.com/v2/prices/BTC-${m.toUpperCase()}/spot`,
    ler: j => Number((j as { data?: { amount?: string } }).data?.amount) || null,
  },
  mempool: {
    url: () => 'https://mempool.space/api/v1/prices',
    ler: (j, m) => Number((j as Record<string, number>)[m.toUpperCase()]) || null,
  },
}

export function urlDaFonte(fonte: FonteDePreco, moeda: string): string {
  return FONTES[fonte].url(moeda)
}

export interface PrecoDeFonte {
  id: FonteDePreco
  price: number | null
  at: string
  error?: string
}

export interface Precos {
  currency: string
  sources: PrecoDeFonte[]
  median: number | null
}

/** Sem cache, cada aba aberta é uma consulta a mais para cada serviço. */
const CACHE_MS = 60_000
const cache = new Map<string, { quando: number; precos: Precos }>()

export function limparCacheDePreco(): void {
  cache.clear()
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[meio]!
    : (ordenados[meio - 1]! + ordenados[meio]!) / 2
}

export async function buscarPrecos(
  fontes: FonteDePreco[],
  moeda: string,
  fetchFn: typeof fetch = fetch,
): Promise<Precos> {
  // Nenhuma fonte ligada é nenhuma requisição: o padrão do produto é não
  // perguntar nada a ninguém.
  if (fontes.length === 0) return { currency: moeda, sources: [], median: null }

  const chave = moeda.toUpperCase() + '|' + [...fontes].sort().join(',')
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.quando < CACHE_MS) return guardado.precos

  const sources = await Promise.all(
    fontes.map(async (id): Promise<PrecoDeFonte> => {
      const at = new Date().toISOString()
      try {
        const res = await fetchFn(FONTES[id].url(moeda))
        if (!res.ok) {
          return { id, price: null, at, error: `HTTP ${res.status}` }
        }
        const preco = FONTES[id].ler(await res.json(), moeda)
        if (preco === null) {
          // Fonte que não cobre a moeda pedida é caso comum, e dizer isso é
          // melhor que devolver zero.
          return { id, price: null, at, error: 'sem preço para ' + moeda.toUpperCase() }
        }
        return { id, price: preco, at }
      } catch (err) {
        return { id, price: null, at, error: (err as Error).message }
      }
    }),
  )

  const precos: Precos = {
    currency: moeda.toUpperCase(),
    sources,
    median: mediana(sources.map(s => s.price).filter((p): p is number => p !== null)),
  }
  cache.set(chave, { quando: Date.now(), precos })
  return precos
}
