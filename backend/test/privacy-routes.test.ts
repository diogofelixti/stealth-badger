import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import type { PrivacyScan } from '../src/privacy/scan'
import { aguardarScan } from '../src/privacy/andamento'
import { aguardarOrigens } from '../src/privacy/origem-service'
import { appendEvent } from '../src/events/log'
import { projectWallet } from '../src/events/project'
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

async function comCarteira(
  scanner?: () => Promise<PrivacyScan>,
  txScanner?: () => Promise<{ findings: unknown[]; scannerVersion: string }>,
) {
  const app = buildApp({
    ...(scanner ? { scanner } : {}),
    ...(txScanner ? { txScanner: txScanner as never } : {}),
  })
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

  // A queda de privacidade é a única forma de o watchtower avisar que a
  // carteira piorou sem que nada tenha se movimentado na visão do usuário.
  it('alerta quando a segunda análise vem com score bem menor', async () => {
    let vez = 0
    const piorando = async () => {
      vez += 1
      return { ...RESULTADO, score: vez === 1 ? 88 : 60, grade: vez === 1 ? 'B' : 'D' }
    }
    const { app, cookie, walletId } = await comCarteira(piorando)

    for (const _ of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: `/api/wallets/${walletId}/scan`,
        cookies: { sb_session: cookie },
      })
      await aguardarScan(walletId)
    }

    const alertas = await app.inject({
      method: 'GET',
      url: '/api/alerts',
      cookies: { sb_session: cookie },
    })
    const queda = alertas.json().items.find((a: { type: string }) => a.type === 'score_dropped')
    expect(queda).toBeDefined()
    expect(queda.params).toMatchObject({ from: 88, to: 60, drop: 28 })
    expect(queda.severity).toBe('warning')
  })

  it('não alerta quando a análise repete o mesmo score', async () => {
    const { app, cookie, walletId } = await comCarteira(async () => RESULTADO)
    for (const _ of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: `/api/wallets/${walletId}/scan`,
        cookies: { sb_session: cookie },
      })
      await aguardarScan(walletId)
    }
    const alertas = await app.inject({
      method: 'GET',
      url: '/api/alerts',
      cookies: { sb_session: cookie },
    })
    expect(
      alertas.json().items.filter((a: { type: string }) => a.type === 'score_dropped'),
    ).toHaveLength(0)
  })
})

