import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../src/config'

const VALID_KEY = 'ab'.repeat(32) // 64 caracteres hex válidos

describe('loadConfig', () => {
  let envSnapshot: NodeJS.ProcessEnv

  beforeEach(() => {
    envSnapshot = { ...process.env }
  })

  afterEach(() => {
    process.env = envSnapshot
  })

  it('lança erro nomeando a variável quando MASTER_KEY_HEX está ausente', () => {
    delete process.env.MASTER_KEY_HEX
    expect(() => loadConfig()).toThrow('MASTER_KEY_HEX')
  })

  it('lança erro quando MASTER_KEY_HEX tem tamanho errado', () => {
    process.env.MASTER_KEY_HEX = 'abcd'
    expect(() => loadConfig()).toThrow(
      'MASTER_KEY_HEX deve ter 64 caracteres hexadecimais (32 bytes)',
    )
  })

  it('lança erro quando MASTER_KEY_HEX tem 64 caracteres mas não é hex', () => {
    process.env.MASTER_KEY_HEX = 'zz'.repeat(32)
    expect(() => loadConfig()).toThrow(
      'MASTER_KEY_HEX deve ter 64 caracteres hexadecimais (32 bytes)',
    )
  })

  it('vigia pelo Esplora público quando nada é dito', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    delete process.env.CHAIN_BACKEND
    delete process.env.PUBLIC_BACKEND
    const cfg = loadConfig()
    expect(cfg.backendKind).toBe('esplora')
    expect(cfg.publicBackend).toBe(true)
  })

  it('aponta para o servidor Electrum quando CHAIN_BACKEND pede', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.CHAIN_BACKEND = 'electrum'
    process.env.ELECTRUM_URL = 'electrum://127.0.0.1:50001'
    const cfg = loadConfig()
    expect(cfg.backendKind).toBe('electrum')
    expect(cfg.backendUrl).toBe('electrum://127.0.0.1:50001')
  })

  it('assume postura soberana no Electrum, que é infraestrutura do próprio usuário', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.CHAIN_BACKEND = 'electrum'
    delete process.env.PUBLIC_BACKEND
    expect(loadConfig().publicBackend).toBe(false)
  })

  it('lança erro nomeando o valor inválido quando CHAIN_BACKEND é inválido', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.CHAIN_BACKEND = 'nao-existe'
    expect(() => loadConfig()).toThrow('CHAIN_BACKEND inválido: nao-existe')
  })

  it('vigia a cada trinta segundos quando nada é dito', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    delete process.env.WORKER_INTERVAL_MS
    expect(loadConfig().workerIntervalMs).toBe(30_000)
  })

  it('aceita outro intervalo, para quem quer o aviso mais cedo', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.WORKER_INTERVAL_MS = '10000'
    expect(loadConfig().workerIntervalMs).toBe(10_000)
  })

  // Intervalo menor que o ciclo empilha sincronizações da mesma carteira sobre
  // o mesmo log append-only, e quanto mais lento o explorador, mais ciclos se
  // acumulam. O piso não é gosto: é o que impede o watchtower de criar o
  // próprio congestionamento.
  it('recusa intervalo curto demais para caber um ciclo', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.WORKER_INTERVAL_MS = '900'
    expect(() => loadConfig()).toThrow(/WORKER_INTERVAL_MS/)
  })

  it('recusa intervalo que não é número', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.WORKER_INTERVAL_MS = 'depressa'
    expect(() => loadConfig()).toThrow(/WORKER_INTERVAL_MS/)
  })

  it('lança erro nomeando o valor inválido quando NETWORK é inválida', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.NETWORK = 'nao-existe'
    expect(() => loadConfig()).toThrow('NETWORK inválida: nao-existe')
  })

  it('preenche os padrões quando só as variáveis obrigatórias estão definidas', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    delete process.env.PORT
    delete process.env.NETWORK
    delete process.env.ESPLORA_URL
    delete process.env.PUBLIC_BACKEND
    delete process.env.DATABASE_URL

    const config = loadConfig()

    expect(config.port).toBe(3000)
    expect(config.network).toBe('signet')
    expect(config.backendUrl).toBe('https://mempool.space/signet/api')
    expect(config.publicBackend).toBe(true)
  })

  it('PUBLIC_BACKEND=false resulta em publicBackend: false', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.PUBLIC_BACKEND = 'false'

    const config = loadConfig()

    expect(config.publicBackend).toBe(false)
  })
})
