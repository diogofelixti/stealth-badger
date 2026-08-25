import { buildApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { startAlertListener } from './stream/sse'
import { startWorkerLoop } from './worker/loop'
import { tick } from './worker/tick'

const config = loadConfig()

await migrate()
await startAlertListener()

const app = buildApp()
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log('stealth-badger ouvindo na porta ' + config.port + ' · rede ' + config.network)

const INTERVALO_MS = 30_000
startWorkerLoop(tick, INTERVALO_MS, err =>
  console.error('falha no ciclo do worker:', err),
)
