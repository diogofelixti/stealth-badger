export type BackendKind = 'esplora' | 'electrum'

export interface Config {
  port: number
  databaseUrl: string
  masterKeyHex: string
  backendKind: BackendKind
  backendUrl: string
  network: 'mainnet' | 'signet' | 'testnet'
  publicBackend: boolean
}

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

  const backendKind = (process.env.CHAIN_BACKEND ?? 'esplora') as BackendKind
  if (!['esplora', 'electrum'].includes(backendKind)) {
    throw new Error(`CHAIN_BACKEND inválido: ${backendKind}`)
  }

  // Um servidor Electrum é, na prática, o do próprio usuário; o Esplora
  // padrão é um explorador público. A postura assumida segue essa realidade,
  // e PUBLIC_BACKEND continua podendo contrariá-la nos dois sentidos — quem
  // aponta para um Esplora próprio, ou para um Electrum de terceiro, precisa
  // dizer, porque é o aviso de privacidade da tela que depende disto.
  const eletrum = backendKind === 'electrum'
  const declarado = process.env.PUBLIC_BACKEND
  const publicBackend = declarado === undefined ? !eletrum : declarado !== 'false'

  return {
    port: Number(process.env.PORT ?? 3000),
    // mesmo padrão de db/pool.ts, para que a suíte de testes só precise
    // definir MASTER_KEY_HEX
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://badger:badger@localhost:5432/stealth_badger',
    masterKeyHex: key,
    backendKind,
    backendUrl: eletrum
      ? process.env.ELECTRUM_URL ?? 'electrum://127.0.0.1:50001'
      : process.env.ESPLORA_URL ?? 'https://mempool.space/signet/api',
    network,
    publicBackend,
  }
}
