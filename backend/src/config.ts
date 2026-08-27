export type BackendKind = 'esplora' | 'electrum' | 'core'

export interface Config {
  port: number
  databaseUrl: string
  masterKeyHex: string
  backendKind: BackendKind
  backendUrl: string
  network: 'mainnet' | 'signet' | 'testnet'
  publicBackend: boolean
  workerIntervalMs: number
}

/**
 * Piso do intervalo entre ciclos.
 *
 * Não é gosto: intervalo menor que a duração de um ciclo empilha
 * sincronizações da mesma carteira sobre o mesmo log append-only, e quanto
 * mais lento o explorador, mais ciclos se acumulam. Medido contra a signet,
 * uma carteira de 77 endereços leva por volta de seis segundos.
 */
const INTERVALO_MINIMO_MS = 5_000
const INTERVALO_PADRAO_MS = 30_000

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  return v
}

export function loadConfig(): Config {
  const key = required('MASTER_KEY_HEX')
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      'MASTER_KEY_HEX deve ter 64 caracteres hexadecimais (32 bytes)',
    )
  }
  const network = (process.env.NETWORK ?? 'signet') as Config['network']
  if (!['mainnet', 'signet', 'testnet'].includes(network)) {
    throw new Error(`NETWORK inválida: ${network}`)
  }

  const bruto = process.env.WORKER_INTERVAL_MS
  const workerIntervalMs = bruto === undefined ? INTERVALO_PADRAO_MS : Number(bruto)
  if (!Number.isFinite(workerIntervalMs) || workerIntervalMs < INTERVALO_MINIMO_MS) {
    throw new Error(
      `WORKER_INTERVAL_MS inválido: ${bruto}. Use milissegundos, no mínimo ` +
        `${INTERVALO_MINIMO_MS} — abaixo disso um ciclo começa por cima do anterior.`,
    )
  }

  const backendKind = (process.env.CHAIN_BACKEND ?? 'esplora') as BackendKind
  if (!['esplora', 'electrum', 'core'].includes(backendKind)) {
    throw new Error(`CHAIN_BACKEND inválido: ${backendKind}`)
  }

  // Um servidor Electrum é, na prática, o do próprio usuário; o Esplora
  // padrão é um explorador público. A postura assumida segue essa realidade,
  // e PUBLIC_BACKEND continua podendo contrariá-la nos dois sentidos — quem
  // aponta para um Esplora próprio, ou para um Electrum de terceiro, precisa
  // dizer, porque é o aviso de privacidade da tela que depende disto.
  // Electrum e Core são infraestrutura de quem roda; Esplora, por padrão, é
  // explorador público de terceiro.
  const eletrum = backendKind === 'electrum'
  const proprio = backendKind !== 'esplora'
  const declarado = process.env.PUBLIC_BACKEND
  const publicBackend = declarado === undefined ? !proprio : declarado !== 'false'

  return {
    port: Number(process.env.PORT ?? 3000),
    // mesmo padrão de db/pool.ts, para que a suíte de testes só precise
    // definir MASTER_KEY_HEX
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://badger:badger@localhost:5432/stealth_badger',
    masterKeyHex: key,
    backendKind,
    backendUrl:
      backendKind === 'core'
        ? process.env.CORE_URL ?? 'http://127.0.0.1:8332'
        : eletrum
          ? process.env.ELECTRUM_URL ?? 'electrum://127.0.0.1:50001'
          : process.env.ESPLORA_URL ?? 'https://mempool.space/signet/api',
    network,
    publicBackend,
    workerIntervalMs,
  }
}
