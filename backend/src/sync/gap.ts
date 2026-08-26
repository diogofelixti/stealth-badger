import type { ChainAdapter } from '../chain/types'
import { mapComLimite } from './concorrencia'
import { deriveAddress } from '../wallet/derive'
import type { Network, ScriptType } from '../wallet/descriptor'

export interface ScannedAddress {
  chain: 0 | 1
  index: number
  address: string
  scripthash: string
  path: string
  used: boolean
  /** retrato opaco do endereço nesta volta; `null` se o backend não informa */
  status: string | null
  /** o backend confirmou que nada mudou aqui desde a volta anterior */
  unchanged: boolean
}

export interface GapScanOptions {
  adapter: ChainAdapter
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  chain: 0 | 1
  gapLimit: number
  maxIndex?: number
  /** status guardado da volta anterior, por índice desta cadeia */
  knownStatus?: Map<number, string | null>
}

/**
 * Como perguntar ao backend o que existe num endereço.
 *
 * Extraída porque as duas varreduras precisam dela: a que deriva por gap limit
 * e a que só confere os endereços já registrados.
 */
export function criarSonda(
  adapter: ChainAdapter,
): (address: string) => Promise<{ used: boolean; status: string | null }> {
  if (adapter.getAddressStatus) {
    // O resumo custa uma fração do histórico completo e responde as duas
    // perguntas da varredura: o endereço foi usado, e mudou alguma coisa nele.
    return address => adapter.getAddressStatus!(address)
  }
  if (adapter.getHistoryForAddress) {
    return async address => ({
      used: (await adapter.getHistoryForAddress!(address)).length > 0,
      status: null,
    })
  }
  throw new Error(
    'este adapter não oferece acesso aleatório; use o caminho de registro e rescan',
  )
}

/** `null` de um dos lados é ignorância, não igualdade: sem status não há como
 *  afirmar que nada mudou, e o endereço é reconferido. */
export function inalterado(anterior: string | null | undefined, atual: string | null): boolean {
  return anterior != null && atual !== null && anterior === atual
}

/**
 * Quantas consultas ao mesmo tempo.
 *
 * O suficiente para a espera de rede deixar de dominar o relógio, e pouco o
 * bastante para não virar a rajada que faz o explorador público responder 429.
 */
export const CONSULTAS_SIMULTANEAS = 5

export async function scanGap(opts: GapScanOptions): Promise<ScannedAddress[]> {
  const { adapter, canonicalXpub, scriptType, network, chain, gapLimit } = opts
  const maxIndex = opts.maxIndex ?? 1000
  const knownStatus = opts.knownStatus ?? new Map<number, string | null>()

  const probe = criarSonda(adapter)
  if (!Number.isInteger(gapLimit) || gapLimit < 1) {
    throw new Error('gap limit inválido')
  }

  const found: ScannedAddress[] = []
  let consecutiveUnused = 0
  let proximo = 0

  // Em blocos, e não um por um: a espera de rede é o que domina o relógio, e
  // consultar de cinco em cinco corta a volta sem perder o gap limit de vista.
  // O bloco é pequeno de propósito — a condição de parada é reavaliada ao fim
  // de cada um, então a varredura nunca vai muito além do que iria sozinha.
  while (proximo < maxIndex && consecutiveUnused < gapLimit) {
    const bloco = Array.from(
      { length: Math.min(CONSULTAS_SIMULTANEAS, maxIndex - proximo) },
      (_, i) => proximo + i,
    )

    const sondados = await mapComLimite(bloco, CONSULTAS_SIMULTANEAS, async index => {
      const d = deriveAddress(canonicalXpub, scriptType, network, chain, index)
      const { used, status } = await probe(d.address)
      return { index, d, used, status }
    })

    for (const { index, d, used, status } of sondados) {
      // A parada é avaliada na ordem do índice, e não na de quem respondeu
      // antes: o que veio depois do ponto de parada é descartado, senão o
      // paralelismo mudaria o conjunto de endereços da carteira.
      if (consecutiveUnused >= gapLimit) break

      found.push({
        chain,
        index,
        address: d.address,
        scripthash: d.scripthash,
        path: d.path,
        used,
        status,
        unchanged: inalterado(knownStatus.get(index), status),
      })

      consecutiveUnused = used ? 0 : consecutiveUnused + 1
    }

    proximo += bloco.length
  }

  return found
}
