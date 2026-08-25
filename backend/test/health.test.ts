import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app'

describe('GET /api/health', () => {
  it('responde 200 com status ok', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
