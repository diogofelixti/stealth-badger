import { describe, expect, it } from 'vitest'
import { parseWatchAddress } from '../src/wallet/address'

// endereços dos vetores públicos da BIP-84 e da BIP-173
const MAINNET_P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const TESTNET_P2WPKH = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
const MAINNET_P2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
const MAINNET_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'

describe('parseWatchAddress', () => {
  it('aceita endereço native segwit e calcula o scripthash do Electrum', () => {
    const a = parseWatchAddress(MAINNET_P2WPKH, 'mainnet')
    expect(a.address).toBe(MAINNET_P2WPKH)
    expect(a.scriptType).toBe('p2wpkh')
    expect(a.scripthash).toHaveLength(64)
  })

  it('reconhece o tipo de script pelo formato do endereço', () => {
    expect(parseWatchAddress(MAINNET_P2PKH, 'mainnet').scriptType).toBe('p2pkh')
    expect(parseWatchAddress(MAINNET_P2SH, 'mainnet').scriptType).toBe('p2sh-p2wpkh')
  })

  // A carteira já recusa chave de outra rede; endereço precisa da mesma
  // barreira, e pela mesma razão: aceitar produz uma carteira que sincroniza,
  // não encontra nada e mostra saldo zero para sempre.
  it('recusa endereço de outra rede, dizendo qual é qual', () => {
    expect(() => parseWatchAddress(TESTNET_P2WPKH, 'mainnet')).toThrow(/mainnet/)
    expect(() => parseWatchAddress(MAINNET_P2WPKH, 'signet')).toThrow(/signet/)
  })

  it('aceita endereço de signet, que compartilha o formato da testnet', () => {
    expect(parseWatchAddress(TESTNET_P2WPKH, 'signet').scriptType).toBe('p2wpkh')
    expect(parseWatchAddress(TESTNET_P2WPKH, 'testnet').scriptType).toBe('p2wpkh')
  })

  it('recusa texto que não é endereço, com mensagem acionável', () => {
    expect(() => parseWatchAddress('não sou um endereço', 'mainnet')).toThrow(/endereço/i)
    expect(() => parseWatchAddress('', 'mainnet')).toThrow(/endereço/i)
  })

  // Colar uma chave estendida no campo de endereço é o erro mais provável do
  // usuário. Dizer "endereço inválido" mandaria procurar no lugar errado.
  it('reconhece quando colaram uma chave estendida no lugar do endereço', () => {
    const zpub =
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
    expect(() => parseWatchAddress(zpub, 'mainnet')).toThrow(/chave estendida|carteira/i)
  })

  it('ignora espaço em volta, que colar de outro aplicativo costuma trazer', () => {
    expect(parseWatchAddress('  ' + MAINNET_P2WPKH + '\n', 'mainnet').address).toBe(
      MAINNET_P2WPKH,
    )
  })
})
