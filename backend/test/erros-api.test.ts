import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { CATALOG } from '../src/i18n/catalog'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function logado() {
  const app = buildApp()
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
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

/**
 * A interface é bilíngue e as mensagens de erro saíam só em português. O
 * código é o que permite a tela escolher o idioma — a mensagem continua na
 * resposta como texto de reserva, para quem consome a API direto.
 */
describe('erros da API carregam código para a tela traduzir', () => {
  it('credenciais inválidas vêm com código', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.co', password: 'senha-errada-mesmo' },
    })
    expect(res.json()).toMatchObject({ code: 'auth.invalidCredentials' })
    expect(res.json().error).toBeTruthy()
  })

  it('e-mail já cadastrado vem com código', async () => {
    const app = buildApp()
    const payload = { email: 'a@b.co', password: 'senha-bem-comprida' }
    await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    expect(res.json()).toMatchObject({ code: 'auth.emailTaken' })
  })

  it('rótulo obrigatório vem com código', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { key: ZPUB },
    })
    expect(res.json()).toMatchObject({ code: 'wallet.labelRequired' })
  })

  it('chave e endereço juntos vêm com código', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'x', key: ZPUB, address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
    })
    expect(res.json()).toMatchObject({ code: 'wallet.keyOrAddress' })
  })

  // A rede errada precisa dizer qual é qual, e isso são dois valores que a
  // frase usa. Sem parâmetros, a tradução viraria uma frase genérica que não
  // ajuda ninguém a corrigir.
  it('rede errada vem com código e com os parâmetros da frase', async () => {
    process.env.NETWORK = 'signet'
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'x', key: ZPUB },
    })
    expect(res.json()).toMatchObject({
      code: 'wallet.networkMismatch',
      params: {
        rede_da_chave: 'mainnet',
        rede_do_backend: 'signet',
        nome_do_backend: 'mempool.space',
      },
    })
  })

  it('tópico do canal obrigatório vem com código', async () => {
    const { app, cookie } = await logado()
    const res = await app.inject({
      method: 'POST',
      url: '/api/channels',
      cookies: { sb_session: cookie },
      payload: { kind: 'ntfy' },
    })
    expect(res.json()).toMatchObject({ code: 'channel.topicRequired' })
  })

  // Código sem frase no catálogo cairia no texto do servidor, em português —
  // que é justamente o que estamos consertando.
  it('todo código emitido tem frase nos dois idiomas', async () => {
    const { app, cookie } = await logado()
    const respostas = await Promise.all([
      app.inject({ method: 'POST', url: '/api/wallets', cookies: { sb_session: cookie }, payload: { key: ZPUB } }),
      app.inject({ method: 'POST', url: '/api/wallets', cookies: { sb_session: cookie }, payload: { label: 'x' } }),
      app.inject({ method: 'POST', url: '/api/channels', cookies: { sb_session: cookie }, payload: { kind: 'ntfy' } }),
      app.inject({ method: 'POST', url: '/api/channels', cookies: { sb_session: cookie }, payload: { kind: 'pombo' } }),
      app.inject({ method: 'POST', url: '/api/backends', cookies: { sb_session: cookie }, payload: { kind: 'electrum', url: 'x' } }),
    ])
    for (const r of respostas) {
      const code = r.json().code as string
      expect(code, r.json().error).toBeTruthy()
      expect(CATALOG.pt['error.' + code], 'pt de ' + code).toBeTruthy()
      expect(CATALOG.en['error.' + code], 'en de ' + code).toBeTruthy()
    }
  })
})
