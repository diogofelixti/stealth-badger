import { base58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const b58 = base58check(sha256)

export type ScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr'
export type Network = 'mainnet' | 'signet' | 'testnet'
export type KeyNetwork = 'mainnet' | 'testnet'

export interface ParsedKey {
  canonicalXpub: string
  scriptType: ScriptType
  keyNetwork: KeyNetwork
  fingerprint: string
}

const PUBLIC_VERSIONS: Record<
  string,
  { scriptType: ScriptType; keyNetwork: KeyNetwork }
> = {
  '0488b21e': { scriptType: 'p2pkh', keyNetwork: 'mainnet' },
  '049d7cb2': { scriptType: 'p2sh-p2wpkh', keyNetwork: 'mainnet' },
  '04b24746': { scriptType: 'p2wpkh', keyNetwork: 'mainnet' },
  '043587cf': { scriptType: 'p2pkh', keyNetwork: 'testnet' },
  '044a5262': { scriptType: 'p2sh-p2wpkh', keyNetwork: 'testnet' },
  '045f1cf6': { scriptType: 'p2wpkh', keyNetwork: 'testnet' },
}

const PRIVATE_VERSIONS = new Set([
  '0488ade4',
  '049d7878',
  '04b2430c',
  '04358394',
  '044a4e28',
  '045f18bc',
])

const CANONICAL: Record<KeyNetwork, string> = {
  mainnet: '0488b21e',
  testnet: '043587cf',
}

export function parseExtendedKey(key: string): ParsedKey {
  let raw: Uint8Array
  try {
    raw = b58.decode(key.trim())
  } catch {
    throw new Error('chave estendida inválida: não é base58check válido')
  }

  if (raw.length !== 78) {
    throw new Error('chave estendida inválida: ' + raw.length + ' bytes, esperado 78')
  }

  const version = bytesToHex(raw.slice(0, 4))

  if (PRIVATE_VERSIONS.has(version)) {
    throw new Error(
      'isto é uma chave privada estendida. O Stealth Badger é watch-only e nunca ' +
        'aceita material que permita gastar. Use a chave pública correspondente.',
    )
  }

  const info = PUBLIC_VERSIONS[version]
  if (!info) throw new Error('bytes de versão desconhecidos: ' + version)

  const canonical = new Uint8Array(raw)
  const target = CANONICAL[info.keyNetwork]
  for (let i = 0; i < 4; i += 1) {
    canonical[i] = parseInt(target.slice(i * 2, i * 2 + 2), 16)
  }

  return {
    canonicalXpub: b58.encode(canonical),
    scriptType: info.scriptType,
    keyNetwork: info.keyNetwork,
    fingerprint: bytesToHex(raw.slice(5, 9)),
  }
}
