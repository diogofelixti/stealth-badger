import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import type { PrivacyScan } from '../src/privacy/scan'
import { aguardarScan } from '../src/privacy/andamento'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const RESULTADO: PrivacyScan = {
  score: 66,
  grade: 'C',
  walletInfo: {
    activeAddresses: 31,
    totalTxs: 30,
    totalUtxos: 32,
    totalBalance: 7552468,
    reusedAddresses: 2,
    dustUtxos: 1,
  },
  findings: [
    {
      id: 'wallet-address-reuse',
      severity: 'medium',
      confidence: 'deterministic',
      title: '2 of 31 addresses reused',
      description: 'x',
      recommendation: 'y',
      scoreImpact: -5,
      params: {},
    },
  ],
  scannerVersion: '0.34.2',
}

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function comCarteira(scanner?: () => Promise<PrivacyScan>) {
  const app = buildApp(scanner ? { scanner } : {})
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
  const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
  const criada = await app.inject({
    method: 'POST',
    url: '/api/wallets',
    cookies: { sb_session: cookie },
    payload: { label: 'Cofre', key: ZPUB },
  })
  return { app, cookie, walletId: Number(criada.json().id) }
}

describe('POST /api/wallets/:id/scan', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/wallets/1/scan' })
    expect(res.statusCode).toBe(401)
  })

  it('recusa analisar carteira de outra pessoa', async () => {
    const dono = await comCarteira()
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${dono.walletId}/scan`,
      cookies: { sb_session: login.cookies.find(c => c.name === 'sb_session')!.value },
    })
    expect(res.statusCode).toBe(404)
  })

  // A análise leva mais de um minuto contra a cadeia real. Segurar a conexão
  // aberta esse tempo todo entrega a decisão a um timeout de proxy — e o
  // usuário vê "erro" numa análise que estava indo bem.
  it('responde na hora e analisa em segundo plano', async () => {
    const { app, cookie, walletId } = await comCarteira(async () => RESULTADO)
    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toMatchObject({ status: 'running' })
  })

  it('guarda o resultado quando a análise termina', async () => {
    const { app, cookie, walletId } = await comCarteira(async () => RESULTADO)
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/privacy`,
      cookies: { sb_session: cookie },
    })
    expect(res.json().latest).toMatchObject({ score: 66, grade: 'C' })
  })

  it('não dispara uma segunda análise enquanto a primeira corre', async () => {
    let chamadas = 0
    const lento = async () => {
      chamadas += 1
      await new Promise(pronto => setTimeout(pronto, 60))
      return RESULTADO
    }
    const { app, cookie, walletId } = await comCarteira(lento)
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)
    expect(chamadas).toBe(1)
  })

  it('registra a falha sem derrubar o processo quando o scanner quebra', async () => {
    const quebrado = async () => {
      throw new Error('am-i-exposed não instalado')
    }
    const { app, cookie, walletId } = await comCarteira(quebrado)
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/privacy`,
      cookies: { sb_session: cookie },
    })
    expect(res.json().latest).toBeNull()
    expect(res.json().error).toMatch(/não instalado/)
  })
})

describe('GET /api/wallets com privacidade', () => {
  it('não anuncia score de carteira que nunca foi analisada', async () => {
    const { app, cookie } = await comCarteira()
    const res = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(res.json()[0].privacyScore).toBeNull()
  })

  it('mostra o score da última análise no cartão da carteira', async () => {
    const { app, cookie, walletId } = await comCarteira(async () => RESULTADO)
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)

    const res = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(res.json()[0]).toMatchObject({ privacyScore: 66, privacyGrade: 'C' })
  })

  it('avisa na listagem que a análise está correndo, para a tela não adivinhar', async () => {
    const lento = async () => {
      await new Promise(pronto => setTimeout(pronto, 80))
      return RESULTADO
    }
    const { app, cookie, walletId } = await comCarteira(lento)
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })

    const durante = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(durante.json()[0].privacyScanning).toBe(true)

    await aguardarScan(walletId)
    const depois = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(depois.json()[0].privacyScanning).toBe(false)
  })
})
