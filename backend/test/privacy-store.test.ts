import { beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db/pool'
import { historicoDeScans, salvarScan, ultimoScan } from '../src/privacy/store'
import type { PrivacyScan } from '../src/privacy/scan'
import { resetDb } from './helpers/db'

let walletId: number

const scan = (score: number, grade = 'C'): PrivacyScan => ({
  score,
  grade,
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
      params: { reusedCount: 2 },
    },
  ],
  scannerVersion: '0.34.2',
})

beforeEach(async () => {
  await resetDb()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`,
  )
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C','\\x00','aabb','p2wpkh','signet',20,$2) RETURNING id`,
    [u.rows[0]!.id, b.rows[0]!.id],
  )
  walletId = Number(w.rows[0]!.id)
})

describe('privacy_scans', () => {
  it('não inventa score para carteira que nunca foi analisada', async () => {
    expect(await ultimoScan(walletId)).toBeNull()
  })

  it('guarda e devolve a análise mais recente', async () => {
    await salvarScan(walletId, scan(66))
    const salvo = await ultimoScan(walletId)
    expect(salvo).toMatchObject({ score: 66, grade: 'C' })
    expect(salvo!.findings[0]!.id).toBe('wallet-address-reuse')
  })

  it('guarda recomendação estruturada sem achatar para texto', async () => {
    await salvarScan(walletId, {
      ...scan(10),
      findings: [
        {
          id: 'address-reuse-critical',
          severity: 'critical',
          confidence: 'deterministic',
          title: 'Address reused',
          description: 'x',
          recommendation: {
            urgency: 'immediate',
            headline: 'Stop receiving on this address',
            text: 'Use fresh addresses from now on.',
            tools: [{ name: 'Guide', url: 'https://am-i.exposed/docs/address-reuse' }],
          },
          scoreImpact: -90,
          params: { txCount: 97 },
        },
      ],
    })

    expect((await ultimoScan(walletId))!.findings[0]!.recommendation).toMatchObject({
      urgency: 'immediate',
      headline: 'Stop receiving on this address',
      tools: [{ name: 'Guide' }],
    })
  })

  // O eixo do tempo é o que este projeto acrescenta ao scanner original.
  // Sobrescrever o anterior apagaria a história que importa: o score caiu.
  it('acumula as análises em vez de sobrescrever a anterior', async () => {
    await salvarScan(walletId, scan(80, 'B'))
    await salvarScan(walletId, scan(66, 'C'))

    const historico = await historicoDeScans(walletId)
    expect(historico).toHaveLength(2)
    expect(historico.map(h => h.score)).toEqual([80, 66])
    expect((await ultimoScan(walletId))!.score).toBe(66)
  })
})
