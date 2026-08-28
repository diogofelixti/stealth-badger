import { deliver } from '../alerts/channels'
import { alertsForOrigin, alertsForTxType } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import type { Network } from '../wallet/descriptor'
import { origensEm } from './origem'
import { salvarTxScan, salvarTxScanCompleto, transacoesSemAnalise } from './origem-store'
import { scanTransaction, type TxScan } from './scan'

export interface TxScanContext {
  txid: string
  network: Network
  backendUrl: string
}

export type TxScanner = (ctx: TxScanContext) => Promise<TxScan>

/**
 * Quantas transações analisar por vez.
 *
 * Cada `scan tx` custa segundos contra a cadeia. Sem teto, uma carteira com
 * trinta depósitos gastaria minutos na primeira vez e o usuário concluiria que
 * travou. A fila avança da mais recente para a mais antiga, então o que fica
 * de fora é o passado distante e não o depósito que acabou de chegar.
 */
export const TETO_DE_TRANSACOES = 5

/**
 * Análises em andamento, por carteira.
 *
 * Duas análises da mesma carteira ao mesmo tempo — uma do clique, outra do
 * worker — analisariam a mesma fila em paralelo, gastando o dobro do
 * explorador para chegar ao mesmo lugar.
 */
const emAndamento = new Map<number, Promise<void>>()

export function origemEmAndamento(walletId: number): boolean {
  return emAndamento.has(walletId)
}

/** Espera a análise daquela carteira, se houver. Existe para os testes. */
export async function aguardarOrigens(walletId: number): Promise<void> {
  await emAndamento.get(walletId)
}

export interface OrigemContext {
  walletId: number
  userId: number
  network: Network
  backendUrl: string
  txScanner?: TxScanner
}

/**
 * Analisa a origem das transações que trouxeram fundos e ainda não foram
 * olhadas, e alerta sobre o que encontrar.
 *
 * Roda em segundo plano: se o ciclo do worker esperasse por ela, deixaria de
 * sincronizar as outras carteiras durante os segundos que cada transação custa.
 */
export function analisarOrigens(ctx: OrigemContext): boolean {
  if (emAndamento.has(ctx.walletId)) return false

  const scanner = ctx.txScanner ?? ((c: TxScanContext) => scanTransaction(c))

  const tarefa = (async () => {
    for (const pendente of await transacoesSemAnalise(ctx.walletId, TETO_DE_TRANSACOES)) {
      try {
        const resultado = await scanner({
          txid: pendente.txid,
          network: ctx.network,
          backendUrl: ctx.backendUrl,
        })
        await salvarTxScanCompleto(ctx.walletId, pendente.txid, resultado)

        const contextoDeAlerta = {
          userId: ctx.userId,
          walletId: ctx.walletId,
          eventId: pendente.eventId,
          txid: pendente.txid,
        }
        const candidatos = [
          ...alertsForOrigin(origensEm(resultado.findings), contextoDeAlerta),
          ...alertsForTxType({ ...contextoDeAlerta, txType: resultado.txType }),
        ]

        for (const candidato of candidatos) {
          const id = await saveAlert(candidato)
          if (id === null) continue
          await deliver(
            {
              id,
              walletId: ctx.walletId,
              type: candidato.type,
              severity: candidato.severity,
              params: candidato.params,
            },
            ctx.userId,
          )
        }
      } catch (err) {
        // A tentativa fica registrada mesmo tendo falhado: transação que falha
        // sempre consumiria a cota a cada volta, e as outras nunca chegariam a
        // ser analisadas.
        const motivo = (err as Error).message
        await salvarTxScan(ctx.walletId, pendente.txid, [], 'desconhecida', motivo)
        console.error(
          'falha ao analisar a origem de ' + pendente.txid + ': ' + motivo,
        )
      }
    }
  })()
    .catch(err => {
      // Analisar origem é acessório: falhar aqui não pode derrubar o worker,
      // que ainda precisa vigiar movimentação.
      console.error(
        'análise de origem da carteira ' + ctx.walletId + ' falhou: ' + (err as Error).message,
      )
    })
    .finally(() => {
      emAndamento.delete(ctx.walletId)
    })

  emAndamento.set(ctx.walletId, tarefa)
  return true
}
