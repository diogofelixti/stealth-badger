import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { open } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

beforeEach(async () => {
  await resetDb()
})

async function logado(email = 'dono@exemplo.com', opts = {}) {
  const app = buildApp(opts)
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

describe('GET /api/channels', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/channels' })).statusCode).toBe(401)
  })

  it('começa vazio', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'GET',
      url: '/api/channels',
      cookies: { sb_session: cookie },
    })
    expect(res.json()).toEqual([])
  })
})

describe('POST /api/channels', () => {
  it('cadastra canal ntfy e passa a oferecê-lo na lista', async () => {
    const { app, cookie } = await logado()
    const criado = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'meu-topico-secreto', server: 'https://ntfy.sh' },
    })
    expect(criado.statusCode).toBe(201)

    const lista = await app.inject({
      method: 'GET',
      url: '/api/channels',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()).toHaveLength(1)
    expect(lista.json()[0]).toMatchObject({ kind: 'ntfy', enabled: true })
  })

  // O tópico do ntfy é a única coisa que separa as notificações de quem quer
  // que as leia: quem sabe o tópico recebe tudo. Devolvê-lo numa listagem o
  // espalharia por log de proxy, histórico de navegador e captura de tela.
  it('nunca devolve o tópico do ntfy na listagem', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'meu-topico-secreto' },
    })
    const lista = await app.inject({
      method: 'GET',
      url: '/api/channels',
      cookies: { sb_session: cookie },
    })
    expect(JSON.stringify(lista.json())).not.toContain('meu-topico-secreto')
  })

  it('guarda a configuração cifrada, e não em texto puro', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'meu-topico-secreto' },
    })
    const { rows } = await pool.query<{ config_encrypted: Buffer }>(
      'SELECT config_encrypted FROM channels',
    )
    expect(rows[0]!.config_encrypted.toString('utf8')).not.toContain('meu-topico-secreto')
    expect(open(rows[0]!.config_encrypted, process.env.MASTER_KEY_HEX!)).toContain(
      'meu-topico-secreto',
    )
  })

  it('assume o ntfy.sh quando o servidor não é informado', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'x' },
    })
    const { rows } = await pool.query<{ config_encrypted: Buffer }>(
      'SELECT config_encrypted FROM channels',
    )
    expect(open(rows[0]!.config_encrypted, process.env.MASTER_KEY_HEX!)).toContain('ntfy.sh')
  })

  it('exige tópico no ntfy e url no webhook, com mensagem acionável', async () => {
    const { app, cookie } = await logado()
    const semTopico = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy' },
    })
    expect(semTopico.statusCode).toBe(400)
    expect(semTopico.json().error).toMatch(/tópico/i)

    const semUrl = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'webhook' },
    })
    expect(semUrl.statusCode).toBe(400)
  })

  it('recusa tipo de canal que não sabe entregar', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'pombo-correio', topic: 'x' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/ntfy/)
  })
})

describe('POST /api/channels/:id/test', () => {
  // Descobrir no palco que o push não chega é tarde demais. O teste existe
  // para que o caminho inteiro — cifra, canal, servidor, celular — seja
  // exercitado antes de valer.
  it('envia uma notificação de verdade pelo canal e relata o resultado', async () => {
    let recebido: { url: string; body: string } | null = null
    const { app, cookie } = await logado('a@b.co', {
      channelFetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
        recebido = { url: String(url), body: String(init?.body ?? '') }
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })
    const criado = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'topico-de-teste', server: 'https://ntfy.exemplo' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/channels/${criado.json().id}/test`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    expect(recebido!.url).toBe('https://ntfy.exemplo/topico-de-teste')
  })

  it('relata a falha em vez de fingir que deu certo', async () => {
    const { app, cookie } = await logado('c@d.co', {
      channelFetch: (async () => new Response('no', { status: 403 })) as typeof fetch,
    })
    const criado = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'x' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/channels/${criado.json().id}/test`,
      cookies: { sb_session: cookie },
    })
    expect(res.json()).toMatchObject({ ok: false })
    expect(res.json().error).toMatch(/403/)
  })

  it('recusa testar canal de outra pessoa', async () => {
    const dono = await logado('dono@x.co')
    const criado = await dono.app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: dono.cookie },
      payload: { kind: 'ntfy', topic: 'x' },
    })
    const outro = await logado('outro@x.co')
    const res = await outro.app.inject({
      method: 'POST',
      url: `/api/channels/${criado.json().id}/test`,
      cookies: { sb_session: outro.cookie },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/channels/:id', () => {
  it('remove o canal', async () => {
    const { app, cookie } = await logado()
    const criado = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy', topic: 'x' },
    })
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/channels/${criado.json().id}`,
      cookies: { sb_session: cookie },
    })
    expect(res.statusCode).toBe(204)

    const lista = await app.inject({
      method: 'GET',
      url: '/api/channels',
      cookies: { sb_session: cookie },
    })
    expect(lista.json()).toEqual([])
  })

  it('não deixa remover canal de outra pessoa', async () => {
    const dono = await logado('dono@y.co')
    const criado = await dono.app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: dono.cookie },
      payload: { kind: 'ntfy', topic: 'x' },
    })
    const outro = await logado('outro@y.co')
    const res = await outro.app.inject({
      method: 'DELETE',
      url: `/api/channels/${criado.json().id}`,
      cookies: { sb_session: outro.cookie },
    })
    expect(res.statusCode).toBe(404)
  })
})
