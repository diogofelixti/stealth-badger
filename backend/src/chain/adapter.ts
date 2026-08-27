import type { BackendKind } from '../config'
import { open as abrirCaixa } from '../crypto/secretbox'
import type { Network } from '../wallet/descriptor'
import { createCoreAdapter } from './core'
import { criarRpc } from './core-rpc'
import { createElectrumAdapter } from './electrum'
import { createEsploraAdapter } from './esplora'
import type { ChainAdapter } from './types'

/** porta padrão do protocolo Electrum em texto puro */
const PORTA_ELECTRUM = 50001

export interface BackendRow {
  kind: string
  url: string
  isPublic: boolean
  network: Network
  /**
   * Qual carteira do watchtower está sendo sincronizada.
   *
   * Só o modelo de registro precisa disto, e precisa de verdade: duas
   * carteiras que compartilhassem a mesma carteira de observação no nó
   * receberiam de `listunspent` a união das duas, e os UTXOs de uma apareceriam
   * como saldo da outra.
   */
  walletId?: number
  /**
   * Credencial do RPC, cifrada, como está na linha de `backends`. O conteúdo
   * é aberto só aqui, na hora de falar com o nó — nunca sai numa resposta.
   */
  credentialsEncrypted?: Buffer | null
}

interface CredencialDoRpc {
  cookiePath?: string
  user?: string
  password?: string
}

/**
 * De onde sai a credencial do RPC: da linha do backend, e só depois do
 * ambiente.
 *
 * A ordem importa. `CORE_COOKIE_PATH` continua servindo ao backend global da
 * instância, que é cadastrado antes de existir usuário para guardar credencial
 * nenhuma; mas um nó cadastrado pela tela traz a sua, e ela tem de vencer —
 * senão duas pessoas apontando para nós diferentes usariam o mesmo cookie.
 */
export function credenciaisDoBackend(b: BackendRow): CredencialDoRpc {
  if (b.credentialsEncrypted) {
    try {
      const aberta = JSON.parse(
        abrirCaixa(b.credentialsEncrypted, process.env.MASTER_KEY_HEX ?? ''),
      ) as CredencialDoRpc
      if (aberta.cookiePath) return { cookiePath: aberta.cookiePath }
      if (aberta.user) return { user: aberta.user, password: aberta.password ?? '' }
    } catch {
      // Credencial que não abre é credencial de outra chave-mestra. Cair no
      // ambiente é melhor que derrubar o worker inteiro, e o erro real
      // aparece na primeira chamada ao nó, com o motivo do próprio nó.
    }
  }
  const doAmbiente = cookieDoAmbiente()
  return doAmbiente ? { cookiePath: doAmbiente } : {}
}

/**
 * Onde o cookie do bitcoind fica, quando a linha do backend não diz.
 *
 * Lido a cada chamada, e não uma vez na carga do módulo: o cookie do nó é
 * regerado a cada reinício, e um valor congelado no import é o tipo de coisa
 * que só aparece depois de horas de worker rodando com o arquivo errado.
 */
function cookieDoAmbiente(): string | undefined {
  return process.env.CORE_COOKIE_PATH
}
const CORE_RPC_TIMEOUT_MS = Number(process.env.CORE_RPC_TIMEOUT_MS ?? 600_000)

/**
 * Monta o adapter que a linha de `backends` descreve.
 *
 * Existe para que o tipo do backend seja um dado do banco, e não uma escolha
 * costurada em cada ponto de uso: o motor de sincronização e o cadastro de
 * carteira pedem o adapter pelo mesmo caminho.
 */
export function createAdapter(b: BackendRow): ChainAdapter {
  const kind = b.kind as BackendKind

  if (kind === 'esplora') {
    return createEsploraAdapter(b.url, { isPublic: b.isPublic })
  }

  if (kind === 'electrum') {
    const { hostname, port } = new URL(b.url)
    return createElectrumAdapter({
      host: hostname,
      port: port ? Number(port) : PORTA_ELECTRUM,
      network: b.network,
      isPublic: b.isPublic,
    })
  }

  if (kind === 'core') {
    if (b.walletId === undefined) {
      throw new Error(
        'o adapter de Bitcoin Core precisa saber de que carteira se trata: ' +
          'cada uma tem a sua carteira de observação no nó',
      )
    }
    return createCoreAdapter({
      rpc: criarRpc({
        url: b.url,
        ...credenciaisDoBackend(b),
        ...(Number.isFinite(CORE_RPC_TIMEOUT_MS) ? { timeoutMs: CORE_RPC_TIMEOUT_MS } : {}),
      }),
      // uma carteira de observação por carteira vigiada
      wallet: 'stealth-badger-' + b.walletId,
      host: (() => {
        try {
          return new URL(b.url).host + ' · carteira ' + b.walletId
        } catch {
          return b.url
        }
      })(),
    })
  }

  throw new Error(
    `tipo de backend de cadeia sem adapter: ${b.kind}. ` +
      'Há adapter para esplora, electrum e core.',
  )
}
