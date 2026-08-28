import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

afterEach(() => {
  if (REDE_ORIGINAL === undefined) delete process.env.NETWORK
  else process.env.NETWORK = REDE_ORIGINAL
})

async function logado(email = 'dono@exemplo.com') {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

describe('GET /api/backends', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/backends' })).statusCode).toBe(401)
  })

  it('lista o backend configurado mesmo antes da primeira carteira', async () => {
    // a tela de cadastro precisa de pelo menos uma opção para oferecer
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    // desde 28/08 são três: a fonte da instância e as duas públicas prontas,
    // uma de mainnet e uma de signet
    expect(res.json().length).toBeGreaterThanOrEqual(1)
    expect(res.json().every((b: { scope: string }) => b.scope === 'global')).toBe(true)
  })

  it('não devolve o backend de outro usuário', async () => {
    const a = await logado('a@exemplo.com')
    await a.app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: a.cookie },
      payload: { kind: 'electrum', url: 'electrum://so-meu:50001', isPublic: false },
    })

    const b = await logado('b@exemplo.com')
    const res = await b.app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: b.cookie },
    })
    expect(JSON.stringify(res.json())).not.toContain('so-meu')
  })

  it('lista todas as redes, e aceita filtrar por rede', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()
    await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: {
        kind: 'esplora',
        url: 'https://mempool.space/api',
        isPublic: true,
        network: 'mainnet',
      },
    })

    const todos = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect([...new Set(todos.json().map((b: { network: string }) => b.network))].sort()).toEqual([
      'mainnet',
      'signet',
    ])

    const filtrados = await app.inject({
      method: 'GET',
      url: '/api/backends?network=mainnet',
      cookies: { sb_session: cookie },
    })
    expect(filtrados.json().length).toBeGreaterThanOrEqual(1)
    expect(
      filtrados.json().every((b: { network: string }) => b.network === 'mainnet'),
    ).toBe(true)
  })
})

describe('POST /api/backends', () => {
  it('cadastra backend próprio e passa a oferecê-lo na lista', async () => {
    const { app, cookie } = await logado()
    const criado = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'electrum', url: 'electrum://127.0.0.1:50001', isPublic: false },
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toMatchObject({ kind: 'electrum', isPublic: false, scope: 'own' })

    const lista = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    // a fonte nova aparece ao lado das globais, e é a única do usuário
    expect(
      lista.json().filter((b: { scope: string }) => b.scope === 'own'),
    ).toHaveLength(1)
  })

  it('recusa tipo de backend sem adapter, nomeando o que aceita', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'pombo-correio', url: 'http://127.0.0.1:8332', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/esplora/)
    expect(res.json().error).toMatch(/electrum/)
  })

  it('exige que o endereço do Electrum use o esquema electrum://', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'electrum', url: '127.0.0.1:50001', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/electrum:\/\//)
  })

  it('aceita um backend de Bitcoin Core apontando para o RPC do nó', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'core', url: 'http://127.0.0.1:38332', isPublic: false },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().kind).toBe('core')
  })

  it('cadastra backend de mainnet numa instância de signet e grava mainnet', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: {
        kind: 'esplora',
        url: 'https://mempool.space/api',
        isPublic: true,
        network: 'mainnet',
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ network: 'mainnet' })

    const { rows } = await pool.query<{ network: string }>(
      'SELECT network FROM backends WHERE id = $1',
      [res.json().id],
    )
    expect(rows[0]!.network).toBe('mainnet')
  })

  // O RPC do Core fala HTTP, não o protocolo do Electrum. Aceitar o esquema
  // errado só adiaria a falha para o primeiro ciclo do worker, longe daqui.
  it('exige http ou https no RPC do Core', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'core', url: 'electrum://127.0.0.1:50001', isPublic: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/https?/)
  })

  it('exige http ou https no Esplora', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'esplora', url: 'electrum://x:50001', isPublic: true },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/https?/)
  })
})

describe('POST /api/wallets com backend escolhido', () => {
  async function backendProprio(app: ReturnType<typeof buildApp>, cookie: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'esplora', url: 'http://meu-esplora:3002', isPublic: false },
    })
    return res.json().id as number
  }

  it('vigia a carteira pelo backend escolhido, e não pelo configurado', async () => {
    const { app, cookie } = await logado()
    const backendId = await backendProprio(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB, backendId },
    })
    expect(res.statusCode).toBe(201)

    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0]).toMatchObject({
      backendUrl: 'http://meu-esplora:3002',
      backendIsPublic: false,
    })
  })

  it('continua usando o backend configurado quando nenhum é escolhido', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    const lista = await app.inject({
      method: 'GET',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()[0].backendUrl).toMatch(/mempool\.space/)
  })

  it('recusa vigiar por backend que pertence a outro usuário', async () => {
    const a = await logado('a@exemplo.com')
    const alheio = await backendProprio(a.app, a.cookie)

    const b = await logado('b@exemplo.com')
    const res = await b.app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: b.cookie },
      payload: { label: 'Cofre', key: ZPUB, backendId: alheio },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/backend/i)
  })
})

