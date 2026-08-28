import type { ChainAdapter } from '../chain/types'
import type { Network } from '../wallet/descriptor'
import { createAdapter, type BackendRow } from '../chain/adapter'
import { pool } from '../db/pool'
import { activeEvents } from '../events/log'
import { alertsForEvent } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import { deliver } from '../alerts/channels'
import { syncWallet } from '../sync/engine'
import { analisarOrigens, type TxScanner } from '../privacy/origem-service'
import { resolverFonteDeAnalise } from '../privacy/fonte-de-analise'
import type { BackendKind } from '../config'

export interface TickReport {
  walletsSynced: number
  alertsCreated: number
}

const DUST_THRESHOLD = 1000

interface TickOptions {
  adapterFactory?: (backend: BackendRow) => ChainAdapter
  txScanner?: TxScanner
}

export async function tick(opts: TickOptions = {}): Promise<TickReport> {
  const factory = opts.adapterFactory ?? createAdapter

  const { rows: wallets } = await pool.query<{
    id: string
    user_id: string
    kind: string
    url: string
    is_public: boolean
    network: Network
    credentials_encrypted: Buffer | null
  }>(
    // Carteira arquivada não é consultada. Sem este WHERE ela sumiria da tela
    // e continuaria perguntando ao explorador público de trás da cortina, que
    // é o oposto do que quem arquivou pediu.
    `SELECT w.id, w.user_id, b.kind, b.url, b.is_public, b.network,
            b.credentials_encrypted
       FROM wallets w JOIN backends b ON b.id = w.backend_id
      WHERE w.archived_at IS NULL
      ORDER BY w.id`,
  )

  let walletsSynced = 0
  let alertsCreated = 0

  for (const w of wallets) {
    const walletId = Number(w.id)
    const userId = Number(w.user_id)

    const adapter = factory({
      kind: w.kind,
      url: w.url,
      isPublic: w.is_public,
      network: w.network,
      // o modelo de registro precisa saber de quem é a carteira de observação
      walletId,
      credentialsEncrypted: w.credentials_encrypted,
    })

    let result
    try {
      result = await syncWallet(walletId, adapter)
    } catch (err) {
      console.error('falha ao sincronizar carteira ' + walletId + ': ' + (err as Error).message)
      continue
    } finally {
      // O Electrum segura um socket. Sem fechar aqui, o worker acumula uma
      // conexão por carteira a cada volta — e a volta que falha é a que mais
      // se repete.
      adapter.close?.()
    }
    walletsSynced += 1

    if (result.newEvents.length === 0) continue

    // Transação nova detectada é o gatilho que o design prevê para a análise
    // de origem. Sai daqui, e não do clique, porque é o worker que detecta —
    // senão a origem de um depósito só seria conhecida se alguém estivesse
    // olhando a tela. Em segundo plano: cada transação custa segundos, e o
    // ciclo ainda tem outras carteiras para sincronizar.
    //
    // A fonte de análise não é a de cadeia: o scanner só fala REST no formato
    // Esplora. Sem uma, o worker não tenta — dez de dez análises falharam em
    // 28/08 justamente por mandarem o RPC do Core para o scanner, e um erro
    // guardado a cada ciclo é ruído que esconde o erro de verdade.
    const analise = resolverFonteDeAnalise({
      backendKind: w.kind as BackendKind,
      backendUrl: w.url,
      network: w.network,
    })
    if (analise.disponivel) {
      analisarOrigens({
        walletId,
        userId,
        network: w.network,
        backendUrl: analise.url,
        ...(opts.txScanner ? { txScanner: opts.txScanner } : {}),
      })
    }

    const events = await activeEvents(walletId)
    const novos = events.filter(e => result.newEvents.includes(e.id))

    for (const event of novos) {
      const { address, wasUsedBefore } = await addressContext(walletId, event)
      for (const candidate of alertsForEvent(event, {
        userId,
        tipHeight: result.tipHeight,
        dustThreshold: DUST_THRESHOLD,
        addressWasUsed: wasUsedBefore,
        address,
      })) {
        const id = await saveAlert(candidate)
        if (id === null) continue
        alertsCreated += 1
        await deliver(
          {
            id,
            walletId,
            type: candidate.type,
            severity: candidate.severity,
            params: candidate.params,
          },
          userId,
        )
      }
    }
  }

  return { walletsSynced, alertsCreated }
}

async function addressContext(
  walletId: number,
  event: { id: number; payload: Record<string, unknown> },
): Promise<{ address: string; wasUsedBefore: boolean }> {
  const addressId = (event.payload as { addressId?: number }).addressId
  if (!addressId) return { address: '', wasUsedBefore: false }

  const { rows: addr } = await pool.query<{ address: string }>(
    'SELECT address FROM addresses WHERE id = $1',
    [addressId],
  )
  const full = addr[0]?.address ?? ''
  const address = full.length > 18 ? full.slice(0, 8) + '...' + full.slice(-6) : full

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM chain_events
      WHERE wallet_id = $1 AND type = 'utxo_created' AND rolled_back_by IS NULL
        AND id < $2 AND (payload->>'addressId')::int = $3`,
    [walletId, event.id, addressId],
  )
  return { address, wasUsedBefore: Number(rows[0]!.count) > 0 }
}
