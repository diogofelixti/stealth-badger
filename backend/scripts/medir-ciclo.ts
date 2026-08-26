/**
 * Mede um ciclo de sincronização contra o backend de cadeia configurado,
 * contando requisições e endereços pulados.
 *
 * Pare o worker antes de rodar (`docker stop <backend>`): este script executa
 * uma sincronização de verdade, e duas sincronizações concorrentes da mesma
 * carteira escrevem no mesmo log append-only.
 */
import { createEsploraAdapter } from '../src/chain/esplora'
import { pool } from '../src/db/pool'
import { syncWallet } from '../src/sync/engine'

const { rows } = await pool.query<{ id: string; url: string; is_public: boolean }>(
  `SELECT w.id, b.url, b.is_public FROM wallets w JOIN backends b ON b.id = w.backend_id
    ORDER BY w.id LIMIT 1`,
)
const w = rows[0]
if (!w) throw new Error('nenhuma carteira cadastrada')

let pedidos = 0
let bytes = 0
const contando: typeof fetch = async (input, init) => {
  pedidos += 1
  const res = await fetch(input as RequestInfo, init)
  const texto = await res.text()
  bytes += texto.length
  return new Response(texto, { status: res.status, headers: res.headers })
}

const adapter = createEsploraAdapter(w.url, { isPublic: w.is_public, fetchFn: contando })
const t0 = Date.now()
const r = await syncWallet(Number(w.id), adapter)
console.log(
  JSON.stringify({
    segundos: ((Date.now() - t0) / 1000).toFixed(1),
    requisicoes: pedidos,
    kilobytes: Math.round(bytes / 1024),
    enderecosPulados: r.skipped,
    eventosNovos: r.newEvents.length,
  }),
)
await pool.end()
