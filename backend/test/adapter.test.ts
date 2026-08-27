import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/chain/adapter'
import { credenciaisDoBackend } from '../src/chain/adapter'
import { seal } from '../src/crypto/secretbox'

const base = { isPublic: false, network: 'signet' as const }

describe('createAdapter', () => {
  it('monta o adapter Esplora para um backend esplora', () => {
    const a = createAdapter({ ...base, kind: 'esplora', url: 'https://exemplo/api' })
    expect(a.capabilities()).toMatchObject({ supportsSubscribe: false, host: 'exemplo' })
  })

  it('monta o adapter Electrum a partir de electrum://host:porta', () => {
    const a = createAdapter({ ...base, kind: 'electrum', url: 'electrum://no.local:50002' })
    expect(a.capabilities()).toMatchObject({
      supportsSubscribe: true,
      host: 'no.local:50002',
    })
  })

  it('assume a porta padrão do Electrum quando a URL não a traz', () => {
    const a = createAdapter({ ...base, kind: 'electrum', url: 'electrum://no.local' })
    expect(a.capabilities().host).toBe('no.local:50001')
  })

  it('preserva a postura declarada pelo backend', () => {
    const a = createAdapter({
      kind: 'esplora',
      url: 'https://mempool.space/signet/api',
      isPublic: true,
      network: 'signet',
    })
    expect(a.capabilities().isPublic).toBe(true)
  })

  it('recusa um tipo de backend que não sabe montar, nomeando-o', () => {
    expect(() => createAdapter({ ...base, kind: 'pombo-correio', url: 'http://x' })).toThrow(
      /pombo-correio/,
    )
  })

  // O terceiro modelo: um nó que você mesmo roda, falado por RPC. Ele não
  // responde consulta por endereço, e é por isso que o motor precisa saber
  // disso pela capacidade declarada, e não por tentativa e erro.
  it('monta o adapter de Bitcoin Core para um backend core', () => {
    const a = createAdapter({
      kind: 'core',
      url: 'http://127.0.0.1:38332',
      isPublic: false,
      network: 'signet',
      walletId: 7,
    })
    expect(a.capabilities()).toMatchObject({
      randomAccess: false,
      needsRegistration: true,
      isPublic: false,
    })
  })

  // Duas carteiras do watchtower no mesmo nó não podem compartilhar a carteira
  // de observação: `listunspent` devolveria a união das duas, e os UTXOs de
  // uma apareceriam como saldo da outra.
  it('dá a cada carteira a sua própria carteira de observação no nó', () => {
    const a = createAdapter({
      kind: 'core', url: 'http://127.0.0.1:38332', isPublic: false,
      network: 'signet', walletId: 7,
    })
    const b = createAdapter({
      kind: 'core', url: 'http://127.0.0.1:38332', isPublic: false,
      network: 'signet', walletId: 8,
    })
    expect(a.capabilities().host).not.toBe(b.capabilities().host)
  })

  it('recusa montar Core sem saber de que carteira se trata', () => {
    expect(() =>
      createAdapter({
        kind: 'core', url: 'http://127.0.0.1:38332', isPublic: false, network: 'signet',
      }),
    ).toThrow(/carteira/i)
  })
})

describe('credenciais do RPC', () => {
  const KEY = 'd'.repeat(64)

  // A credencial vive na linha do backend, cifrada. O `.env` continua servindo
  // ao backend global da instância, que é cadastrado antes de existir usuário
  // para guardar credencial nenhuma.
  it('usa o usuário e a senha guardados na linha do backend', () => {
    process.env.MASTER_KEY_HEX = KEY
    const cifrada = seal(JSON.stringify({ user: 'badger', password: 'senha-do-rpc' }), KEY)

    expect(
      credenciaisDoBackend({
        kind: 'core',
        url: 'http://127.0.0.1:38332',
        isPublic: false,
        network: 'signet',
        walletId: 7,
        credentialsEncrypted: cifrada,
      }),
    ).toEqual({ user: 'badger', password: 'senha-do-rpc' })
  })

  it('usa o caminho do cookie guardado na linha', () => {
    process.env.MASTER_KEY_HEX = KEY
    const cifrada = seal(JSON.stringify({ cookiePath: '/mnt/no/.cookie' }), KEY)

    expect(
      credenciaisDoBackend({
        kind: 'core',
        url: 'http://127.0.0.1:38332',
        isPublic: false,
        network: 'signet',
        walletId: 7,
        credentialsEncrypted: cifrada,
      }),
    ).toEqual({ cookiePath: '/mnt/no/.cookie' })
  })

  it('cai no cookie do ambiente quando a linha não guarda credencial', () => {
    process.env.MASTER_KEY_HEX = KEY
    process.env.CORE_COOKIE_PATH = '/do/ambiente/.cookie'

    expect(
      credenciaisDoBackend({
        kind: 'core',
        url: 'http://127.0.0.1:38332',
        isPublic: false,
        network: 'signet',
        walletId: 7,
      }),
    ).toEqual({ cookiePath: '/do/ambiente/.cookie' })
  })
})