describe('kyc_origin — origem dos fundos', () => {
  const TXID = 'cd'.repeat(32)

  const achadoDeCorretora = {
    id: 'entity-behavior-exchange',
    severity: 'low',
    confidence: 'medium',
    title: 'Exchange batch withdrawal pattern detected',
    description: 'd',
    recommendation: 'r',
    scoreImpact: 0,
    params: {},
  }

  async function comFundos(txScanner: () => Promise<{ findings: unknown[]; scannerVersion: string }>) {
    const montado = await comCarteira(async () => RESULTADO, txScanner)
    const a = await pool.query<{ id: string }>(
      `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
       VALUES ($1,0,0,'0/0','bc1qexemplo','ff') RETURNING id`,
      [montado.walletId],
    )
    await appendEvent({
      walletId: montado.walletId,
      type: 'utxo_created',
      height: 100,
      blockHash: 'bb',
      txid: TXID,
      vout: 0,
      payload: { addressId: Number(a.rows[0]!.id), valueSats: 500000 },
    })
    await projectWallet(montado.walletId)
    return montado
  }

  it('alerta quando a transação que trouxe fundos parece vir de corretora', async () => {
    const { app, cookie, walletId } = await comFundos(async () => ({
      findings: [achadoDeCorretora],
      scannerVersion: '0.34.2',
    }))

    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)
    await aguardarOrigens(walletId)

    const alertas = await app.inject({
      method: 'GET',
      url: '/api/alerts',
      cookies: { sb_session: cookie },
    })
    const origem = alertas.json().items.find((a: { type: string }) => a.type === 'kyc_origin')
    expect(origem).toBeDefined()
    expect(origem.params).toMatchObject({
      kind: '@entity.exchange',
      basis: '@basis.behavior',
    })
  })

  it('não alerta quando a transação não aponta origem nenhuma', async () => {
    const { app, cookie, walletId } = await comFundos(async () => ({
      findings: [],
      scannerVersion: '0.34.2',
    }))
    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)
    await aguardarOrigens(walletId)

    const alertas = await app.inject({
      method: 'GET',
      url: '/api/alerts',
      cookies: { sb_session: cookie },
    })
    expect(
      alertas.json().items.filter((a: { type: string }) => a.type === 'kyc_origin'),
    ).toHaveLength(0)
  })

  // Cada `scan tx` custa segundos contra a cadeia. Reanalisar a mesma
  // transação a cada clique gastaria o explorador do usuário à toa e
  // repetiria o mesmo aviso.
  it('não reanalisa transação que já foi analisada', async () => {
    let chamadas = 0
    const { app, cookie, walletId } = await comFundos(async () => {
      chamadas += 1
      return { findings: [achadoDeCorretora], scannerVersion: '0.34.2' }
    })

    for (const _ of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: `/api/wallets/${walletId}/scan`,
        cookies: { sb_session: cookie },
      })
      await aguardarScan(walletId)
    await aguardarOrigens(walletId)
    }
    expect(chamadas).toBe(1)
  })

  // Uma carteira com trinta depósitos gastaria minutos analisando tudo no
  // primeiro clique. O teto faz a primeira análise terminar, e as seguintes
  // avançam a fila.
  it('respeita um teto de transações analisadas por vez', async () => {
    let chamadas = 0
    const { app, cookie, walletId } = await comFundos(async () => {
      chamadas += 1
      return { findings: [], scannerVersion: '0.34.2' }
    })

    const enderecos = await pool.query<{ id: string }>(
      'SELECT id FROM addresses WHERE wallet_id = $1',
      [walletId],
    )
    for (let i = 0; i < 12; i += 1) {
      await appendEvent({
        walletId,
        type: 'utxo_created',
        height: 100 + i,
        blockHash: 'bb',
        txid: String(i).padStart(2, '0').repeat(32),
        vout: 0,
        payload: { addressId: Number(enderecos.rows[0]!.id), valueSats: 1000 },
      })
    }
    await projectWallet(walletId)

    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)
    await aguardarOrigens(walletId)
    expect(chamadas).toBeLessThanOrEqual(5)
    expect(chamadas).toBeGreaterThan(0)
  })

  // Três transações da carteira real retornam 404 no explorador: foram vistas
  // no mempool e substituídas depois. Elas falham para sempre. Se falhar não
  // contar como tentativa, essas três consomem o teto a cada clique e as
  // outras trinta nunca chegam a ser analisadas.
  it('não deixa transação que falha bloquear a fila das outras', async () => {
    const tentadas: string[] = []
    const { app, cookie, walletId } = await comCarteira(async () => RESULTADO, (async (ctx: {
      txid: string
    }) => {
      tentadas.push(ctx.txid)
      throw new Error('Not found')
    }) as never)

    const a = await pool.query<{ id: string }>(
      `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
       VALUES ($1,0,0,'0/0','bc1qexemplo','ff') RETURNING id`,
      [walletId],
    )
    for (let i = 0; i < 7; i += 1) {
      await appendEvent({
        walletId,
        type: 'utxo_created',
        height: 100 + i,
        blockHash: 'bb',
        txid: String(i).padStart(2, '0').repeat(32),
        vout: 0,
        payload: { addressId: Number(a.rows[0]!.id), valueSats: 1000 },
      })
    }
    await projectWallet(walletId)

    for (const _ of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: `/api/wallets/${walletId}/scan`,
        cookies: { sb_session: cookie },
      })
      await aguardarScan(walletId)
    await aguardarOrigens(walletId)
    }

    // sete transações, teto de cinco por vez: a segunda rodada tem de alcançar
    // as que ainda não foram tentadas
    expect(new Set(tentadas).size).toBe(7)
  })
})

describe('análise de privacidade de endereço avulso', () => {
  const ENDERECO = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

  // Um endereço avulso não tem chave para abrir. A rota tentava abri-la assim
  // mesmo e morria em "Cannot read properties of null" — o botão de analisar
  // aparecia na tela e não funcionava.
  it('analisa o endereço em vez de tentar abrir uma chave que não existe', async () => {
    let pedido: { address?: string } | null = null
    const app = buildApp({
      addressScanner: (async (ctx: { address: string }) => {
        pedido = ctx
        return { ...RESULTADO, score: 96, grade: 'A+' }
      }) as never,
    })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'avulso@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'avulso@exemplo.com', password: 'senha-bem-comprida' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
    const criada = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Doações', address: ENDERECO },
    })
    const walletId = Number(criada.json().id)

    await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    await aguardarScan(walletId)

    expect(pedido!.address).toBe(ENDERECO)

    const res = await app.inject({
      method: 'GET',
      url: `/api/wallets/${walletId}/privacy`,
      cookies: { sb_session: cookie },
    })
    expect(res.json().error).toBeNull()
    expect(res.json().latest).toMatchObject({ score: 96, grade: 'A+' })
  })
})
