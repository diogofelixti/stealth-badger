import type { Rpc } from '../chain/core-rpc'

/** Os três alvos: próximo bloco, meia hora, uma hora. */
export const ALVOS = [1, 3, 6] as const

export type Taxas = Record<number, number | null>

/**
 * BTC/kvB → sat/vB, pelos dígitos do texto.
 *
 * `0.00002812 * 1e8 / 1000` passa por ponto flutuante e devolve 2.8119999…;
 * é o mesmo defeito da 21ª rodada, no mesmo formato. Contar dígitos é exato.
 */
export function satsPorVbyte(btcPorKvb: number | undefined | null): number | null {
  if (btcPorKvb === undefined || btcPorKvb === null || !Number.isFinite(btcPorKvb)) {
    return null
  }
  const [inteiro, decimal = ''] = btcPorKvb.toFixed(8).split('.')
  const sats = BigInt(inteiro!) * 100_000_000n + BigInt(decimal.padEnd(8, '0'))
  // sats por kvB → sat/vB é dividir por mil, e o resto vira casa decimal
  return Number(sats) / 1000
}

/** `estimatesmartfee` para os três alvos, no nó do próprio usuário. */
export async function taxasDoNo(rpc: Rpc): Promise<Taxas> {
  const taxas: Taxas = {}
  for (const alvo of ALVOS) {
    try {
      const r = (await rpc('estimatesmartfee', [alvo])) as { feerate?: number }
      taxas[alvo] = satsPorVbyte(r?.feerate)
    } catch {
      // Bloco sem estimativa vem nulo: inventar um número aqui seria pior que
      // não mostrar nada.
      taxas[alvo] = null
    }
  }
  return taxas
}

/** A estimativa pública, para quem não tem nó — e sabe que está consultando. */
export async function taxasDoMempool(fetchFn: typeof fetch = fetch): Promise<Taxas | null> {
  try {
    const res = await fetchFn('https://mempool.space/api/v1/fees/recommended')
    if (!res.ok) return null
    const r = (await res.json()) as {
      fastestFee?: number
      halfHourFee?: number
      hourFee?: number
    }
    return {
      1: r.fastestFee ?? null,
      3: r.halfHourFee ?? null,
      6: r.hourFee ?? null,
    }
  } catch {
    return null
  }
}
