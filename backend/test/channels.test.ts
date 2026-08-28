import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deliver } from '../src/alerts/channels'
import { sendToNtfy } from '../src/alerts/channels/ntfy'
import { sendToWebhook } from '../src/alerts/channels/webhook'
import { seal } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

const alert = {
  id: 1,
  walletId: 2,
  type: 'dust_received',
  severity: 'critical' as const,
  title: 'Possível ataque de poeira',
  body: 'Recebidos 600 sats',
}

describe('canal ntfy', () => {
  it('publica no tópico com prioridade alta quando é crítico', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }))
    await sendToNtfy(alert, { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)

    expect(fetchFn).toHaveBeenCalledOnce()
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.exemplo/badger')
    expect((init.headers as Record<string, string>).Priority).toBe('high')
    expect((init.headers as Record<string, string>).Title).toContain('poeira')
  })

  it('usa prioridade padrão quando é informativo', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }))
    await sendToNtfy({ ...alert, severity: 'info' }, { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Priority).toBe('default')
  })

  it('devolve falha em vez de estourar quando o servidor recusa', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await sendToNtfy(alert, { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/500/)
  })
})

describe('canal webhook', () => {
  it('envia o alerta como JSON', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 204 }))
    await sendToWebhook(alert, { url: 'https://exemplo/hook' }, fetchFn as never)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://exemplo/hook')
    expect(JSON.parse(init.body as string).type).toBe('dust_received')
  })
})

describe('entrega de alertas', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('identifica a carteira no push', async () => {
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (email,password_hash,language)
       VALUES ('dono@exemplo.com','x','pt') RETURNING id`,
    )
    const backend = await pool.query<{ id: string }>(
      `INSERT INTO backends (kind,url,network)
       VALUES ('esplora','http://x','signet') RETURNING id`,
    )
    const wallet = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
       VALUES ($1,'Cofre frio',$2,'aabb','p2wpkh','signet',$3) RETURNING id`,
      [user.rows[0]!.id, Buffer.from([0]), backend.rows[0]!.id],
    )
    await pool.query(
      `INSERT INTO channels (user_id,kind,config_encrypted)
       VALUES ($1,'ntfy',$2)`,
      [
        user.rows[0]!.id,
        seal(JSON.stringify({ server: 'https://ntfy.exemplo', topic: 'badger' }), process.env.MASTER_KEY_HEX!),
      ],
    )

    const ntfy = vi.fn(async (_alert: Parameters<typeof sendToNtfy>[0]) => ({ ok: true as const }))
    await deliver(
      {
        id: 1,
        walletId: Number(wallet.rows[0]!.id),
        type: 'funds_received',
        severity: 'info',
        params: { value: 12345, state: '@state.conf1' },
      },
      Number(user.rows[0]!.id),
      { ntfy },
    )

    expect(ntfy).toHaveBeenCalledOnce()
    const [enviado] = ntfy.mock.calls[0]!
    expect(enviado.title).toBe('Cofre frio · Fundos recebidos')
  })
})
