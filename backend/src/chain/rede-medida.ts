import type { Network } from '../wallet/descriptor'

/**
 * Qual cadeia a fonte serve **de fato**, e não qual foi declarada no cadastro.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * Medido em 28/08: um Fulcrum de signet foi cadastrado como `mainnet`. O
 * `Testar` respondeu **responde, bloco 319.762** e ficou por isso mesmo — a
 * altura da ponta prova que alguém está do outro lado, e não prova qual cadeia
 * é. A fonte então sumiu do grupo de signet no formulário de carteira, que era
 * o grupo onde a pessoa a procurava, e apareceu no de mainnet, onde ela não
 * olhou. O sintoma foi "a fonte não aparece"; a causa era a rede errada.
 *
 * O estrago maior seria o silencioso: uma carteira de mainnet vigiada por um
 * servidor de signet devolve saldo zero e nenhum UTXO, e isso se parece com
 * uma carteira vazia.
 *
 * O hash do bloco 0 identifica a cadeia sem ambiguidade, e as três fontes
 * sabem responder isso: `blockHashAt(0)` já está na interface do adapter.
 */
const GENESIS: Record<string, Network> = {
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f': 'mainnet',
  '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6': 'signet',
  '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943': 'testnet',
  '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043': 'testnet',
}

/**
 * A rede daquele genesis, ou `null` quando ele não é conhecido.
 *
 * `null` **não** é contradição. Signet é parametrizável: quem roda um signet
 * próprio tem outro genesis, e é uma instalação perfeitamente legítima.
 * Chamá-la de rede errada seria o produto afirmando o que não mediu — o
 * mesmo defeito que ele existe para denunciar.
 */
export function redeDoGenesis(hash: string): Network | null {
  return GENESIS[hash.trim().toLowerCase()] ?? null
}

/** O que o `getblockchaininfo` do Bitcoin Core chama de cadeia. */
export function redeDaChainDoCore(chain: string): Network | null {
  switch (chain.trim().toLowerCase()) {
    case 'main':
      return 'mainnet'
    case 'signet':
      return 'signet'
    case 'test':
    case 'testnet4':
      return 'testnet'
    default:
      return null
  }
}

/** A frase que a tela mostra quando a fonte serve outra cadeia. */
export function fraseDaRedeTrocada(servida: Network, declarada: Network): string {
  return (
    'esta fonte serve ' +
    servida +
    ', e está cadastrada como ' +
    declarada +
    '. Cadastre-a de novo escolhendo ' +
    servida +
    ' — uma carteira vigiada pela cadeia errada mostra saldo zero, que se ' +
    'parece com carteira vazia.'
  )
}
