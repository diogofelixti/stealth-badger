import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig()
const app = buildApp()

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`stealth-badger ouvindo em ${address} · rede ${config.network}`)
})