describe('POST /api/backends — catálogo de fontes', () => {
  // O catálogo é camada de apresentação sobre três adapters: Fulcrum, Electrs
  // e Floresta falam o mesmo protocolo e viram o mesmo `kind`. Preset que
  // decidisse comportamento seria um quarto adapter entrando pela porta dos
  // fundos.
  it('o preset do Fulcrum vira um backend electrum, com host e porta montados', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'fulcrum', host: '127.0.0.1', port: 50001, network: 'signet' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().kind).toBe('electrum')
    expect(res.json().url).toBe('electrum://127.0.0.1:50001')
    expect(res.json().preset).toBe('fulcrum')
    expect(res.json().isPublic).toBe(false)
  })

  it('Electrs e Floresta chegam ao mesmo adapter do Fulcrum', async () => {
    const { app, cookie } = await logado()

    for (const [preset, host] of [['electrs', 'a.local'], ['floresta', 'b.local']] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/backends',
        cookies: { sb_session: cookie },
        payload: { preset, host, port: 50001, network: 'signet' },
      })
      expect(res.json().kind).toBe('electrum')
      expect(res.json().url).toBe(`electrum://${host}:50001`)
    }
  })

  it('mempool.space monta a URL da rede escolhida e já vem marcado como público', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'mempool', network: 'signet' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().kind).toBe('esplora')
    expect(res.json().url).toBe('https://mempool.space/signet/api')
    expect(res.json().isPublic).toBe(true)
  })

  it('a mainnet do mempool.space não leva nome de rede no caminho', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'mempool', network: 'mainnet' },
    })

    expect(res.json().url).toBe('https://mempool.space/api')
  })

  it('recusa porta fora da faixa', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'fulcrum', host: '127.0.0.1', port: 70000, network: 'signet' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('backend.portRange')
  })

  it('recusa preset que não existe', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'umbrel', host: 'x', port: 1, network: 'signet' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('backend.unknownPreset')
  })

  // O RPC do Core não é leitura inofensiva: quem o alcança pode parar o nó.
  it('recusa Bitcoin Core sem autenticação', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { preset: 'core', host: '127.0.0.1', port: 38332, network: 'signet' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('backend.authRequired')
  })

  it('a credencial do Core é cifrada e nunca volta numa resposta', async () => {
    const { app, cookie } = await logado()
    const SENHA = 'senha-secreta-do-rpc'

    const criado = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: {
        preset: 'core',
        host: '127.0.0.1',
        port: 38332,
        network: 'signet',
        auth: { mode: 'userpass', user: 'badger', password: SENHA },
      },
    })

    expect(criado.statusCode).toBe(201)
    expect(criado.json().hasCredentials).toBe(true)
    expect(JSON.stringify(criado.json())).not.toContain(SENHA)

    const lista = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect(JSON.stringify(lista.json())).not.toContain(SENHA)
    expect(JSON.stringify(lista.json())).not.toContain('badger')
    expect(lista.json().find((b: { id: number }) => b.id === criado.json().id).hasCredentials).toBe(true)

    // e no banco não está em claro
    const { rows } = await pool.query<{ credentials_encrypted: Buffer | null }>(
      'SELECT credentials_encrypted FROM backends WHERE id = $1',
      [criado.json().id],
    )
    expect(rows[0]!.credentials_encrypted!.toString('utf8')).not.toContain(SENHA)
  })

  it('o caminho do cookie também é credencial, e também não volta', async () => {
    const { app, cookie } = await logado()

    const criado = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: {
        preset: 'core',
        host: '127.0.0.1',
        port: 38332,
        network: 'signet',
        auth: { mode: 'cookie', cookiePath: '/mnt/nó/.cookie' },
      },
    })

    expect(criado.statusCode).toBe(201)
    expect(criado.json().url).toBe('http://127.0.0.1:38332')
    expect(JSON.stringify(criado.json())).not.toContain('/mnt/nó/.cookie')
  })

  it('continua aceitando kind e url crus, que é como a instância cadastra o global', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'esplora', url: 'https://exemplo.local/api', isPublic: false, network: 'signet' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().url).toBe('https://exemplo.local/api')
  })
})

