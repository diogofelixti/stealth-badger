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
    expect(config.esploraUrl).toBe('https://mempool.space/signet/api')
    expect(config.publicBackend).toBe(true)
  })

  it('PUBLIC_BACKEND=false resulta em publicBackend: false', () => {
    process.env.MASTER_KEY_HEX = VALID_KEY
    process.env.PUBLIC_BACKEND = 'false'

    const config = loadConfig()

    expect(config.publicBackend).toBe(false)
  })
})
