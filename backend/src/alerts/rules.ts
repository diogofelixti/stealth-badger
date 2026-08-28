import type { StoredEvent } from '../events/log'
import type { AchadoDeOrigem } from '../privacy/origem'
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

export interface OriginAlertContext {
  userId: number
  walletId: number
  /** evento `utxo_created` que trouxe os fundos desta transação */
  eventId: number
  txid: string
}

/**
 * Alerta sobre de onde vieram os fundos.
 *
 * A frase é montada por referência ao catálogo — espécie, base e confiança
 * viram `@chave` — justamente para que o texto possa dizer "possível" quando o
 * scanner se baseou em comportamento e afirmar quando houve correspondência
 * numa base. O watchtower repassa o que o scanner viu; ele não promove
 * heurística a fato.
 */
export function alertsForOrigin(
  origens: AchadoDeOrigem[],
  ctx: OriginAlertContext,
): AlertCandidate[] {
  return origens.map(origem => ({
    userId: ctx.userId,
    walletId: ctx.walletId,
    type: 'kyc_origin',
    // Warning, e não crítico: crítico é reservado ao que pede ação imediata
    // para evitar dano — dust plantado, reuso de endereço. Origem já
    // aconteceu, e o que ela pede é cuidado ao gastar, não pressa.
    severity: 'warning',
    params: {
      kind: '@entity.' + origem.kind,
      basis: '@basis.' + origem.basis,
      confidence: '@confidence.' + origem.confidence,
      txid: ctx.txid.slice(0, 12) + '...',
    },
    // Por transação e espécie: reanalisar a mesma transação não repete o
    // aviso, mas duas espécies diferentes na mesma transação aparecem as duas.
    dedupeKey:
      'wallet:' + ctx.walletId + ':origin:' + ctx.txid + ':' + origem.kind,
    eventId: ctx.eventId,
  }))
}

export interface TxTypeAlertContext extends OriginAlertContext {
  txType: string | null | undefined
}

function classeDeTxType(txType: string | null | undefined): 'coinjoin' | 'payjoin' | null {
  const normalizado = txType?.toLowerCase() ?? ''
  if (normalizado.includes('payjoin')) return 'payjoin'
  if (normalizado.includes('coinjoin')) return 'coinjoin'
  return null
}

/**
 * Alerta informativo sobre forma de transação relevante para privacidade.
 *
 * Coinjoin e payjoin não são vazamento por si. Para quem fez, podem ser a
 * medida de privacidade; para quem recebeu, são contexto que muda a leitura do
 * UTXO antes de gastar junto com outros. O alerta preserva esse lado em vez de
 * transformar a heurística do scanner em acusação.
 */
export function alertsForTxType(ctx: TxTypeAlertContext): AlertCandidate[] {
  const classe = classeDeTxType(ctx.txType)
  if (!classe) return []

  return [
    {
      userId: ctx.userId,
      walletId: ctx.walletId,
      type: 'privacy_tx_type',
      severity: 'info',
      params: {
        txid: ctx.txid.slice(0, 12) + '...',
        txType: ctx.txType,
        meaning: '@tx_type.' + classe + '.received',
      },
      dedupeKey: 'wallet:' + ctx.walletId + ':tx-type:' + ctx.txid + ':' + classe,
      eventId: ctx.eventId,
    },
  ]
}
