import type { StoredEvent } from '../events/log'
import { confirmationState, dedupeKey } from './dedupe'

export type Severity = 'info' | 'warning' | 'critical'

export interface AlertCandidate {
  userId: number
  walletId: number
  type: string
  severity: Severity
  params: Record<string, unknown>
  dedupeKey: string
  eventId: number | null
}

export interface AlertContext {
  userId: number
  tipHeight: number
  dustThreshold: number
  addressWasUsed: boolean
  address: string
}

export function alertsForEvent(event: StoredEvent, ctx: AlertContext): AlertCandidate[] {
  const out: AlertCandidate[] = []
  const base = { userId: ctx.userId, walletId: event.walletId, eventId: event.id }

  if (event.type === 'reorg_detected') {
    return [
      {
        ...base,
        type: 'reorg_detected',
        severity: 'warning',
        params: { height: event.height },
        dedupeKey: 'wallet:' + event.walletId + ':reorg:' + event.height + ':' + event.id,
      },
    ]
  }

  if (event.type === 'utxo_created' && event.txid) {
    const value = Number((event.payload as { valueSats?: number }).valueSats ?? 0)
    const state = confirmationState(event.height, ctx.tipHeight)

    out.push({
      ...base,
      type: 'funds_received',
      severity: 'info',
      params: { value, state: '@state.' + state },
      dedupeKey: dedupeKey(event.walletId, event.txid, state),
    })

    if (value > 0 && value < ctx.dustThreshold) {
      out.push({
        ...base,
        type: 'dust_received',
        severity: 'critical',
        params: { value, threshold: ctx.dustThreshold, address: ctx.address },
        dedupeKey: dedupeKey(event.walletId, event.txid, 'dust:' + state),
      })
    }

    if (ctx.addressWasUsed) {
      // Atenção, e não crítico: crítico é a poeira plantada, que pede uma
      // ação imediata (não gastar o UTXO). Reuso já aconteceu e o dano é
      // permanente — avisa, mas não disputa a atenção com o que ainda dá
      // para evitar.
      out.push({
        ...base,
        type: 'address_reused',
        severity: 'warning',
        params: { address: ctx.address },
        dedupeKey: dedupeKey(event.walletId, event.txid, 'reuse:' + state),
      })
    }
  }

  if (event.type === 'utxo_spent' && event.txid) {
    out.push({
      ...base,
      type: 'funds_spent',
      severity: 'info',
      params: { txid: event.txid.slice(0, 12) + '...', vout: event.vout },
      dedupeKey: dedupeKey(event.walletId, event.txid, 'spent:' + event.vout),
    })
  }

  return out
}
