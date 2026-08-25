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
}

export interface GapScanOptions {
  adapter: ChainAdapter
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  chain: 0 | 1
  gapLimit: number
  maxIndex?: number
}

export async function scanGap(opts: GapScanOptions): Promise<ScannedAddress[]> {
  const { adapter, canonicalXpub, scriptType, network, chain, gapLimit } = opts
  const maxIndex = opts.maxIndex ?? 1000

  if (!adapter.getHistoryForAddress) {
    throw new Error(
      'este adapter não oferece acesso aleatório; use o caminho de registro e rescan',
    )
  }
  if (!Number.isInteger(gapLimit) || gapLimit < 1) {
    throw new Error('gap limit inválido')
  }

  const found: ScannedAddress[] = []
  let consecutiveUnused = 0

  for (let index = 0; index < maxIndex; index += 1) {
    const d = deriveAddress(canonicalXpub, scriptType, network, chain, index)
    const history = await adapter.getHistoryForAddress(d.address)
    const used = history.length > 0

    found.push({
      chain,
      index,
      address: d.address,
      scripthash: d.scripthash,
      path: d.path,
      used,
    })

    consecutiveUnused = used ? 0 : consecutiveUnused + 1
    if (consecutiveUnused >= gapLimit) break
  }

  return found
}
