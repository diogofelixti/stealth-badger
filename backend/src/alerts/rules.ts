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

export interface ScanAlertContext {
  userId: number
  walletId: number
  /** id da análise que produziu o score atual; é o que ancora a deduplicação */
  scanId: number
  /**
   * Quantos pontos de queda valem um aviso.
   *
   * O scanner reavalia a carteira inteira a cada execução, e um ou dois pontos
   * de diferença são ruído de heurística. Alertar sobre ruído ensina o usuário
   * a ignorar o alerta, que é o pior resultado possível para um watchtower.
   */
  dropThreshold: number
}

/**
 * Alerta de queda de privacidade, comparando uma análise com a anterior.
 *
 * Não nasce de evento de cadeia — nasce de o scanner ter olhado a carteira
 * duas vezes e visto piora. Por isso `eventId` é nulo: amarrar a um evento
 * seria inventar uma causa que ninguém verificou.
 */
export function alertsForScan(
  anterior: { score: number; grade: string } | null,
  atual: { id: number; score: number; grade: string },
  ctx: ScanAlertContext,
): AlertCandidate[] {
  // Primeira análise não tem com o que comparar. Tratar a ausência como
  // "score anterior era 100" produziria um alerta de queda em toda carteira
  // recém-cadastrada.
  if (!anterior) return []

  const drop = anterior.score - atual.score
  if (drop < ctx.dropThreshold) return []

  return [
    {
      userId: ctx.userId,
      walletId: ctx.walletId,
      type: 'score_dropped',
      severity: 'warning',
      params: {
        from: anterior.score,
        to: atual.score,
        drop,
        grade: atual.grade,
      },
      // Uma análise gera no máximo um alerta de queda: sem isso, reanalisar a
      // mesma carteira repetiria o aviso a cada clique.
      dedupeKey: 'wallet:' + ctx.walletId + ':score:' + ctx.scanId,
      eventId: null,
    },
  ]
}
