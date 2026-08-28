import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp, type AppOptions } from '../src/app'
import { open } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

async function logado(opts: AppOptions = {}) {
  const app = buildApp(opts)
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'acesso@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'acesso@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

const AMBIENTE = { ...process.env }

beforeEach(async () => {
  await resetDb()
  delete process.env.TOR_HOSTNAME_PATH
  delete process.env.TAILSCALE_HOSTNAME
  delete process.env.CLOUDFLARE_HOSTNAME
  delete process.env.DOCKER_SOCKET
})

/** Resolvedor que responde o que o caso pedir, sem sair da máquina. */
const resolve = (enderecos: string[]) => async () => enderecos
const naoResolve = (code: string) => async () => {
  throw Object.assign(new Error(code), { code })
}
const respondeReady = (status: number, corpo: unknown) => async () =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Engine de mentira: a busca devolve o que o caso pedir, e a ação diz 204. */
const engineComContainers =
  (containers: unknown[]): NonNullable<AppOptions['engineDeAcesso']> =>
  async (_metodo, caminho) =>
    caminho.startsWith('/containers/json')
      ? { status: 200, body: JSON.stringify(containers) }
      : { status: 204, body: '' }

describe('GET /api/access', () => {
  // O caso comum: quem não usa túnel nenhum. Ler arquivo que não existe não
  // pode derrubar a página.
  it('sem nada configurado, os três caminhos vêm desligados e nada quebra', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      tor: { enabled: false },
      tailscale: { enabled: false },
      cloudflare: { enabled: false },
    })
  })

  it('com o hostname do hidden service montado, o .onion aparece', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-tor-'))
    const caminho = join(dir, 'hostname')
    writeFileSync(caminho, 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion\n')
    process.env.TOR_HOSTNAME_PATH = caminho
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tor).toMatchObject({
      enabled: true,
      onion: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion',
    })
  })

  // A linha da Cloudflare não é nota de rodapé: quem termina o TLS enxerga o
  // tráfego em claro, e um watchtower de privacidade que esconde isso está
  // fazendo com o próprio usuário o que denuncia nos exploradores públicos.
  it('a Cloudflare vem sempre com o aviso de que ela enxerga o tráfego', async () => {
    process.env.CLOUDFLARE_HOSTNAME = 'painel.exemplo.com'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().cloudflare).toMatchObject({
      enabled: true,
      hostname: 'painel.exemplo.com',
      warning: true,
    })
  })

  it('o Tailscale aparece pelo hostname do container', async () => {
    process.env.TAILSCALE_HOSTNAME = 'badger.tail1234.ts.net'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tailscale).toMatchObject({
      enabled: true,
      hostname: 'badger.tail1234.ts.net',
    })
  })

  it('o Tailscale usa o hostname salvo pelo wizard antes do fallback do .env', async () => {
    process.env.TAILSCALE_HOSTNAME = 'antigo.tail.ts.net'
    const { app, cookie } = await logado()
    await app.inject({
      method: 'PUT',
      url: '/api/access/config/tailscale',
      cookies: { sb_session: cookie },
      payload: { hostname: 'novo.tail.ts.net', authKey: 'tskey-auth-abc' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tailscale).toMatchObject({
      enabled: true,
      hostname: 'novo.tail.ts.net',
    })
  })

  // `enabled` e `status` medem coisas diferentes, e a diferença entre elas é o
  // caso em que a pessoa acha que está publicada e não está: o `.onion` está no
  // arquivo, e o Tor não subiu.
  it('caminho configurado que não pôde ser sondado vem "unknown", e não "up"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-tor-'))
    const caminho = join(dir, 'hostname')
    writeFileSync(caminho, 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion\n')
    process.env.TOR_HOSTNAME_PATH = caminho
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tor).toMatchObject({
      enabled: true,
      status: 'unknown',
      statusSource: 'none',
    })
  })

  it('nome da MagicDNS que resolve deixa o Tailscale de pé, pelo DNS', async () => {
    process.env.TAILSCALE_HOSTNAME = 'badger.tail1234.ts.net'
    const { app, cookie } = await logado({ resolverDns: resolve(['100.64.0.7']) })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tailscale).toMatchObject({
      enabled: true,
      status: 'up',
      statusSource: 'dns',
    })
  })

  it('nome que não existe deixa o Tailscale desligado, e continua "enabled"', async () => {
    process.env.TAILSCALE_HOSTNAME = 'badger.tail1234.ts.net'
    const { app, cookie } = await logado({ resolverDns: naoResolve('ENOTFOUND') })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    // `enabled: true` porque alguém configurou; `down` porque a sonda mediu.
    expect(res.json().tailscale).toMatchObject({ enabled: true, status: 'down' })
  })

  it('túnel com conexão pronta deixa a Cloudflare de pé, pelo /ready', async () => {
    process.env.CLOUDFLARE_HOSTNAME = 'painel.exemplo.com'
    const { app, cookie } = await logado({
      fetchDeAcesso: respondeReady(200, { readyConnections: 4 }) as unknown as typeof fetch,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().cloudflare).toMatchObject({
      enabled: true,
      status: 'up',
      statusSource: 'http',
      warning: true,
    })
  })

  it('caminho não configurado nem chega a ser sondado', async () => {
    const { app, cookie } = await logado({
      resolverDns: async () => {
        throw new Error('a sonda não devia ter rodado')
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tailscale).toMatchObject({
      enabled: false,
      status: 'down',
      statusSource: 'none',
    })
  })

  // O padrão do projeto continua sendo leitura: sem o socket montado de
  // propósito, a tela não oferece botão nenhum de ligar.
  it('sem DOCKER_SOCKET, o controle pela tela não é oferecido', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().control).toMatchObject({ available: false })
  })

  it('com o socket montado, o controle é oferecido a quem é admin', async () => {
    process.env.DOCKER_SOCKET = '/var/run/docker.sock'
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    // O primeiro usuário cadastrado é o admin da instância.
    // `canCreate` é falso porque este teste não monta o diretório do projeto:
    // o painel liga e desliga, e ainda não sabe criar.
    expect(res.json().control).toEqual({
      available: true,
      isAdmin: true,
      canCreate: false,
    })
  })

  it('recusa sem autenticação: por onde o painel é alcançável não é dado público', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/access' })).statusCode).toBe(401)
  })

  // Container parado encerra a discussão; container de pé não. `cloudflared`
  // responde 200 no `/ready` antes de ter conexão com a borda, e é a sonda de
  // rede que sabe disso.
  it('o Docker desmente o resto quando o container está parado', async () => {
    process.env.CLOUDFLARE_HOSTNAME = 'painel.exemplo.com'
    const { app, cookie } = await logado({
      engineDeAcesso: engineComContainers([]),
      fetchDeAcesso: respondeReady(200, { readyConnections: 4 }) as unknown as typeof fetch,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().cloudflare).toMatchObject({ status: 'down', statusSource: 'docker' })
  })

  it('com o container de pé, a sonda mais específica é quem decide', async () => {
    process.env.CLOUDFLARE_HOSTNAME = 'painel.exemplo.com'
    const { app, cookie } = await logado({
      engineDeAcesso: engineComContainers([{ Id: 'abc', State: 'running' }]),
      fetchDeAcesso: respondeReady(200, { readyConnections: 0 }) as unknown as typeof fetch,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    // Container de pé, túnel sem conexão nenhuma: não está publicado.
    expect(res.json().cloudflare).toMatchObject({ status: 'down', statusSource: 'http' })
  })

  // O Tor não tem sonda de rede, então é aqui que o socket paga o que custou:
  // com ele, `hostname existe` deixa de ser tudo o que a tela sabe.
  it('com o socket, o Tor deixa de ser "não sei"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-tor-'))
    const caminho = join(dir, 'hostname')
    writeFileSync(caminho, 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion\n')
    process.env.TOR_HOSTNAME_PATH = caminho
    const { app, cookie } = await logado({
      engineDeAcesso: engineComContainers([{ Id: 'abc', State: 'running' }]),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/access',
      cookies: { sb_session: cookie },
    })

    expect(res.json().tor).toMatchObject({ status: 'up', statusSource: 'docker' })
  })
})

