import type { ChainAdapter } from '../chain/types'
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

  for (let index = 0; index < maxIndex; index += 1) {
    const d = deriveAddress(canonicalXpub, scriptType, network, chain, index)
    const { used, status } = await probe(d.address)
    const anterior = knownStatus.get(index)

    found.push({
      chain,
      index,
      address: d.address,
      scripthash: d.scripthash,
      path: d.path,
      used,
      status,
      unchanged: inalterado(anterior, status),
    })

    consecutiveUnused = used ? 0 : consecutiveUnused + 1
    if (consecutiveUnused >= gapLimit) break
  }

  return found
}
