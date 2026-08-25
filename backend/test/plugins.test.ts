import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app'

describe('plugin: @fastify/cookie', () => {
  it('registra sem lançar sob a versão instalada do Fastify', async () => {
    const app = buildApp()
    // app.ready() resolvendo (sem lançar) é o que prova que o fastify-plugin
    // aceitou a versão do Fastify instalada — um mismatch de major lança
    // aqui, não em app.register().
    await app.ready()
  })

  it('faz o round trip: reply.setCookie() gera Set-Cookie e request.cookies lê de volta', async () => {
    const app = buildApp()

    // Rotas de sonda, só para este teste — não fazem parte da app real.
    app.get('/test/set-cookie', async (_req, reply) => {
      reply.setCookie('sessao', 'abc123', { path: '/' })
      return { ok: true }
    })

    app.get('/test/read-cookie', async (req) => {
      return { cookies: req.cookies }
    })

    await app.ready()

    const setRes = await app.inject({ method: 'GET', url: '/test/set-cookie' })
    expect(setRes.statusCode).toBe(200)
    const setCookieHeader = setRes.headers['set-cookie']
    expect(setCookieHeader).toBeDefined()
    expect(String(setCookieHeader)).toContain('sessao=abc123')

    const readRes = await app.inject({
      method: 'GET',
      url: '/test/read-cookie',
      cookies: { sessao: 'abc123' },
    })
    expect(readRes.statusCode).toBe(200)
    expect(readRes.json()).toEqual({ cookies: { sessao: 'abc123' } })
  })
})
