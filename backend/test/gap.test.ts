import { describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { scanGap } from '../src/sync/gap'

function adapterWithUsed(used: Set<string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => 100,
    blockHashAt: async () => 'hash',
    getHistoryForAddress: async (addr: string) =>
      used.has(addr) ? [{ txid: 'aa', height: 10, blockHash: 'bb' }] : [],
  }
}

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const base = {
  canonicalXpub: '',
  scriptType: 'p2wpkh' as const,
  network: 'mainnet' as const,
  chain: 0 as const,
}

describe('scanGap', () => {
  it('para após gapLimit endereços consecutivos sem uso', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const found = await scanGap({
      ...base,
      canonicalXpub,
      gapLimit: 5,
      adapter: adapterWithUsed(new Set()),
    })
    expect(found).toHaveLength(5)
    expect(found.every(a => !a.used)).toBe(true)
  })

  it('estende a varredura quando encontra endereço usado', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const { deriveAddress } = await import('../src/wallet/derive')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const third = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 3).address

    const found = await scanGap({
      ...base,
      canonicalXpub,
      gapLimit: 5,
      adapter: adapterWithUsed(new Set([third])),
    })

    expect(found).toHaveLength(9)
    expect(found.filter(a => a.used).map(a => a.index)).toEqual([3])
  })

  it('marca corretamente qual endereço foi usado', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const { deriveAddress } = await import('../src/wallet/derive')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const first = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

    const found = await scanGap({
      ...base,
      canonicalXpub,
      gapLimit: 3,
      adapter: adapterWithUsed(new Set([first])),
    })
    expect(found[0]!.used).toBe(true)
    expect(found[0]!.address).toBe(first)
  })
})
