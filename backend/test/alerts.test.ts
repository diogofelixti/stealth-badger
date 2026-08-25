import { beforeEach, describe, expect, it } from 'vitest'
import { confirmationState, dedupeKey } from '../src/alerts/dedupe'
import { alertsForEvent } from '../src/alerts/rules'
import { saveAlert } from '../src/alerts/store'
import { pool } from '../src/db/pool'
import type { StoredEvent } from '../src/events/log'
import { renderAlert } from '../src/i18n/render'
import { resetDb } from './helpers/db'

describe('confirmationState', () => {
  it('sem altura é mempool', () => expect(confirmationState(null, 200)).toBe('mempool'))
  it('uma confirmação', () => expect(confirmationState(200, 200)).toBe('conf1'))
  it('cinco confirmações ainda é conf1', () => expect(confirmationState(196, 200)).toBe('conf1'))
  it('seis confirmações vira conf6', () => expect(confirmationState(195, 200)).toBe('conf6'))
})

describe('dedupeKey', () => {
  it('é determinística', () => {
    expect(dedupeKey(1, 'aa', 'conf1')).toBe(dedupeKey(1, 'aa', 'conf1'))
  })

  it('separa por carteira, transação e estado', () => {
    const keys = new Set([
      dedupeKey(1, 'aa', 'conf1'),
      dedupeKey(2, 'aa', 'conf1'),
      dedupeKey(1, 'bb', 'conf1'),
      dedupeKey(1, 'aa', 'mempool'),
    ])
    expect(keys.size).toBe(4)
  })
})

describe('alertsForEvent', () => {
  const base: StoredEvent = {
    id: 1,
    walletId: 7,
    type: 'utxo_created',
    height: 200,
    blockHash: 'h',
    txid: 'aa',
    vout: 0,
    payload: { addressId: 1, valueSats: 50_000 },
    occurredAt: new Date(),
  }
  const ctx = {
    userId: 3,
    tipHeight: 200,
    dustThreshold: 1000,
    addressWasUsed: false,
    address: 'tb1qexemplo',
  }

  it('gera alerta informativo ao receber fundos', () => {
    const [a] = alertsForEvent(base, ctx)
    expect(a!.type).toBe('funds_received')
    expect(a!.severity).toBe('info')
  })

  it('não carrega texto pronto — só tipo e parâmetros', () => {
    const [a] = alertsForEvent(base, ctx)
    expect(a).not.toHaveProperty('title')
    expect(a).not.toHaveProperty('body')
    expect(a!.params).toMatchObject({ value: 50_000 })
  })

  it('os parâmetros rendem frase nos dois idiomas', () => {
    const [a] = alertsForEvent(base, ctx)
    const pt = renderAlert(a!.type, a!.params, 'pt')
    const en = renderAlert(a!.type, a!.params, 'en')
    expect(pt.title).toBe('Fundos recebidos')
    expect(en.title).toBe('Funds received')
    expect(pt.body).not.toContain('{')
    expect(en.body).not.toContain('{')
  })

  it('classifica recebimento pequeno como dust, com severidade crítica', () => {
    const dust: StoredEvent = { ...base, payload: { addressId: 1, valueSats: 600 } }
    const achado = alertsForEvent(dust, ctx).find(a => a.type === 'dust_received')
    expect(achado).toBeDefined()
    expect(achado!.severity).toBe('critical')
    expect(achado!.params).toMatchObject({ value: 600, threshold: 1000 })
  })

  it('alerta address reuse com severidade de atenção, não de crítico', () => {
    const kinds = alertsForEvent(base, { ...ctx, addressWasUsed: true })
    expect(kinds.map(a => a.type)).toContain('address_reused')

    // Crítico é reservado à poeira plantada, que exige não gastar o UTXO.
    // Dois críticos diluem o crítico, e o alerta que não pode passar batido
    // deixa de se distinguir dos demais.
    const reuso = kinds.find(a => a.type === 'address_reused')
    expect(reuso!.severity).toBe('warning')
  })

  it('gera alerta de aviso ao detectar reorg', () => {
    const reorg: StoredEvent = { ...base, type: 'reorg_detected', txid: null, vout: null }
    const [a] = alertsForEvent(reorg, ctx)
    expect(a!.type).toBe('reorg_detected')
    expect(a!.severity).toBe('warning')
    expect(a!.params).toMatchObject({ height: 200 })
  })
})

describe('saveAlert', () => {
  let userId: number
  let walletId: number

  beforeEach(async () => {
    await resetDb()
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
    )
    userId = Number(u.rows[0]!.id)
    const b = await pool.query<{ id: string }>(
      `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`,
    )
    const w = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
       VALUES ($1,'C',$2,'aabb','p2wpkh','signet',$3) RETURNING id`,
      [userId, Buffer.from([0]), b.rows[0]!.id],
    )
    walletId = Number(w.rows[0]!.id)
  })

  const candidate = (key: string) => ({
    userId,
    walletId,
    type: 'funds_received',
    severity: 'info' as const,
    params: { value: 50_000, state: '@state.conf1' },
    dedupeKey: key,
    eventId: null,
  })

  it('grava o alerta e devolve o id', async () => {
    expect(await saveAlert(candidate('k1'))).toBeGreaterThan(0)
  })

  it('devolve null na segunda vez com a mesma chave', async () => {
    await saveAlert(candidate('k1'))
    expect(await saveAlert(candidate('k1'))).toBeNull()
  })

  it('grava apenas uma linha após cinco tentativas idênticas', async () => {
    for (let i = 0; i < 5; i += 1) await saveAlert(candidate('k1'))
    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    expect(Number(rows[0]!.count)).toBe(1)
  })

  it('guarda os parâmetros como JSONB, e nenhum texto renderizado', async () => {
    await saveAlert(candidate('k1'))
    const { rows } = await pool.query<{ params: Record<string, unknown> }>('SELECT params FROM alerts')
    expect(rows[0]!.params).toMatchObject({ value: 50_000, state: '@state.conf1' })
  })
})
