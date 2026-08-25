import { describe, expect, it } from 'vitest'
import { deriveAddress, electrumScripthash } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

// A MESMA chave de conta da BIP-84 acima, reserializada com as version bytes
// de vpub. Mesmo material, outra codificação — então os endereços derivados
// dela têm de ter o mesmo witness program dos vetores de mainnet.
const VPUB =
  'vpub5YvMuJNjRSYon44z9QmCfdf8SqJRVNvz6m55Qy5iVjZQxDfUgtiQjnc7CC1fAbED2tAGCZRERUfvtn2DstZGU6HMns6dXXH2wujSc2wfi2x'

describe('parseExtendedKey', () => {
  it('reconhece zpub como p2wpkh de mainnet', () => {
    const p = parseExtendedKey(ZPUB)
    expect(p.scriptType).toBe('p2wpkh')
    expect(p.keyNetwork).toBe('mainnet')
  })

  it('normaliza zpub para a codificação canônica xpub', () => {
    expect(parseExtendedKey(ZPUB).canonicalXpub.startsWith('xpub')).toBe(true)
  })

  it('rejeita entrada que não é chave estendida', () => {
    expect(() => parseExtendedKey('não é uma chave')).toThrow()
  })

  it('rejeita chave privada estendida — o sistema é watch-only', () => {
    const zprv =
      'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE'
    expect(() => parseExtendedKey(zprv)).toThrow(/watch-only|privada/i)
  })
})

describe('deriveAddress', () => {
  it('deriva o primeiro endereço de recebimento da BIP-84', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0)
    expect(a.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
    expect(a.path).toBe('0/0')
  })

  it('deriva o segundo endereço de recebimento', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 1)
    expect(a.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g')
  })

  it('deriva o primeiro endereço de troco', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 1, 0)
    expect(a.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el')
  })

  it('usa o prefixo de testnet em signet', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'signet', 0, 0)
    expect(a.address.startsWith('tb1')).toBe(true)
  })

  // O caso acima parte de uma chave de mainnet, que vira xpub canônico — a
  // codificação que a @scure/bip32 assume por padrão. Uma carteira de signet
  // de verdade guarda tpub canônico, e era esse o caminho que ninguém
  // exercitava: derivar dele lançava `Version mismatch` a cada tick do
  // worker, e a carteira morria em `error` sem nunca sincronizar.
  it('deriva a partir de tpub canônico, que é o que uma carteira de signet guarda', () => {
    const { canonicalXpub } = parseExtendedKey(VPUB)
    expect(canonicalXpub.startsWith('tpub')).toBe(true)

    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'signet', 0, 0)
    expect(a.address.startsWith('tb1')).toBe(true)
    expect(a.path).toBe('0/0')
  })

  it('tpub e xpub da mesma conta derivam o mesmo script', () => {
    const viaTestnet = deriveAddress(
      parseExtendedKey(VPUB).canonicalXpub, 'p2wpkh', 'signet', 0, 0,
    )
    const viaMainnet = deriveAddress(
      parseExtendedKey(ZPUB).canonicalXpub, 'p2wpkh', 'mainnet', 0, 0,
    )
    // version bytes são só serialização: o material da chave é o mesmo, então
    // o scriptPubKey tem de bater byte a byte. Só o HRP do endereço muda.
    expect(viaTestnet.scriptPubKey).toEqual(viaMainnet.scriptPubKey)
    expect(viaMainnet.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
  })

  it('endereços diferentes produzem scripthashes diferentes', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0)
    const b = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 1)
    expect(a.scripthash).not.toBe(b.scripthash)
    expect(a.scripthash).toHaveLength(64)
  })
})

describe('electrumScripthash', () => {
  it('é o sha256 do script, invertido em ordem de bytes', () => {
    const h = electrumScripthash(new Uint8Array(0))
    expect(h).toBe(
      '55b852781b9995a44c939b64e441ae2724b96f99c8f4fb9a141cfc9842c4b0e3',
    )
  })
})
