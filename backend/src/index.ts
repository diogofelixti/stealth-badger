import { setDefaultResultOrder } from 'node:dns'
import { buildApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { startAlertListener } from './stream/sse'
import { startWorkerLoop } from './worker/loop'
import { tick } from './worker/tick'
import { varrerSaude } from './chain/saude'
import { ensureBackendsPublicos } from './chain/backends'

/**
 * IPv4 antes de IPv6 na resolução de nomes.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * Medido em 28/08: o container do backend tem **só `::1`** como endereço IPv6,
 * ou seja, nenhuma saída IPv6 para a internet. É o padrão do Docker. O DNS,
 * porém, devolve AAAA para `blockstream.info` e `mempool.space`, e o Node
 * tentava o IPv6 primeiro.
 *
 * O erro que isso produz é `fetch failed`, sem host, sem código e sem causa. Ele
 * apareceu como "falha na sincronização" em três carteiras de mainnet e mandou
 * procurar defeito no explorador, que estava de pé o tempo todo: forçando IPv4,
 * o mesmo host respondeu em 0,76 s.
 *
 * Vale para o processo inteiro, e `privacy/scan.ts` repassa a mesma ordem ao
 * scanner, que é outro processo Node e herdaria o mesmo tropeço.
 */
setDefaultResultOrder('ipv4first')

const config = loadConfig()

await migrate()
await startAlertListener()

const app = buildApp()
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log('stealth-badger ouvindo na porta ' + config.port + ' · rede ' + config.network)

const INTERVALO_MS = config.workerIntervalMs
startWorkerLoop(tick, INTERVALO_MS, err =>
  console.error('falha no ciclo do worker:', err),
)

/**
 * A saúde das fontes é medida fora do `tick()`, e não dentro.
 *
 * O ciclo do worker é serializado de propósito — é o que protege o log
 * append-only —, e uma carteira em rescan pelo Core segura esse ciclo por
 * minutos. Medir as fontes ali dentro faria a lista de fontes envelhecer
 * junto com o rescan, que é justamente quando a pessoa está na tela
 * procurando outra fonte.
 */
const INTERVALO_DA_SAUDE_MS = 5 * 60_000
const medirFontes = (): void => {
  // Semear antes de medir: numa instância recém-subida as públicas ainda não
  // existem como linha, e a primeira varredura acharia zero fontes — deixando
  // a tela em `unknown` até o ciclo seguinte, cinco minutos depois.
  void ensureBackendsPublicos()
    .then(() => varrerSaude())
    .catch(err => console.error('falha ao medir as fontes:', err))
}
medirFontes()
setInterval(medirFontes, INTERVALO_DA_SAUDE_MS).unref()
