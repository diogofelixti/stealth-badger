import { describe, expect, it, vi } from 'vitest'
import { sendToNtfy } from '../src/alerts/channels/ntfy'
import { sendToWebhook } from '../src/alerts/channels/webhook'

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
