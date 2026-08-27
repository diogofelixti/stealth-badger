import type { Network } from './api'

/**
 * O catálogo de fontes, do lado da tela.
 *
 * Espelha `backend/src/chain/presets.ts` de propósito: aqui ele decide **quais
 * campos o formulário mostra**, e lá decide a URL que vai para o banco. A
 * duplicação é pequena e o backend continua sendo quem valida — uma tela que
 * monta URL sozinha seria uma segunda fonte da verdade.
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

export interface PresetDaTela {
  id: PresetId
  /** nome próprio: não se traduz, e é como a pessoa conhece a fonte */
  nome: string
  pede: 'host-porta' | 'url' | 'nada'
  portaPadrao?: Record<Network, number>
  precisaAutenticar?: boolean
  isPublic: boolean
}

const ELECTRUM = { mainnet: 50001, signet: 50001, testnet: 50001 }

export const PRESETS: PresetDaTela[] = [
  {
    id: 'core',
    nome: 'Bitcoin Core (seu nó)',
    pede: 'host-porta',
    portaPadrao: { mainnet: 8332, signet: 38332, testnet: 18332 },
    precisaAutenticar: true,
    isPublic: false,
  },
  { id: 'fulcrum', nome: 'Fulcrum', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'electrs', nome: 'Electrs', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'floresta', nome: 'Floresta', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'mempool', nome: 'mempool.space', pede: 'nada', isPublic: true },
  { id: 'blockstream', nome: 'Blockstream.info', pede: 'nada', isPublic: true },
  { id: 'esplora', nome: 'Esplora próprio', pede: 'url', isPublic: false },
  { id: 'electrum', nome: 'Outro Electrum', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
]

export function presetPor(id: string): PresetDaTela {
  return PRESETS.find(p => p.id === id) ?? PRESETS[0]!
}

/**
 * `localhost` dentro de um container é o próprio container. É a armadilha que
 * custa a primeira tentativa de todo mundo, e por isso o aviso aparece
 * enquanto a pessoa digita, e não depois de salvar.
 */
export function pareceLocalhost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|::1)$/i.test(host.trim())
}
