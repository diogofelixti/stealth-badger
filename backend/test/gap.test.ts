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

function adapterComStatus(status: Record<string, string>): ChainAdapter {
  let historicoPedido = 0
  const a: ChainAdapter & { historicoPedido: () => number } = {
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
    getHistoryForAddress: async () => {
      historicoPedido += 1
      return []
    },
    getAddressStatus: async (addr: string) => ({
      used: status[addr] !== undefined,
      status: status[addr] ?? '0:0:0:0:0:0',
    }),
    historicoPedido: () => historicoPedido,
  }
  return a
}

describe('scanGap incremental', () => {
  async function canonical(): Promise<string> {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    return parseExtendedKey(ZPUB).canonicalXpub
  }

  it('prefere o resumo barato ao histórico completo quando o backend oferece', async () => {
    const adapter = adapterComStatus({}) as ChainAdapter & { historicoPedido: () => number }
    await scanGap({ ...base, canonicalXpub: await canonical(), gapLimit: 3, adapter })
    expect(adapter.historicoPedido()).toBe(0)
  })

  it('marca como inalterado o endereço cujo status repete o já conhecido', async () => {
    const canonicalXpub = await canonical()
    const { deriveAddress } = await import('../src/wallet/derive')
    const zero = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

    const found = await scanGap({
      ...base,
      canonicalXpub,
      gapLimit: 3,
      adapter: adapterComStatus({ [zero]: '1:1:0:0:0:0' }),
      knownStatus: new Map([[0, '1:1:0:0:0:0']]),
    })
    expect(found.find(a => a.index === 0)!.unchanged).toBe(true)
  })

  it('marca como alterado o endereço cujo status divergiu do conhecido', async () => {
    const canonicalXpub = await canonical()
    const { deriveAddress } = await import('../src/wallet/derive')
    const zero = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

    const found = await scanGap({
      ...base,
      canonicalXpub,
      gapLimit: 3,
      adapter: adapterComStatus({ [zero]: '2:2:1:0:0:0' }),
      knownStatus: new Map([[0, '1:1:0:0:0:0']]),
    })
    expect(found.find(a => a.index === 0)!.unchanged).toBe(false)
  })

  it('nunca dá por inalterado um endereço que ainda não conhecia', async () => {
    const found = await scanGap({
      ...base,
      canonicalXpub: await canonical(),
      gapLimit: 3,
      adapter: adapterComStatus({}),
    })
    expect(found.every(a => !a.unchanged)).toBe(true)
  })

  it('não dá por inalterado o endereço quando o backend não sabe informar status', async () => {
    const found = await scanGap({
      ...base,
      canonicalXpub: await canonical(),
      gapLimit: 3,
      adapter: adapterWithUsed(new Set()),
      knownStatus: new Map([[0, null]]),
    })
    expect(found.every(a => !a.unchanged)).toBe(true)
  })
})

describe('scanGap em paralelo', () => {
  function adapterQueMede(usados: Set<string>) {
    let correndo = 0
    let pico = 0
    const consultados: string[] = []
    const a: ChainAdapter & { pico: () => number; consultados: () => string[] } = {
      capabilities: () => ({
        randomAccess: true, needsRegistration: false, supportsSubscribe: false,
        hasTxIndex: true, isPublic: false, host: 'falso',
      }),
      tipHeight: async () => 100,
      blockHashAt: async () => 'hash',
      getHistoryForAddress: async (addr: string) => {
        correndo += 1
        pico = Math.max(pico, correndo)
        consultados.push(addr)
        await new Promise(pronto => setTimeout(pronto, 5))
        correndo -= 1
        return usados.has(addr) ? [{ txid: 'aa', height: 10, blockHash: 'bb' }] : []
      },
      pico: () => pico,
      consultados: () => consultados,
    }
    return a
  }

  async function canonical(): Promise<string> {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    return parseExtendedKey(ZPUB).canonicalXpub
  }

  // A varredura consultava um endereço de cada vez. Com 77 endereços e uns
  // 230 ms de latência, são 18 segundos parados esperando resposta.
  it('consulta vários endereços ao mesmo tempo', async () => {
    const adapter = adapterQueMede(new Set()) as ReturnType<typeof adapterQueMede>
    await scanGap({ ...base, canonicalXpub: await canonical(), gapLimit: 20, adapter })
    expect(adapter.pico()).toBeGreaterThan(1)
  })

  // Paralelismo sem teto é a rajada que faz o explorador responder 429: o
  // watchtower não pode resolver a própria lentidão criando o problema
  // seguinte.
  it('mantém um teto de consultas simultâneas', async () => {
    const adapter = adapterQueMede(new Set()) as ReturnType<typeof adapterQueMede>
    await scanGap({ ...base, canonicalXpub: await canonical(), gapLimit: 20, adapter })
    expect(adapter.pico()).toBeLessThanOrEqual(5)
  })

  // O gap limit continua sendo o que decide onde parar: sondar em bloco não
  // pode fazer a varredura ir muito além do que iria uma a uma.
  it('não sonda muito além do que o gap limit mandaria', async () => {
    const adapter = adapterQueMede(new Set()) as ReturnType<typeof adapterQueMede>
    const found = await scanGap({
      ...base, canonicalXpub: await canonical(), gapLimit: 5, adapter,
    })
    expect(found).toHaveLength(5)
    // no máximo um bloco de folga além dos cinco que o gap limit exige
    expect(adapter.consultados().length).toBeLessThanOrEqual(9)
  })

  it('continua estendendo a varredura quando encontra endereço usado', async () => {
    const canonicalXpub = await canonical()
    const { deriveAddress } = await import('../src/wallet/derive')
    const terceiro = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 3).address
    const found = await scanGap({
      ...base, canonicalXpub, gapLimit: 5, adapter: adapterQueMede(new Set([terceiro])),
    })
    expect(found.filter(a => a.used).map(a => a.index)).toEqual([3])
    expect(found.length).toBeGreaterThanOrEqual(9)
  })
})
