import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { seal } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { tick } from '../src/worker/tick'
import { deriveAddress } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const KEY = 'd'.repeat(64)

let firstAddress: string

function adapterWithDust(): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => 200,
    blockHashAt: async (h: number) => 'h' + h,
    getHistoryForAddress: async (a: string) =>
      a === firstAddress ? [{ txid: 'aa', height: 200, blockHash: 'h200' }] : [],
    getUtxosForAddress: async (a: string) =>
      a === firstAddress ? [{ txid: 'aa', vout: 0, value: 600, height: 200 }] : [],
  }
}

beforeEach(async () => {
  await resetDb()
  process.env.MASTER_KEY_HEX = KEY
  const parsed = parseExtendedKey(ZPUB)
  firstAddress = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','mainnet') RETURNING id`,
  )
  await pool.query(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','mainnet',3,$3)`,
    [u.rows[0]!.id, seal(parsed.canonicalXpub, KEY), b.rows[0]!.id],
  )
})

describe('tick', () => {
  it('sincroniza a carteira e cria alertas a partir dos eventos novos', async () => {
    const r = await tick({ adapterFactory: () => adapterWithDust() })
    expect(r.walletsSynced).toBe(1)
    expect(r.alertsCreated).toBeGreaterThan(0)
  })

  it('classifica 600 sats como dust, com severidade crítica', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ type: string; severity: string }>(
      'SELECT type, severity FROM alerts',
    )
    const dust = rows.find(r => r.type === 'dust_received')
    expect(dust?.severity).toBe('critical')
  })

  it('grava parâmetros, e nenhum texto renderizado, no alerta', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ params: Record<string, unknown> }>(
      `SELECT params FROM alerts WHERE type = 'dust_received'`,
    )
    expect(rows[0]!.params).toMatchObject({ value: 600, threshold: 1000 })
    expect(rows[0]!.params.address).toBeTruthy()
  })

  it('o mesmo alerta rende frases diferentes em pt e en', async () => {
    const { renderAlert } = await import('../src/i18n/render')
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ type: string; params: Record<string, unknown> }>(
      `SELECT type, params FROM alerts WHERE type = 'dust_received'`,
    )
    const pt = renderAlert(rows[0]!.type, rows[0]!.params, 'pt')
    const en = renderAlert(rows[0]!.type, rows[0]!.params, 'en')
    expect(pt.body).not.toBe(en.body)
    expect(pt.body).not.toContain('{')
    expect(en.body).not.toContain('{')
  })

  it('rodar duas vezes não duplica alerta — a chave de dedup segura', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const primeira = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    await tick({ adapterFactory: () => adapterWithDust() })
    const segunda = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    expect(segunda.rows[0]!.count).toBe(primeira.rows[0]!.count)
  })

  it('fecha o adapter ao fim do ciclo, mesmo quando a sincronização falha', async () => {
    // O ciclo monta um adapter por carteira. Se não o fechar, o Electrum
    // acumula um socket a cada 30 segundos até esgotar os descritores — e o
    // ciclo que falha é justamente o que mais se repete.
    let fechados = 0
    const quebrado: ChainAdapter = {
      ...adapterWithDust(),
      tipHeight: async () => {
        throw new Error('servidor fora do ar')
      },
      close: () => {
        fechados += 1
      },
    }
    await tick({ adapterFactory: () => quebrado })
    expect(fechados).toBe(1)
  })

  it('fecha o adapter depois de um ciclo bem-sucedido', async () => {
    let fechados = 0
    const adapter: ChainAdapter = { ...adapterWithDust(), close: () => { fechados += 1 } }
    await tick({ adapterFactory: () => adapter })
    expect(fechados).toBe(1)
  })
})
