import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { satsPorVbyte, taxasDoMempool, taxasDoNo } from '../src/fees/service'
import { resetDb } from './helpers/db'

async function logado() {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'taxa@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'taxa@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

beforeEach(async () => {
  await resetDb()
})

describe('conversão de BTC/kvB para sat/vB', () => {
  // O mesmo defeito da 21ª rodada, no mesmo formato: multiplicar ponto
  // flutuante por 1e8 perde satoshi. Contar pelos dígitos do texto é exato.
  it('converte sem perder por arredondamento', () => {
    expect(satsPorVbyte(0.00001)).toBe(1)
    expect(satsPorVbyte(0.0001)).toBe(10)
    expect(satsPorVbyte(0.00002812)).toBe(2.812)
  })

  it('valor ausente vira nulo, e não zero', () => {
    expect(satsPorVbyte(undefined)).toBeNull()
  })
})

describe('taxas pelo nó', () => {
  it('pergunta ao estimatesmartfee para 1, 3 e 6 blocos', async () => {
    const alvos: number[] = []
    const taxas = await taxasDoNo(async (_metodo, params) => {
      alvos.push(Number((params as unknown[])[0]))
      return { feerate: 0.00002 }
    })

    expect(alvos).toEqual([1, 3, 6])
    expect(taxas).toEqual({ 1: 2, 3: 2, 6: 2 })
  })

  it('bloco sem estimativa vem nulo, e não inventado', async () => {
    const taxas = await taxasDoNo(async (_metodo, params) =>
      Number((params as unknown[])[0]) === 1 ? { errors: ['Insufficient data'] } : { feerate: 0.00001 },
    )

    expect(taxas[1]).toBeNull()
    expect(taxas[3]).toBe(1)
  })
})

describe('taxas pelo mempool.space', () => {
  it('traduz a resposta pública para os mesmos três alvos', async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({ fastestFee: 12, halfHourFee: 8, hourFee: 5, economyFee: 2 }),
        { status: 200 },
      )) as typeof fetch

    expect(await taxasDoMempool(fetchFn)).toEqual({ 1: 12, 3: 8, 6: 5 })
  })

  it('serviço fora do ar devolve nulo em vez de derrubar a tela', async () => {
    const fetchFn = (async () => new Response('erro', { status: 502 })) as typeof fetch

    expect(await taxasDoMempool(fetchFn)).toBeNull()
  })
})

describe('GET /api/fees', () => {
  it('desligado é o padrão, e não consulta nada', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/fees',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ source: 'off', blocks: null })
  })

  // Oferecer a opção morta seria pior: a tela diz por que ela não dá.
  it('pedir o nó sem ter backend core diz por quê', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      cookies: { sb_session: cookie },
      payload: { feeSource: 'node' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/fees',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('fees.needsCoreBackend')
  })
})
