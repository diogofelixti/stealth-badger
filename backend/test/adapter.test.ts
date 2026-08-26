import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/chain/adapter'

const base = { isPublic: false, network: 'signet' as const }

describe('createAdapter', () => {
  it('monta o adapter Esplora para um backend esplora', () => {
    const a = createAdapter({ ...base, kind: 'esplora', url: 'https://exemplo/api' })
    expect(a.capabilities()).toMatchObject({ supportsSubscribe: false, host: 'exemplo' })
  })

  it('monta o adapter Electrum a partir de electrum://host:porta', () => {
    const a = createAdapter({ ...base, kind: 'electrum', url: 'electrum://no.local:50002' })
    expect(a.capabilities()).toMatchObject({
      supportsSubscribe: true,
      host: 'no.local:50002',
    })
  })

  it('assume a porta padrão do Electrum quando a URL não a traz', () => {
    const a = createAdapter({ ...base, kind: 'electrum', url: 'electrum://no.local' })
    expect(a.capabilities().host).toBe('no.local:50001')
  })

  it('preserva a postura declarada pelo backend', () => {
    const a = createAdapter({
      kind: 'esplora',
      url: 'https://mempool.space/signet/api',
      isPublic: true,
      network: 'signet',
    })
    expect(a.capabilities().isPublic).toBe(true)
  })

  it('recusa um tipo de backend que não sabe montar, nomeando-o', () => {
    expect(() => createAdapter({ ...base, kind: 'core', url: 'http://x' })).toThrow(
      /core/,
    )
  })
})
