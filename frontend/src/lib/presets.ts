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
  | 'core-datadir'
  | 'core'
  | 'fulcrum'
  | 'electrs'
  | 'floresta'
  | 'mempool'
  | 'blockstream'
  | 'esplora'
  | 'electrum'

/**
 * A pergunta que o formulário faz primeiro: **o que você tem?**
 *
 * Nove presets numa lista plana obrigavam a pessoa a saber que Fulcrum é
 * `electrum` e que mempool.space é `esplora` — vocabulário de quem construiu, e
 * não de quem usa. Agrupados, a primeira escolha passa a ser sobre o mundo dela:
 * um nó, um servidor, ou nenhum dos dois.
 *
 * O grupo também decide a **postura de privacidade**, e é por isso que a caixa
 * "é pública" saiu do formulário: quem cadastra o próprio nó é soberano, quem
 * escolhe explorador público é exposto, e deixar isso como caixa marcável
 * permitia que o selo do cabeçalho mentisse.
 */
export type GrupoDeFonte = 'no' | 'servidor' | 'publico'

export const GRUPOS: GrupoDeFonte[] = ['no', 'servidor', 'publico']

export interface PresetDaTela {
  id: PresetId
  /** nome próprio: não se traduz, e é como a pessoa conhece a fonte */
  nome: string
  grupo: GrupoDeFonte
  pede: 'host-porta' | 'url' | 'nada' | 'datadir'
  portaPadrao?: Record<Network, number>
  precisaAutenticar?: boolean
  isPublic: boolean
}

const ELECTRUM = { mainnet: 50001, signet: 50001, testnet: 50001 }

export const PRESETS: PresetDaTela[] = [
  {
    // O caminho de menor atrito: um campo só, e o programa deduz rede, porta
    // e cookie. Vem primeiro porque é o que quem tem nó deveria usar.
    id: 'core-datadir',
    nome: 'Bitcoin Core (procurar o meu nó)',
    grupo: 'no',
    pede: 'datadir',
    precisaAutenticar: false,
    isPublic: false,
  },
  {
    id: 'core',
    nome: 'Bitcoin Core (host e porta)',
    grupo: 'no',
    pede: 'host-porta',
    portaPadrao: { mainnet: 8332, signet: 38332, testnet: 18332 },
    precisaAutenticar: true,
    isPublic: false,
  },
  { id: 'fulcrum', grupo: 'servidor', nome: 'Fulcrum', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'electrs', grupo: 'servidor', nome: 'Electrs', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'floresta', grupo: 'servidor', nome: 'Floresta', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
  { id: 'mempool', grupo: 'publico', nome: 'mempool.space', pede: 'nada', isPublic: true },
  { id: 'blockstream', grupo: 'publico', nome: 'Blockstream.info', pede: 'nada', isPublic: true },
  { id: 'esplora', grupo: 'servidor', nome: 'Esplora próprio', pede: 'url', isPublic: false },
  { id: 'electrum', grupo: 'servidor', nome: 'Outro Electrum', pede: 'host-porta', portaPadrao: ELECTRUM, isPublic: false },
]

export function presetPor(id: string): PresetDaTela {
  return PRESETS.find(p => p.id === id) ?? PRESETS[0]!
}

export function presetsDoGrupo(grupo: GrupoDeFonte): PresetDaTela[] {
  return PRESETS.filter(p => p.grupo === grupo)
}

/**
 * O que o grupo oferece primeiro.
 *
 * Para quem tem nó, é o preset de **um campo só** — o diretório de dados, do
 * item C. O de host e porta continua existindo para quem tem o nó em outra
 * máquina, mas deixa de ser o padrão: ele pede quatro campos e três conceitos,
 * e era o que abria o formulário.
 */
export function presetPadraoDoGrupo(grupo: GrupoDeFonte): PresetId {
  return presetsDoGrupo(grupo)[0]!.id
}

/**
 * `localhost` dentro de um container é o próprio container. É a armadilha que
 * custa a primeira tentativa de todo mundo, e por isso o aviso aparece
 * enquanto a pessoa digita, e não depois de salvar.
 */
export function pareceLocalhost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|::1)$/i.test(host.trim())
}
