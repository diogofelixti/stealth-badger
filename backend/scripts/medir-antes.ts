/**
 * Replica, só lendo, o padrão de requisições da varredura anterior — histórico
 * completo de cada endereço da janela mais a lista de UTXO dos usados — para
 * comparar com o ciclo incremental. Não escreve nada.
 */
import { pool } from '../src/db/pool'

const { rows: backend } = await pool.query<{ url: string }>(
  `SELECT b.url FROM wallets w JOIN backends b ON b.id = w.backend_id ORDER BY w.id LIMIT 1`,
)
const base = backend[0]!.url.replace(/\/+$/, '')

const { rows: enderecos } = await pool.query<{ address: string; is_used: boolean }>(
  'SELECT address, is_used FROM addresses ORDER BY chain, idx',
)

let pedidos = 0
let bytes = 0
async function medir(path: string): Promise<void> {
  pedidos += 1
  bytes += (await (await fetch(base + path)).text()).length
}

const t0 = Date.now()
await medir('/blocks/tip/height')
for (const e of enderecos) {
  await medir('/address/' + e.address + '/txs')
  if (e.is_used) await medir('/address/' + e.address + '/utxo')
}
console.log(
  JSON.stringify({
    segundos: ((Date.now() - t0) / 1000).toFixed(1),
    requisicoes: pedidos,
    kilobytes: Math.round(bytes / 1024),
  }),
)
await pool.end()
