import { HDKey } from '@scure/bip32'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import * as btc from '@scure/btc-signer'
import type { Network, ScriptType } from './descriptor'

export interface DerivedAddress {
  address: string
  scriptPubKey: Uint8Array
  scripthash: string
  path: string
}

export function electrumScripthash(script: Uint8Array): string {
  return bytesToHex(Uint8Array.from(sha256(script)).reverse())
}

function netFor(network: Network) {
  return network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
}

export function deriveAddress(
  canonicalXpub: string,
  scriptType: ScriptType,
  network: Network,
  chain: 0 | 1,
  index: number,
): DerivedAddress {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('índice de derivação inválido: ' + index)
  }

  const node = HDKey.fromExtendedKey(canonicalXpub)
    .deriveChild(chain)
    .deriveChild(index)
  if (!node.publicKey) throw new Error('nó derivado sem chave pública')

  const net = netFor(network)
  const pub = node.publicKey
  const payment =
    scriptType === 'p2wpkh'
      ? btc.p2wpkh(pub, net)
      : scriptType === 'p2pkh'
        ? btc.p2pkh(pub, net)
        : scriptType === 'p2sh-p2wpkh'
          ? btc.p2sh(btc.p2wpkh(pub, net), net)
          : btc.p2tr(pub.slice(1), undefined, net)

  if (!payment.address || !payment.script) {
    throw new Error('não foi possível codificar endereço ' + scriptType)
  }

  return {
    address: payment.address,
    scriptPubKey: payment.script,
    scripthash: electrumScripthash(payment.script),
    path: chain + '/' + index,
  }
}
