import { EventEmitter } from 'node:events'
import type pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import {
  startAlertListener,
  stopAlertListener,
  subscribeToAlerts,
} from '../src/stream/sse'

/** Cliente falso com a superfície que o listener usa do `pg.Client`. */
class FakeClient extends EventEmitter {
  queries: string[] = []
  conectado = false
  encerrado = false

  async connect(): Promise<void> {
    this.conectado = true
  }

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql)
    return {}
  }

  async end(): Promise<void> {
    this.encerrado = true
  }

  derruba(): void {
    this.emit('error', new Error('conexão perdida'))
  }

  notifica(payload: unknown): void {
    this.emit('notification', {
      channel: 'sb_alerts',
      payload: JSON.stringify(payload),
    })
  }
}

function fabrica(): { criados: FakeClient[]; createClient: () => pg.Client } {
  const criados: FakeClient[] = []
  return {
    criados,
    createClient: () => {
      const c = new FakeClient()
      criados.push(c)
      return c as unknown as pg.Client
    },
  }
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

afterEach(async () => {
  await stopAlertListener()
})

describe('listener de alertas', () => {
  it('escuta o canal do Postgres ao conectar', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient })

    expect(criados[0]!.conectado).toBe(true)
    expect(criados[0]!.queries).toContain('LISTEN sb_alerts')
  })

  it('entrega a notificação só a quem é dono do alerta', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient })

    const dono: unknown[] = []
    const alheio: unknown[] = []
    subscribeToAlerts(11, p => dono.push(p))
    subscribeToAlerts(12, p => alheio.push(p))

    criados[0]!.notifica({ id: 1, userId: 11, walletId: 3, severity: 'critical' })

    expect(dono).toHaveLength(1)
    expect(alheio).toHaveLength(0)
  })

  // A falha aqui é silenciosa: o feed simplesmente para de chegar e a página
  // fica parada sem erro nenhum na tela.
  it('reconecta e volta a escutar quando a conexão cai', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient, retryDelayMs: 5 })

    const recebidos: unknown[] = []
    subscribeToAlerts(21, p => recebidos.push(p))

    criados[0]!.derruba()
    await esperar(60)

    expect(criados).toHaveLength(2)
    expect(criados[1]!.queries).toContain('LISTEN sb_alerts')

    criados[1]!.notifica({ id: 2, userId: 21, walletId: 3, severity: 'info' })
    expect(recebidos).toHaveLength(1)
  })

  it('mantém os inscritos através da reconexão', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient, retryDelayMs: 5 })

    const recebidos: unknown[] = []
    subscribeToAlerts(31, p => recebidos.push(p))

    criados[0]!.derruba()
    await esperar(60)
    criados[1]!.derruba()
    await esperar(60)

    expect(criados).toHaveLength(3)
    criados[2]!.notifica({ id: 3, userId: 31, walletId: 4, severity: 'warning' })
    expect(recebidos).toHaveLength(1)
  })

  // Sem handler de 'error', o EventEmitter do pg lança e derruba o processo
  // inteiro — a API cai junto com o feed.
  it('trata o erro do cliente em vez de deixá-lo derrubar o processo', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient, retryDelayMs: 5 })

    expect(criados[0]!.listenerCount('error')).toBeGreaterThan(0)
    expect(() => criados[0]!.derruba()).not.toThrow()
  })

  it('ignora payload malformado sem perder a conexão', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient, retryDelayMs: 5 })

    const recebidos: unknown[] = []
    subscribeToAlerts(41, p => recebidos.push(p))

    expect(() =>
      criados[0]!.emit('notification', { channel: 'sb_alerts', payload: '{ não é json' }),
    ).not.toThrow()

    criados[0]!.notifica({ id: 4, userId: 41, walletId: 5, severity: 'info' })
    expect(recebidos).toHaveLength(1)
  })

  it('para de reconectar depois de stopAlertListener', async () => {
    const { criados, createClient } = fabrica()
    await startAlertListener({ createClient, retryDelayMs: 5 })

    await stopAlertListener()
    criados[0]!.derruba()
    await esperar(40)

    expect(criados).toHaveLength(1)
    expect(criados[0]!.encerrado).toBe(true)
  })
})
