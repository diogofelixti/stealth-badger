import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { confirmationState, dedupeKey } from '../src/alerts/dedupe'
import { alertsForEvent, alertsForOrigin, alertsForScan } from '../src/alerts/rules'
import { listarAlertas, saveAlert } from '../src/alerts/store'
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

describe('alertsForScan — queda de privacy score', () => {
  const ctx = { userId: 7, walletId: 3, scanId: 42, dropThreshold: 5 }
  const atual = { id: 42, score: 60, grade: 'D' }

  it('não alerta na primeira análise, que não tem com o que comparar', () => {
    expect(alertsForScan(null, atual, ctx)).toEqual([])
  })

  it('não alerta quando o score sobe', () => {
    expect(alertsForScan({ score: 50, grade: 'D' }, { ...atual, score: 70 }, ctx)).toEqual([])
  })

  // O scanner reavalia a carteira inteira a cada execução, e um ponto de
  // diferença é ruído de heurística. Alertar sobre isso ensinaria o usuário a
  // ignorar o alerta, que é o pior resultado possível.
  it('não alerta por variação menor que o limiar', () => {
    expect(alertsForScan({ score: 63, grade: 'C' }, atual, ctx)).toEqual([])
  })

  it('alerta quando a queda passa do limiar, dizendo de quanto para quanto', () => {
    const [alerta] = alertsForScan({ score: 80, grade: 'B' }, atual, ctx)
    expect(alerta).toMatchObject({
      type: 'score_dropped',
      severity: 'warning',
      userId: 7,
      walletId: 3,
    })
    expect(alerta!.params).toMatchObject({ from: 80, to: 60, drop: 20, grade: 'D' })
  })

  // Uma análise gera no máximo um alerta de queda. Sem isso, reanalisar a
  // mesma carteira repetiria o aviso a cada clique.
  it('amarra a deduplicação à análise, e não ao par de scores', () => {
    const [a] = alertsForScan({ score: 80, grade: 'B' }, atual, ctx)
    const [b] = alertsForScan({ score: 80, grade: 'B' }, atual, ctx)
    expect(a!.dedupeKey).toBe(b!.dedupeKey)
    expect(a!.dedupeKey).toContain('42')
  })

  it('não amarra o alerta a evento de cadeia, porque não nasceu de um', () => {
    const [a] = alertsForScan({ score: 80, grade: 'B' }, atual, ctx)
    expect(a!.eventId).toBeNull()
  })
})

describe('alertsForOrigin — origem dos fundos', () => {
  const ctx = { userId: 7, walletId: 3, eventId: 99, txid: 'ab'.repeat(32) }

  it('não alerta quando a transação não aponta origem nenhuma', () => {
    expect(alertsForOrigin([], ctx)).toEqual([])
  })

  it('alerta dizendo a espécie e em que o scanner se baseou', () => {
    const [a] = alertsForOrigin(
      [{ kind: 'exchange', basis: 'behavior', confidence: 'medium', findingId: 'x' }],
      ctx,
    )
    expect(a).toMatchObject({ type: 'kyc_origin', severity: 'warning', walletId: 3 })
    expect(a!.params).toMatchObject({
      kind: '@entity.exchange',
      basis: '@basis.behavior',
      confidence: '@confidence.medium',
    })
  })

  // Diferente da queda de score, esta origem é sobre uma transação concreta
  // que entrou na carteira: amarrar ao evento é o que permite a tela ligar o
  // aviso ao UTXO que chegou.
  it('amarra o alerta ao evento de cadeia que trouxe os fundos', () => {
    const [a] = alertsForOrigin(
      [{ kind: 'exchange', basis: 'behavior', confidence: 'medium', findingId: 'x' }],
      ctx,
    )
    expect(a!.eventId).toBe(99)
  })

  it('gera um alerta por espécie quando a transação aponta mais de uma', () => {
    const alertas = alertsForOrigin(
      [
        { kind: 'exchange', basis: 'behavior', confidence: 'medium', findingId: 'x' },
        { kind: 'ofac', basis: 'database', confidence: 'high', findingId: 'y' },
      ],
      ctx,
    )
    expect(alertas).toHaveLength(2)
    expect(alertas.map(a => a.params.kind)).toEqual(['@entity.exchange', '@entity.ofac'])
  })

  it('deduplica por transação e espécie, para reanalisar não repetir o aviso', () => {
    const origem = {
      kind: 'exchange' as const,
      basis: 'behavior' as const,
      confidence: 'medium',
      findingId: 'x',
    }
    const [a] = alertsForOrigin([origem], ctx)
    const [b] = alertsForOrigin([origem], ctx)
    expect(a!.dedupeKey).toBe(b!.dedupeKey)
    expect(a!.dedupeKey).toContain('exchange')
    expect(a!.dedupeKey).toContain(ctx.txid)
  })
})

