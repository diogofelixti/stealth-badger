import type { BackendKind } from '../config'
import type { Network } from '../wallet/descriptor'

/**
 * O catálogo de fontes de consulta.
 *
 * É **camada de apresentação sobre três adapters**. Fulcrum, Electrs e
 * Floresta falam o mesmo protocolo e viram `kind: 'electrum'`; mempool.space e
 * Blockstream viram `kind: 'esplora'` e diferem só na URL base.
 *
 * Preset nunca decide comportamento. Um `if (preset === 'fulcrum')` fora da
 * montagem da URL seria um quarto adapter entrando pela porta dos fundos, e a
 * 21ª rodada já mostrou o que custa manter dois modelos honestos.
 */
export type PresetId =
  | 'core'
  | 'fulcrum'
  | 'electrs'
  | 'floresta'
  | 'mempool'
  | 'blockstream'
  | 'esplora'
  | 'electrum'

interface Preset {
  kind: BackendKind
  /** o que o formulário pede */
  pede: 'host-porta' | 'url' | 'nada'
  /** porta sugerida, por rede quando ela muda */
  portaPadrao?: Record<Network, number>
  /** monta a URL a partir do que foi pedido */
  url: (entrada: { host?: string; port?: number; url?: string }, rede: Network) => string
  isPublic: boolean
  /** exige credencial de RPC */
  precisaAutenticar?: boolean
}

/** O caminho da rede no Esplora público. Mainnet não leva nome nenhum. */
function caminhoDaRede(rede: Network): string {
  return rede === 'mainnet' ? '' : '/' + rede
}

const eletrum = (kind: BackendKind = 'electrum'): Preset => ({
  kind,
  pede: 'host-porta',
  portaPadrao: { mainnet: 50001, signet: 50001, testnet: 50001 },
  url: e => `electrum://${e.host}:${e.port}`,
  isPublic: false,
})

export const PRESETS: Record<PresetId, Preset> = {
  core: {
    kind: 'core',
    pede: 'host-porta',
    portaPadrao: { mainnet: 8332, signet: 38332, testnet: 18332 },
    url: e => `http://${e.host}:${e.port}`,
    isPublic: false,
    precisaAutenticar: true,
  },
  fulcrum: eletrum(),
  electrs: eletrum(),
  floresta: eletrum(),
  electrum: eletrum(),
  mempool: {
    kind: 'esplora',
    pede: 'nada',
    url: (_e, rede) => `https://mempool.space${caminhoDaRede(rede)}/api`,
    isPublic: true,
  },
  blockstream: {
    kind: 'esplora',
    pede: 'nada',
    url: (_e, rede) => `https://blockstream.info${caminhoDaRede(rede)}/api`,
    isPublic: true,
  },
  esplora: {
    kind: 'esplora',
    pede: 'url',
    url: e => (e.url ?? '').trim(),
    isPublic: false,
  },
}

export function presetConhecido(id: string): id is PresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, id)
}