describe('POST /api/access/control', () => {
  const corpo = { profile: 'tor', action: 'up' }

  it('o admin liga um caminho pela tela', async () => {
    const { app, cookie } = await logado({
      engineDeAcesso: engineComContainers([{ Id: 'abc', State: 'exited' }]),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      cookies: { sb_session: cookie },
      payload: corpo,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, profile: 'tor', action: 'up' })
  })

  // `users.is_admin` existia no schema desde o item 1 e nunca tinha sido usado.
  // É aqui que ele passa a valer: num painel multi-usuário, o socket do Docker
  // na mão de qualquer sessão é execução de código para qualquer sessão.
  it('quem não é admin recebe 403, e o engine nem é tocado', async () => {
    const chamadas: string[] = []
    const app = buildApp({
      engineDeAcesso: async (metodo, caminho) => {
        chamadas.push(metodo + ' ' + caminho)
        return { status: 200, body: '[]' }
      },
    })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'primeiro@exemplo.com', password: 'senha-bem-comprida' },
    })
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'segundo@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'segundo@exemplo.com', password: 'senha-bem-comprida' },
    })
    const sessao = login.cookies.find(c => c.name === 'sb_session')!.value

    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      cookies: { sb_session: sessao },
      payload: corpo,
    })

    expect(res.statusCode).toBe(403)
    expect(chamadas).toEqual([])
  })

  it('recusa sem sessão nenhuma', async () => {
    const app = buildApp({ engineDeAcesso: engineComContainers([]) })
    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      payload: corpo,
    })

    expect(res.statusCode).toBe(401)
  })

  // A lista branca é o que separa "o painel liga o túnel" de "o painel executa
  // o que mandarem". Perfil fora dela não chega ao engine.
  it.each([
    { profile: 'postgres', action: 'down' },
    { profile: 'backend', action: 'down' },
    { profile: 'tor', action: 'exec' },
    { profile: 'tor', action: 'logs' },
    { profile: '../../containers/abc/kill', action: 'up' },
    { profile: 'tor' },
    {},
  ])('%o não atravessa a lista branca', async payload => {
    const chamadas: string[] = []
    const { app, cookie } = await logado({
      engineDeAcesso: async (metodo, caminho) => {
        chamadas.push(metodo + ' ' + caminho)
        return { status: 200, body: '[]' }
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      cookies: { sb_session: cookie },
      payload,
    })

    expect(res.statusCode).toBe(400)
    expect(chamadas).toEqual([])
  })

  // O padrão do projeto não mudou: quem não montou o socket continua com o
  // painel de leitura de 27/08, e a resposta diz isso em vez de dar erro seco.
  it('sem o socket montado, responde 503 dizendo que esta instância só lê', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      cookies: { sb_session: cookie },
      payload: corpo,
    })

    expect(res.statusCode).toBe(503)
    expect(res.json().code).toBe('access.noSocket')
  })

  it('perfil que nunca subiu devolve o comando de criar', async () => {
    const { app, cookie } = await logado({ engineDeAcesso: engineComContainers([]) })

    const res = await app.inject({
      method: 'POST',
      url: '/api/access/control',
      cookies: { sb_session: cookie },
      payload: { profile: 'cloudflared', action: 'up' },
    })

    expect(res.json()).toMatchObject({
      ok: false,
      reason: 'notCreated',
      command: 'docker compose --profile cloudflared create',
    })
  })
})