describe('as fontes que a instância oferece prontas', () => {
  // A pergunta de 28/08: "está tudo apontando só pra signet, por quê?". Porque
  // a instância só garantia a fonte da própria `NETWORK`. Rede é propriedade
  // da fonte desde o item 0, e mainnet precisa existir sem ninguém cadastrar.
  it('oferece mainnet e signet no primeiro acesso, mesmo com NETWORK=signet', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })

    const redes = res.json().map((b: { network: string }) => b.network)
    expect(redes).toContain('mainnet')
    expect(redes).toContain('signet')
  })

  it('as fontes públicas prontas vêm marcadas como públicas', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })

    const mainnet = res
      .json()
      .find((b: { network: string; url: string }) => b.network === 'mainnet')
    expect(mainnet.isPublic).toBe(true)
    expect(mainnet.url).toContain('mempool.space')
  })

  it('não duplica a fonte da instância quando ela já é uma das públicas', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()

    await app.inject({ method: 'GET', url: '/api/backends', cookies: { sb_session: cookie } })
    const res = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })

    const urls = res
      .json()
      .map((b: { url: string; network: string }) => b.url + '|' + b.network)
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('POST /api/backends/detect', () => {
  it('recusa sem diretório', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends/detect',
      cookies: { sb_session: cookie },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('backend.datadirRequired')
  })

  it('devolve o que achou, sem cadastrar nada', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/backends/detect',
      cookies: { sb_session: cookie },
      payload: { datadir: '/nao/existe/aqui' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ found: false, reason: 'notMounted' })
    // detectar é olhar, não cadastrar
    const lista = await app.inject({
      method: 'GET',
      url: '/api/backends',
      cookies: { sb_session: cookie },
    })
    expect(lista.json().every((b: { kind: string }) => b.kind !== 'core')).toBe(true)
  })
})

describe('POST /api/backends/:id/test', () => {
  /*
   * Por que este teste existe.
   *
   * As duas fontes `mempool.space` que a instância semeia estavam
   * **inalcançáveis** da rede da máquina de desenvolvimento, medido em 28/08:
   * o host não completa a conexão, enquanto `blockstream.info` responde em
   * 0,65 s. Na lista de fontes as duas apareciam idênticas às que funcionam, e
   * quem cadastrava carteira numa delas só descobria pelo `fetch failed`.
   *
   * A altura da ponta é a prova mais barata de que a fonte serve.
   */
  async function comFonte(tip: () => Promise<number>) {
    const app = buildApp({
      adapterFactory: () =>
        ({
          tipHeight: tip,
          capabilities: () => ({ host: 'exemplo', supportsAddressHistory: true }),
        }) as never,
    })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO backends (user_id, kind, url, is_public, network, preset)
       VALUES (NULL, 'esplora', 'https://exemplo/api', true, 'mainnet', 'mempool')
       RETURNING id`,
    )
    return { app, cookie, id: Number(rows[0]!.id) }
  }

  it('fonte que responde devolve a altura da ponta', async () => {
    const { app, cookie, id } = await comFonte(async () => 964420)

    const res = await app.inject({
      method: 'POST',
      url: `/api/backends/${id}/test`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, height: 964420 })
  })

  // 200 com `ok: false`, e não 502: não ter respondido é o **resultado** do
  // teste, e não uma falha da requisição. A tela precisa do motivo para
  // mostrá-lo ao lado da fonte.
  it('fonte que não responde é resultado, e não erro de requisição', async () => {
    const { app, cookie, id } = await comFonte(async () => {
      throw new Error('fetch failed')
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/backends/${id}/test`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: false, reason: 'fetch failed' })
  })

  it('não testa fonte de outra pessoa', async () => {
    const { app, cookie } = await comFonte(async () => 1)
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, is_admin, language)
       VALUES ('outro@exemplo.com', 'x', false, 'pt') RETURNING id`,
    )
    const { rows: alheia } = await pool.query<{ id: string }>(
      `INSERT INTO backends (user_id, kind, url, is_public, network, preset)
       VALUES ($1, 'esplora', 'https://alheia/api', true, 'mainnet', 'mempool')
       RETURNING id`,
      [Number(rows[0]!.id)],
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/backends/${Number(alheia[0]!.id)}/test`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(404)
  })

  it('recusa sem autenticação', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/backends/1/test' })
    expect(res.statusCode).toBe(401)
  })
})
