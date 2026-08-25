export interface Config {
  port: number
  databaseUrl: string
  masterKeyHex: string
  esploraUrl: string
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
  if (key.length !== 64) {
    throw new Error('MASTER_KEY_HEX deve ter 64 caracteres hex (32 bytes)')
  }
  const network = (process.env.NETWORK ?? 'signet') as Config['network']
  if (!['mainnet', 'signet', 'testnet'].includes(network)) {
    throw new Error(`NETWORK inválida: ${network}`)
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    // mesmo padrão de db/pool.ts, para que a suíte de testes só precise
    // definir MASTER_KEY_HEX
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://badger:badger@localhost:5432/stealth_badger',
    masterKeyHex: key,
    esploraUrl: process.env.ESPLORA_URL ?? 'https://mempool.space/signet/api',
    network,
    publicBackend: process.env.PUBLIC_BACKEND !== 'false',
  }
}
