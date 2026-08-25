import type { ChainAdapter } from '../chain/types'
import { deriveAddress } from './derive'
import type { Network, ScriptType } from './descriptor'

/**
 * Ordem de tentativa. Native segwit primeiro porque é o que uma carteira
 * moderna exporta como `xpub`/`tpub` puro; taproot por último porque é o
 * mais recente e o menos provável num histórico já existente.
 */
const CANDIDATOS: ScriptType[] = ['p2wpkh', 'p2sh-p2wpkh', 'p2pkh', 'p2tr']

/** Quantos endereços de cada tipo consultar antes de descartá-lo. */
const PROFUNDIDADE = 3

/**
 * Descobre o tipo de script de uma chave estendida perguntando à cadeia qual
 * das derivações possíveis tem histórico.
 *
 * Existe porque `xpub` e `tpub` não dizem o tipo de script: quem exporta a
 * chave por descriptor (Bitcoin Core, Sparrow) usa a mesma codificação para
 * legado, segwit aninhado, native segwit e taproot. Adivinhar errado não dá
 * erro nenhum — a carteira sincroniza, encontra endereços que nunca foram
 * usados, e mostra saldo zero como se estivesse tudo certo.
 *
 * Devolve `null` quando nenhum candidato tem histórico. Isso não é falha:
 * carteira nova não tem o que detectar, e inventar um tipo seria pior que
 * admitir que ainda não dá para saber.
 */
export async function detectScriptType(
  canonicalXpub: string,
  network: Network,
  adapter: ChainAdapter,
): Promise<ScriptType | null> {
  // Um backend que exige registro de descriptor não responde por endereço.
  if (!adapter.getHistoryForAddress) return null

  for (const tipo of CANDIDATOS) {
    for (let i = 0; i < PROFUNDIDADE; i += 1) {
      const { address } = deriveAddress(canonicalXpub, tipo, network, 0, i)
      const historico = await adapter.getHistoryForAddress(address)
      if (historico.length > 0) return tipo
    }
  }

  return null
}