describe('paginação do feed por cursor', () => {
  let userId: number
  let walletId: number

  async function alerta(quando: string, tipo = 'funds_received'): Promise<number> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, created_at)
       VALUES ($1,$2,$3,'info','{}'::jsonb,$4,$5) RETURNING id`,
      [userId, walletId, tipo, 'chave-' + Math.random(), quando],
    )
    return Number(rows[0]!.id)
  }

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

  it('duas páginas de dois em cinco alertas devolvem os cinco, sem repetir nem pular', async () => {
    for (let i = 0; i < 5; i += 1) {
      await alerta(`2026-08-27T10:0${i}:00Z`)
    }

    const vistos: number[] = []
    let cursor: string | null = null
    for (let pagina = 0; pagina < 3; pagina += 1) {
      const p = await listarAlertas(userId, { limit: 2, ...(cursor ? { cursor } : {}) })
      vistos.push(...p.items.map(a => Number(a['id'])))
      cursor = p.nextCursor
    }

    expect(vistos).toHaveLength(5)
    expect(new Set(vistos).size).toBe(5)
  })

  // A falha silenciosa deste item: com OFFSET, o alerta que chega pelo topo
  // entre uma página e a seguinte empurra a janela, e o leitor vê o mesmo
  // alerta duas vezes — ou pula um e nunca fica sabendo.
  it('alerta novo entre uma página e a outra não desloca a segunda', async () => {
    const antigos: number[] = []
    for (let i = 0; i < 4; i += 1) antigos.push(await alerta(`2026-08-27T10:0${i}:00Z`))

    const primeira = await listarAlertas(userId, { limit: 2 })
    const novo = await alerta('2026-08-27T23:59:00Z')
    const segunda = await listarAlertas(userId, {
      limit: 2,
      cursor: primeira.nextCursor!,
    })

    const ids = [...primeira.items, ...segunda.items].map(a => Number(a['id']))
    // as duas páginas trazem os quatro que existiam, na ordem, e o que chegou
    // por cima depois da primeira página não aparece nem desloca ninguém
    expect(ids).toEqual([antigos[3], antigos[2], antigos[1], antigos[0]])
    expect(ids).not.toContain(novo)
  })

  // O worker grava vários alertas no mesmo ciclo, e portanto no mesmo instante:
  // sem o id desempatando, a paginação trava num laço na mesma página.
  it('alertas do mesmo instante paginam sem laço', async () => {
    const mesmo = '2026-08-27T12:00:00Z'
    for (let i = 0; i < 4; i += 1) await alerta(mesmo)

    const vistos: number[] = []
    let cursor: string | null = null
    for (let pagina = 0; pagina < 3; pagina += 1) {
      const p = await listarAlertas(userId, { limit: 2, ...(cursor ? { cursor } : {}) })
      vistos.push(...p.items.map(a => Number(a['id'])))
      cursor = p.nextCursor
      if (!cursor) break
    }

    expect(new Set(vistos).size).toBe(4)
  })

  it('limite acima do teto é limitado, e não recusado', async () => {
    for (let i = 0; i < 3; i += 1) await alerta(`2026-08-27T10:0${i}:00Z`)

    const p = await listarAlertas(userId, { limit: 5000 })

    expect(p.items).toHaveLength(3)
  })

  it('filtra por tipo sem perder a paginação', async () => {
    await alerta('2026-08-27T10:00:00Z', 'funds_received')
    await alerta('2026-08-27T10:01:00Z', 'address_reused')
    await alerta('2026-08-27T10:02:00Z', 'address_reused')

    const p = await listarAlertas(userId, { limit: 10, type: 'address_reused' })

    expect(p.items).toHaveLength(2)
    expect(p.items.every(a => a['type'] === 'address_reused')).toBe(true)
  })
})

describe('GET /api/alerts/:id — o detalhe', () => {
  beforeEach(async () => {
    await resetDb()
  })

  async function cenario(): Promise<{
    app: ReturnType<typeof buildApp>
    cookie: string
    alertaId: number
    txidInteiro: string
    walletId: number
  }> {
    process.env.NETWORK = 'signet'
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'detalhe@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'detalhe@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
    const { rows: u } = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email = 'detalhe@exemplo.com'",
    )
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`,
    )
    const { rows: w } = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id,sync_height)
       VALUES ($1,'Cofre',$2,'aabb','p2wpkh','signet',$3,200) RETURNING id`,
      [u[0]!.id, Buffer.from([0]), b[0]!.id],
    )
    const walletId = Number(w[0]!.id)
    const txidInteiro = 'ab'.repeat(32)
    const { rows: e } = await pool.query<{ id: string }>(
      `INSERT INTO chain_events (wallet_id, type, height, block_hash, txid, vout, payload)
       VALUES ($1,'utxo_created',195,'000000abc',$2,3,'{"value":51000}'::jsonb) RETURNING id`,
      [walletId, txidInteiro],
    )
    const { rows: a } = await pool.query<{ id: string }>(
      `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, event_id)
       VALUES ($1,$2,'funds_received','info',$3,'k1',$4) RETURNING id`,
      [
        u[0]!.id,
        walletId,
        JSON.stringify({ value: 51000, txid: txidInteiro.slice(0, 12) + '...' }),
        e[0]!.id,
      ],
    )
    return { app, cookie, alertaId: Number(a[0]!.id), txidInteiro, walletId }
  }

  // Os params do alerta guardam o txid truncado — texto para caber na frase,
  // não identificador. O detalhe sai do join com `chain_events`, e este teste
  // é o que prova que ninguém tentou remendar a string.
  it('traz o txid inteiro, e não o truncado da frase', async () => {
    const { app, cookie, alertaId, txidInteiro } = await cenario()

    const res = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().event.txid).toBe(txidInteiro)
    expect(res.json().event.txid).not.toContain('...')
    expect(res.json().wallet.label).toBe('Cofre')
  })

  it('conta as confirmações a partir da ponta conhecida', async () => {
    const { app, cookie, alertaId } = await cenario()

    const res = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: cookie },
    })

    // ponta 200, evento na altura 195
    expect(res.json().confirmations).toBe(6)
  })

  it('altura nula é mempool: zero confirmação', async () => {
    const { app, cookie, alertaId } = await cenario()
    await pool.query('UPDATE chain_events SET height = NULL')

    const res = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.json().confirmations).toBe(0)
  })

  it('alerta sem evento responde 200 com event nulo', async () => {
    const { app, cookie, alertaId } = await cenario()
    await pool.query('UPDATE alerts SET event_id = NULL WHERE id = $1', [alertaId])

    const res = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().event).toBeNull()
    expect(res.json().confirmations).toBeNull()
  })

  it('traz os alertas irmãos da mesma transação', async () => {
    const { app, cookie, alertaId, txidInteiro, walletId } = await cenario()
    const { rows: e2 } = await pool.query<{ id: string }>(
      `INSERT INTO chain_events (wallet_id, type, height, block_hash, txid, vout, payload)
       VALUES ($1,'utxo_created',195,'000000abc',$2,4,'{"value":600}'::jsonb) RETURNING id`,
      [walletId, txidInteiro],
    )
    const { rows: u } = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM alerts WHERE id = $1',
      [alertaId],
    )
    await pool.query(
      `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, event_id)
       VALUES ($1,$2,'dust_received','warning','{}'::jsonb,'k2',$3)`,
      [u[0]!.user_id, walletId, e2[0]!.id],
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: cookie },
    })

    expect(res.json().siblings).toHaveLength(1)
    expect(res.json().siblings[0].type).toBe('dust_received')
  })

  it('alerta de outro usuário responde igual a inexistente', async () => {
    const { app, cookie, alertaId } = await cenario()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'outro-detalhe@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'outro-detalhe@exemplo.com', password: 'senha-longa-de-teste' },
    })
    const outro = login.cookies.find(c => c.name === 'sb_session')!.value

    const alheio = await app.inject({
      method: 'GET',
      url: `/api/alerts/${alertaId}`,
      cookies: { sb_session: outro },
    })
    const inexistente = await app.inject({
      method: 'GET',
      url: '/api/alerts/999999',
      cookies: { sb_session: outro },
    })

    expect(alheio.statusCode).toBe(404)
    expect(alheio.json()).toEqual(inexistente.json())
    void cookie
  })
})
