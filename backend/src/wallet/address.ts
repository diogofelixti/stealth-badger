import * as btc from '@scure/btc-signer'
import { electrumScripthash } from './derive'
import type { Network, ScriptType } from './descriptor'

export interface WatchAddress {
  address: string
  scriptType: ScriptType
  scripthash: string
}

/** Prefixos de chave estendida, para reconhecer o engano mais provável. */
const CHAVE_ESTENDIDA = /^(x|y|z|t|u|v)pub[a-km-zA-HJ-NP-Z1-9]{50,}$/

function netFor(network: Network) {
  return network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
}

/**
 * O tipo de script sai do formato decodificado, e não de heurística sobre o
 * texto: `bc1q` de 42 caracteres e `bc1q` de 62 são coisas diferentes, e
 * adivinhar pelo prefixo erraria no segundo.
 */
function tipoDe(decodificado: { type: string }): ScriptType {
  switch (decodificado.type) {
    case 'pkh':
      return 'p2pkh'
    case 'sh':
      return 'p2sh-p2wpkh'
    case 'wpkh':
    case 'wsh':
      return 'p2wpkh'
    case 'tr':
      return 'p2tr'
    default:
      throw new Error(`tipo de endereço não suportado: ${decodificado.type}`)
  }
}

/**
 * Valida um endereço avulso para vigilância.
 *
 * Recusa endereço de outra rede pela mesma razão que o cadastro de carteira
 * recusa chave de outra rede: aceitar produz algo que sincroniza, não encontra
 * nada e mostra saldo zero para sempre, sem erro em lugar nenhum.
 */
export function parseWatchAddress(entrada: string, network: Network): WatchAddress {
  const address = (entrada ?? '').trim()
  if (!address) throw new Error('endereço obrigatório')

  if (CHAVE_ESTENDIDA.test(address)) {
    throw new Error(
      'isto é uma chave estendida, não um endereço. Cadastre como carteira para ' +
        'vigiar todos os endereços derivados dela.',
    )
  }

  let decodificado: { type: string }
  try {
    decodificado = btc.Address(netFor(network)).decode(address) as { type: string }
  } catch {
    // Antes de dizer "inválido", conferir se ele é válido na outra rede: o
    // engano de colar endereço de testnet num watchtower de mainnet é comum, e
    // "endereço inválido" mandaria procurar defeito onde não há.
    const outra: Network = network === 'mainnet' ? 'testnet' : 'mainnet'
    let daOutra = false
    try {
      btc.Address(netFor(outra)).decode(address)
      daOutra = true
    } catch {
      daOutra = false
    }
    if (daOutra) {
      throw new Error(
        `este endereço é de ${outra === 'mainnet' ? 'mainnet' : 'testnet ou signet'}, ` +
          `mas este watchtower vigia ${network}. Use um endereço de ${network}.`,
      )
    }
    throw new Error(`endereço inválido: ${address.slice(0, 24)}`)
  }

  const scriptType = tipoDe(decodificado)
  return {
    address,
    scriptType,
    scripthash: electrumScripthash(
      btc.OutScript.encode(decodificado as Parameters<typeof btc.OutScript.encode>[0]),
    ),
  }
}
