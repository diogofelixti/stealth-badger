import type { BackendKind } from '../config'
import type { Network } from '../wallet/descriptor'

/**
 * A fonte de análise, que deixou de ser a fonte de cadeia em 28/08.
 *
 * ── O que estava errado ───────────────────────────────────────────────────
 * `--api` recebia a URL do backend da carteira. Quem vigia pelo próprio
 * Bitcoin Core recebia isto:
 *
 *   am-i-exposed --api http://host.docker.internal:38332 scan tx <txid>
 *     → {"error":true,"message":"Not found"}
 *
 * Dez de dez análises falharam assim. O `am-i-exposed` só fala REST no formato
 * Esplora — `/address/:a/txs`, `/address/:a/utxo`, `/tx/:id/hex`,
 * `/tx/:id/outspends`. Ele **não** fala RPC do Core e **não** fala Electrum, e
 * não há flag que mude isso: é dependência dele, não escolha nossa.
 *
 * ── Duas responsabilidades, dois nomes ────────────────────────────────────
 *
 * | | fonte de cadeia | fonte de análise |
 * |---|---|---|
 * | para quê | saldo, UTXO, eventos | rodar o scanner |
 * | escopo | por carteira | por usuário, por rede |
 * | aceita | Esplora, Electrum, **Core** | **só Esplora** |
 *
 * ── Como a escolha acontece ───────────────────────────────────────────────
 * Não por variável de ambiente: fonte de análise é uma fonte como as outras,
 * do mesmo catálogo de presets, e o usuário só cadastra o que é dele — nó ou
 * serviço local. O que a instância já semeia de fábrica está disponível para
 * escolher.
 *
 * Quando a fonte da carteira já é Esplora, ela serve e ninguém é perguntado.
 * Quando não é, a tela pergunta **uma vez por rede** e guarda a escolha. O
 * código não escolhe sozinho um terceiro que passará a ver os endereços
 * vigiados — mas também não trava: `needsChoice` é um pedido de escolha, e a
 * tela sabe listar as candidatas.
 */
export type MotivoSemAnalise = 'needsChoice'

export interface FonteDeAnalise {
  disponivel: true
  url: string
  /**
   * `wallet` — a própria fonte da carteira serve, e nenhum host novo passa a
   * ver os endereços. `chosen` — a pessoa escolheu outra, e ela é um
   * observador a mais quando é pública.
   */
  origem: 'wallet' | 'chosen'
  /** o host que verá os endereços consultados */
  host: string
  /** terceiro, ou infraestrutura da própria pessoa */
  isPublic: boolean
}

export interface SemFonteDeAnalise {
  disponivel: false
  reason: MotivoSemAnalise
  /** o tipo da fonte de cadeia, para a tela dizer por que ela não serve */
  chainKind: BackendKind
  network: Network
}

/** O host de uma URL, ou a própria string quando ela não tem forma de URL. */
export function hostDaAnalise(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** A fonte que a pessoa já escolheu para esta rede, vinda do banco. */
export interface FonteEscolhida {
  id: number
  url: string
  isPublic: boolean
}

export function resolverFonteDeAnalise(opts: {
  backendKind: BackendKind
  backendUrl: string
  backendIsPublic?: boolean
  network: Network
  escolhida?: FonteEscolhida | null | undefined
}): FonteDeAnalise | SemFonteDeAnalise {
  // Esplora já é o formato que o scanner fala, e é um host que a pessoa já
  // escolheu para sincronizar: usá-lo não acrescenta observador nenhum.
  if (opts.backendKind === 'esplora') {
    return {
      disponivel: true,
      url: opts.backendUrl,
      origem: 'wallet',
      host: hostDaAnalise(opts.backendUrl),
      isPublic: opts.backendIsPublic ?? true,
    }
  }

  if (opts.escolhida) {
    return {
      disponivel: true,
      url: opts.escolhida.url,
      origem: 'chosen',
      host: hostDaAnalise(opts.escolhida.url),
      isPublic: opts.escolhida.isPublic,
    }
  }

  // Nem trava nem escolhe sozinho: pede a escolha, uma vez por rede.
  return {
    disponivel: false,
    reason: 'needsChoice',
    chainKind: opts.backendKind,
    network: opts.network,
  }
}
