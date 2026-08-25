import pg from 'pg'
import { connectionString } from '../db/pool'

type Send = (payload: unknown) => void

export interface AlertListenerOptions {
  /** Injetável para teste; em produção é uma conexão dedicada do Postgres. */
  createClient?: () => pg.Client
  retryDelayMs?: number
}

const CANAL = 'sb_alerts'
const RETRY_PADRAO_MS = 2_000

const subscribers = new Map<number, Set<Send>>()

let client: pg.Client | null = null
let retry: NodeJS.Timeout | null = null
let parado = true
let opcoes: Required<AlertListenerOptions> = {
  createClient: () => new pg.Client({ connectionString }),
  retryDelayMs: RETRY_PADRAO_MS,
}

function despachar(msg: pg.Notification): void {
  if (!msg.payload) return
  let payload: { userId?: number }
  try {
    payload = JSON.parse(msg.payload) as { userId?: number }
  } catch {
    // Payload malformado não pode derrubar a conexão: o feed dos outros
    // usuários continua dependendo dela.
    console.error('payload de alerta ilegível no canal ' + CANAL)
    return
  }
  if (typeof payload.userId !== 'number') return
  for (const send of subscribers.get(payload.userId) ?? []) send(payload)
}

async function conectar(): Promise<void> {
  const novo = opcoes.createClient()

  // Registrado antes de connect(): um 'error' sem handler no EventEmitter do
  // pg derruba o processo inteiro, e a API cairia junto com o feed.
  novo.on('error', err => {
    console.error('listener de alertas caiu: ' + (err as Error).message)
    agendarReconexao()
  })
  novo.on('end', () => agendarReconexao())
  novo.on('notification', despachar)

  await novo.connect()
  await novo.query('LISTEN ' + CANAL)
  client = novo
}

function agendarReconexao(): void {
  if (parado || retry) return
  client = null
  retry = setTimeout(() => {
    retry = null
    conectar().catch(err => {
      console.error('falha ao reconectar o listener: ' + (err as Error).message)
      agendarReconexao()
    })
  }, opcoes.retryDelayMs)
  // Reconectar não é motivo para segurar o processo de pé.
  retry.unref?.()
}

/**
 * Abre a conexão dedicada que escuta `NOTIFY` do Postgres e alimenta o SSE.
 *
 * A conexão cai — Postgres reinicia, a rede pisca, o proxy corta ocioso. Sem
 * reconexão, o feed ao vivo para de chegar sem nenhum erro na tela: a página
 * fica exibindo o último estado como se fosse o atual. Os inscritos vivem fora
 * do cliente justamente para atravessar a reconexão sem que o browser precise
 * reabrir o EventSource.
 */
export async function startAlertListener(
  options: AlertListenerOptions = {},
): Promise<void> {
  if (client) return
  opcoes = {
    createClient:
      options.createClient ?? (() => new pg.Client({ connectionString })),
    retryDelayMs: options.retryDelayMs ?? RETRY_PADRAO_MS,
  }
  parado = false
  // A primeira conexão falha alto: se o banco não está de pé no boot, é
  // melhor o processo não subir fingindo que vigia.
  await conectar()
}

export async function stopAlertListener(): Promise<void> {
  parado = true
  if (retry) {
    clearTimeout(retry)
    retry = null
  }
  const atual = client
  client = null
  if (atual) await atual.end().catch(() => undefined)
}

export function subscribeToAlerts(userId: number, send: Send): () => void {
  let set = subscribers.get(userId)
  if (!set) {
    set = new Set()
    subscribers.set(userId, set)
  }
  set.add(send)

  return () => {
    set.delete(send)
    if (set.size === 0) subscribers.delete(userId)
  }
}
