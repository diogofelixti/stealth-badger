import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { open } from '../src/crypto/secretbox'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { deriveAddress } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

async function loggedInApp() {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

const REDE_ORIGINAL = process.env.NETWORK

// O ZPUB acima é de mainnet. Os casos de sucesso só fazem sentido com o
// watchtower configurado para a mesma rede da chave.
beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

afterEach(() => {
  if (REDE_ORIGINAL === undefined) delete process.env.NETWORK
  else process.env.NETWORK = REDE_ORIGINAL
})

describe('POST /api/wallets', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      payload: { label: 'x', key: ZPUB },
    })
    expect(res.statusCode).toBe(401)
  })

  it('cadastra a carteira e guarda o xpub cifrado', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().scriptType).toBe('p2wpkh')
    expect(res.json().syncState).toBe('pending')

    const { rows } = await pool.query<{ xpub_encrypted: Buffer }>(
      'SELECT xpub_encrypted FROM wallets',
    )
    expect(rows[0]!.xpub_encrypted.toString('utf8')).not.toContain('zpub')
    expect(open(rows[0]!.xpub_encrypted, process.env.MASTER_KEY_HEX!)).toContain('pub')
  })

  it('nunca devolve o xpub na resposta da API', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(JSON.stringify(res.json())).not.toContain('pub6')
  })

  it('recusa chave privada estendida com mensagem clara', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: {
        label: 'Perigo',
        key: 'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/watch-only|privada/i)
  })

  // Um backend Esplora atende uma rede só. Aceitar a chave da outra rede
  // gera endereços que o explorador recusa, e a carteira morre em `error`
  // sem dizer o motivo — falha silenciosa, que é o que não pode acontecer.
  it('recusa chave de rede diferente da que o watchtower vigia', async () => {
    const { app, cookie } = await loggedInApp()
    process.env.NETWORK = 'signet'

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    expect(res.statusCode).toBe(400)
    // a mensagem nomeia as duas redes, senão não dá para agir sobre ela
    expect(res.json().error).toMatch(/mainnet/i)
    expect(res.json().error).toMatch(/signet/i)

    const { rows } = await pool.query('SELECT id FROM wallets')
    expect(rows).toHaveLength(0)
  })

  it('lista a carteira com o que a tela precisa mostrar', async () => {
    const { app, cookie } = await loggedInApp()
    await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    const [w] = lista.json()
    expect(w).toMatchObject({
      label: 'Cofre',
      scriptType: 'p2wpkh',
      syncState: 'pending',
      balanceSats: '0',
      utxoCount: 0,
      backendIsPublic: true,
    })
    expect(w.backendUrl).toMatch(/^https?:\/\//)
    expect(JSON.stringify(w)).not.toContain('pub6')
  })

  it('lista apenas as carteiras do próprio usuário', async () => {
    const { app, cookie } = await loggedInApp()
    await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const outro = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: outro.cookies.find(c => c.name === 'sb_session')!.value },
    })
    expect(lista.json()).toEqual([])
  })
})


// tpub de carteira native segwit real. Pela SLIP-132 um tpub significa
// p2pkh, mas Bitcoin Core e Sparrow exportam tpub puro para qualquer tipo
// de script — então o tipo precisa ser descoberto, não assumido.
const TPUB =
  'tpubDCxX2sYFS5bDkSe5GKKYHjBW7tgyN1R3UchpLJvdbf54ohxeGRtd8MbDUe1cguVHe4vnK68DsuD5MXjxi9EXx16rb9EnNsaF5KT99CinaJz'

function adapterQueConhece(enderecos: Set<string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: true,
      host: 'falso',
    }),
    tipHeight: async () => 100,
    blockHashAt: async () => 'hash',
    getHistoryForAddress: async (a: string) =>
      enderecos.has(a) ? [{ txid: 'aa', height: 10, blockHash: 'bb' }] : [],
  }
}

function enderecosSegwitDo(tpub: string): Set<string> {
  const { canonicalXpub } = parseExtendedKey(tpub)
  return new Set(
    Array.from(
      { length: 3 },
      (_, i) => deriveAddress(canonicalXpub, 'p2wpkh', 'testnet', 0, i).address,
    ),
  )
}

describe('POST /api/wallets — tipo de script ambíguo', () => {
  // O defeito relatado: a carteira entrava como p2pkh, derivava endereços
  // legados que nunca existiram, sincronizava até `synced` e mostrava saldo
  // zero. Nenhum erro em lugar nenhum.
  it('descobre native segwit em vez de assumir legado a partir de tpub', async () => {
    process.env.NETWORK = 'signet'
    const app = buildApp({ adapterFactory: () => adapterQueConhece(enderecosSegwitDo(TPUB)) })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'senha-longa-de-teste', language: 'pt' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.co', password: 'senha-longa-de-teste' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: TPUB },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().scriptType).toBe('p2wpkh')
  })

  it('mantém o tipo declarado por zpub sem consultar a cadeia', async () => {
    process.env.NETWORK = 'mainnet'
    let consultou = false
    const app = buildApp({
      adapterFactory: () => {
        consultou = true
        return adapterQueConhece(new Set())
      },
    })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'c@d.co', password: 'senha-longa-de-teste', language: 'pt' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'c@d.co', password: 'senha-longa-de-teste' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    expect(res.json().scriptType).toBe('p2wpkh')
    expect(consultou).toBe(false)
  })

  // Carteira nova não tem histórico em tipo nenhum. Assumir legado aqui é o
  // que criava o problema; native segwit é o padrão de qualquer carteira
  // criada hoje.
  it('sem histórico em nenhum tipo, assume native segwit', async () => {
    process.env.NETWORK = 'signet'
    const app = buildApp({ adapterFactory: () => adapterQueConhece(new Set()) })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'e@f.co', password: 'senha-longa-de-teste', language: 'pt' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'e@f.co', password: 'senha-longa-de-teste' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: TPUB },
    })

    expect(res.json().scriptType).toBe('p2wpkh')
  })
})
