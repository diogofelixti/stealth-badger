import { buildApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { startAlertListener } from './stream/sse'
import { startWorkerLoop } from './worker/loop'
import { tick } from './worker/tick'
import { varrerSaude } from './chain/saude'
import { ensureBackendsPublicos } from './chain/backends'

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
