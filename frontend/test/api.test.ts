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

  // A interface é bilíngue e as mensagens de erro chegavam só em português. O
  // código é o que permite a tela escolher a frase; a mensagem do servidor
  // continua como reserva para código que o catálogo ainda não conhece.
  it('carrega o código e os parâmetros do erro até quem for exibi-lo', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          error: 'esta chave é de mainnet',
          code: 'wallet.wrongNetwork',
          params: { chave: 'mainnet', rede: 'signet' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    )
    await expect(api.wallets()).rejects.toMatchObject({
      code: 'wallet.wrongNetwork',
      params: { chave: 'mainnet', rede: 'signet' },
    })
  })

  it('mantém a mensagem do servidor quando não há código', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'algo específico deu errado' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(api.wallets()).rejects.toThrow(/algo específico/)
  })
})

describe('mensagemDoErro', () => {
  const catalogo = {
    'error.wallet.wrongNetwork': 'Esta chave é de {chave}, e vigiamos {rede}.',
  }

  it('traduz pelo código, preenchendo os parâmetros', async () => {
    const { mensagemDoErro } = await import('../src/lib/api')
    const err = Object.assign(new Error('texto do servidor'), {
      code: 'wallet.wrongNetwork',
      params: { chave: 'mainnet', rede: 'signet' },
    })
    expect(mensagemDoErro(catalogo, err, 'pt')).toBe(
      'Esta chave é de mainnet, e vigiamos signet.',
    )
  })

  // Código novo no servidor e catálogo antigo na tela é situação normal num
  // deploy. Cair no texto do servidor é pior que traduzido, e muito melhor que
  // mostrar a chave crua.
  it('cai na mensagem do servidor quando o catálogo não conhece o código', async () => {
    const { mensagemDoErro } = await import('../src/lib/api')
    const err = Object.assign(new Error('texto do servidor'), { code: 'algo.novo' })
    expect(mensagemDoErro(catalogo, err, 'pt')).toBe('texto do servidor')
  })

  it('se vira com erro que não veio da API', async () => {
    const { mensagemDoErro } = await import('../src/lib/api')
    expect(mensagemDoErro(catalogo, new Error('rede caiu'), 'pt')).toBe('rede caiu')
  })
})
