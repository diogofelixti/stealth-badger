import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'

let chamadas: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  chamadas = []
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init: RequestInit = {}) => {
    chamadas.push({ url: String(url), init })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})

describe('cliente de API', () => {
  // O Fastify recusa corpo vazio quando o content-type diz que é JSON:
  // `FST_ERR_CTP_EMPTY_JSON_BODY`. Mandar o cabeçalho sem corpo quebrava o
  // botão de sair, o de analisar privacidade e o de testar canal — três
  // botões, e nenhum teste de unidade pegava, porque todos simulam o cliente
  // em vez de exercê-lo.
  it('não anuncia corpo JSON quando não há corpo', async () => {
    await api.logout()
    const headers = (chamadas[0]!.init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('anuncia corpo JSON quando há corpo', async () => {
    await api.login('a@b.co', 'senha')
    const headers = (chamadas[0]!.init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(chamadas[0]!.init.body).toContain('a@b.co')
  })

  it('manda a sessão junto, senão nada autenticado funciona', async () => {
    await api.wallets()
    expect(chamadas[0]!.init.credentials).toBe('include')
  })

  it('dispara a análise de privacidade sem corpo e sem cabeçalho de corpo', async () => {
    await api.scanPrivacy(3)
    expect(chamadas[0]!.url).toContain('/api/wallets/3/scan')
    const headers = (chamadas[0]!.init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('testa o canal sem corpo e sem cabeçalho de corpo', async () => {
    await api.testChannel(7)
    expect(chamadas[0]!.url).toContain('/api/channels/7/test')
    const headers = (chamadas[0]!.init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })
})
