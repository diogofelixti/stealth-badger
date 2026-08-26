import type { FastifyInstance } from 'fastify'
import { loadConfig } from '../config'
import { open } from '../crypto/secretbox'
import { pool } from '../db/pool'
import type { Network, ScriptType } from '../wallet/descriptor'
import { deliver } from '../alerts/channels'
import { alertsForScan } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import { aguardarScan, erroDoUltimoScan, registrarScan, scanEmAndamento } from './andamento'
import { scanWallet, type PrivacyScan } from './scan'
import { historicoDeScans, salvarScan, ultimoScan } from './store'

/**
 * Quantos pontos de queda de privacy score valem um aviso.
 *
 * Fixo, como o limiar de dust: uma tabela de regras por usuário é Plano 2. O
 * valor não é redondo por acaso — o scanner reavalia a carteira inteira a cada
 * execução, e variação de um ou dois pontos é ruído de heurística.
 */
const LIMIAR_DE_QUEDA = 5

export interface ScanContext {
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  backendUrl: string
  gapLimit: number
}

export type WalletScanner = (ctx: ScanContext) => Promise<PrivacyScan>

export interface PrivacyRouteOptions {
  scanner?: WalletScanner
}

interface Linha {
  id: string
  xpub_encrypted: Buffer
  script_type: ScriptType
  network: Network
  gap_limit: number
  url: string
}

/** Carteira do usuário, ou `null` — inclusive quando é de outra pessoa. */
async function carteiraDoUsuario(
  userId: number,
  walletId: number,
): Promise<Linha | null> {
  const { rows } = await pool.query<Linha>(
    `SELECT w.id, w.xpub_encrypted, w.script_type, w.network, w.gap_limit, b.url
       FROM wallets w JOIN backends b ON b.id = w.backend_id
      WHERE w.id = $1 AND w.user_id = $2`,
    [walletId, userId],
  )
  return rows[0] ?? null
}

export function registerPrivacyRoutes(
  app: FastifyInstance,
  opts: PrivacyRouteOptions = {},
): void {
  const scanner = opts.scanner ?? ((ctx: ScanContext) => scanWallet(ctx))

  app.post<{ Params: { id: string } }>('/api/wallets/:id/scan', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const walletId = Number(req.params.id)
    const carteira = await carteiraDoUsuario(req.userId, walletId)
    if (!carteira) return reply.code(404).send({ error: 'carteira não encontrada' })

    // A análise leva mais de um minuto contra a cadeia real. Segurar a conexão
    // aberta entregaria a decisão a um timeout de proxy, e o usuário veria
    // "erro" numa análise que estava indo bem.
    const userId = req.userId
    registrarScan(walletId, async () => {
      // Lido antes de gravar: depois, a análise nova já é a última.
      const anterior = await ultimoScan(walletId)

      const canonicalXpub = open(carteira.xpub_encrypted, loadConfig().masterKeyHex)
      const resultado = await scanner({
        canonicalXpub,
        scriptType: carteira.script_type,
        network: carteira.network,
        backendUrl: carteira.url,
        gapLimit: carteira.gap_limit,
      })
      const scanId = await salvarScan(walletId, resultado)

      const candidatos = alertsForScan(
        anterior,
        { id: scanId, score: resultado.score, grade: resultado.grade },
        { userId, walletId, scanId, dropThreshold: LIMIAR_DE_QUEDA },
      )
      for (const candidato of candidatos) {
        const id = await saveAlert(candidato)
        if (id === null) continue
        await deliver(
          {
            id,
            walletId,
            type: candidato.type,
            severity: candidato.severity,
            params: candidato.params,
          },
          userId,
        )
      }
    })

    return reply.code(202).send({ status: 'running' })
  })

  app.get<{ Params: { id: string } }>('/api/wallets/:id/privacy', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const walletId = Number(req.params.id)
    if (!(await carteiraDoUsuario(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }

    return reply.send({
      latest: await ultimoScan(walletId),
      history: (await historicoDeScans(walletId)).map(s => ({
        score: s.score,
        grade: s.grade,
        scannedAt: s.scannedAt,
      })),
      running: scanEmAndamento(walletId),
      error: erroDoUltimoScan(walletId),
    })
  })
}

export { aguardarScan }