describe('configuração do wizard de acesso externo', () => {
  it('salva credencial cifrada e só devolve resumo', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/access/config/cloudflared',
      cookies: { sb_session: cookie },
      payload: { hostname: 'painel.exemplo.com', token: 'token-secreto' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      profile: 'cloudflared',
      configured: true,
      hostname: 'painel.exemplo.com',
      hasSecret: true,
    })
    expect(JSON.stringify(res.json())).not.toContain('token-secreto')

    const banco = await pool.query<{ config_encrypted: Buffer }>(
      'SELECT config_encrypted FROM access_configs WHERE profile = $1',
      ['cloudflared'],
    )
    expect(banco.rows[0]!.config_encrypted.toString('utf8')).not.toContain('token-secreto')
    expect(open(banco.rows[0]!.config_encrypted, process.env.MASTER_KEY_HEX!)).toContain(
      'token-secreto',
    )
  })

  it('recusa configuração incompleta antes de gravar', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/access/config/tailscale',
      cookies: { sb_session: cookie },
      payload: { hostname: 'badger.tail.ts.net' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('access.badConfig')
    const banco = await pool.query('SELECT 1 FROM access_configs')
    expect(banco.rowCount).toBe(0)
  })

  it('entrega env shell somente pela ponte interna do perfil configurado', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'PUT',
      url: '/api/access/config/tailscale',
      cookies: { sb_session: cookie },
      payload: { hostname: 'badger.tail.ts.net', authKey: "tskey-auth-a'b" },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/internal/access/config/tailscale/env',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain("export TS_AUTHKEY='tskey-auth-a'\"'\"'b'")
    expect(res.body).toContain("export TAILSCALE_HOSTNAME='badger.tail.ts.net'")
  })

  it('entrega env JSON para o wrapper estático do container', async () => {
    const { app, cookie } = await logado()
    await app.inject({
      method: 'PUT',
      url: '/api/access/config/cloudflared',
      cookies: { sb_session: cookie },
      payload: { hostname: 'painel.exemplo.com', token: 'token-secreto' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/internal/access/config/cloudflared/runtime-env',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json()).toEqual({
      TUNNEL_TOKEN: 'token-secreto',
      CLOUDFLARE_HOSTNAME: 'painel.exemplo.com',
    })
  })

  it('não entrega env interno para perfil inexistente ou não configurado', async () => {
    const { app } = await logado()

    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/internal/access/config/cloudflared/env',
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/internal/access/config/tor/env',
        })
      ).statusCode,
    ).toBe(404)
  })
})

afterEach(() => {
  process.env = { ...AMBIENTE }
})
