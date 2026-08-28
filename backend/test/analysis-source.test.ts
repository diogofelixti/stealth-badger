import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import type { PrivacyScan } from '../src/privacy/scan'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const RESULTADO: PrivacyScan = {
  score: 66,
  grade: 'C',
  walletInfo: { activeAddresses: 31, reusedAddresses: 2 },
  findings: [],
  scannerVersion: '0.34.2',
}

const REDE_ORIGINAL = process.env.NETWORK

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'mainnet'
})

async function logado(scanner?: () => Promise<PrivacyScan>) {
  const app = buildApp(scanner ? { scanner } : {})
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

/** Uma fonte de cadeia que o scanner não sabe consultar. */
async function fonteCore(): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network, preset)
     VALUES (NULL, 'core', 'http://host.docker.internal:8332', false, 'mainnet', 'core')
     RETURNING id`,
  )
  return Number(rows[0]!.id)
}

describe('GET /api/analysis-source', () => {
  // A instância semeia mais de um Esplora por rede de propósito: uma opção só
  // não é escolha, e cadastrar à mão o que já é catálogo é o atrito que o
  // item B existiu para tirar.
  it('lista os Esploras que a instância já traz, sem ninguém cadastrar nada', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/analysis-source?network=mainnet',
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(200)
    const urls = res.json().candidates.map((c: { url: string }) => c.url)
    expect(urls).toContain('https://mempool.space/api')
    expect(urls).toContain('https://blockstream.info/api')
  })

  it('não oferece fonte que não fala REST: o scanner não sabe usá-la', async () => {
    await fonteCore()
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'GET',
      url: '/api/analysis-source?network=mainnet',
      cookies: { sb_session: cookie },
    })

    const kinds = res.json().candidates.map((c: { url: string }) => c.url)
    expect(kinds).not.toContain('http://host.docker.internal:8332')
  })

  it('recusa sem sessão', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/analysis-source' })
    expect(res.statusCode).toBe(401)
  })
})

describe('PUT /api/analysis-source', () => {
  async function primeiraCandidata(app: ReturnType<typeof buildApp>, cookie: string) {
    const res = await app.inject({
      method: 'GET',
      url: '/api/analysis-source?network=mainnet',
      cookies: { sb_session: cookie },
    })
    return res.json().candidates[0] as { id: number; url: string }
  }

  it('guarda a escolha, e ela volta marcada na lista', async () => {
    const { app, cookie } = await logado()
    const escolha = await primeiraCandidata(app, cookie)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/analysis-source',
      cookies: { sb_session: cookie },
      payload: { network: 'mainnet', backendId: escolha.id },
    })

    expect(res.statusCode).toBe(200)
    const marcada = res
      .json()
      .candidates.find((c: { escolhida: boolean }) => c.escolhida)
    expect(marcada.id).toBe(escolha.id)
  })

  // As três recusas são separadas porque falham por motivos diferentes, e um
  // "fonte inválida" genérico manda procurar defeito onde não há.
  it('recusa fonte que não é Esplora, nomeando o motivo', async () => {
    const core = await fonteCore()
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/analysis-source',
      cookies: { sb_session: cookie },
      payload: { network: 'mainnet', backendId: core },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('privacy.analysisSource.notEsplora')
  })

  it('recusa fonte de outra rede', async () => {
    const { app, cookie } = await logado()
    const escolha = await primeiraCandidata(app, cookie)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/analysis-source',
      cookies: { sb_session: cookie },
      payload: { network: 'signet', backendId: escolha.id },
    })

    expect(res.json().code).toBe('privacy.analysisSource.wrongNetwork')
  })

  it('recusa fonte que não existe', async () => {
    const { app, cookie } = await logado()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/analysis-source',
      cookies: { sb_session: cookie },
      payload: { network: 'mainnet', backendId: 999999 },
    })

    expect(res.json().code).toBe('privacy.analysisSource.notFound')
  })
})

describe('a análise de uma carteira em nó próprio', () => {
  async function carteiraNoCore() {
    const core = await fonteCore()
    const { app, cookie } = await logado(async () => RESULTADO)
    const criada = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB, backendId: core },
    })
    return { app, cookie, walletId: Number(criada.json().id) }
  }

  /*
   * O caso que motivou tudo isto.
   *
   * Antes de 28/08, a análise de uma carteira no Core rodava contra o RPC do nó
   * e o scanner respondia `Not found` — dez de dez vezes. Guardar aquilo como
   * resultado dava um score que não media nada.
   *
   * Agora ela para antes, e pede a escolha. Não é erro: é a única pergunta que
   * o sistema faz, uma vez por rede.
   */
  it('pede a escolha em vez de rodar o scanner contra um RPC', async () => {
    const { app, cookie, walletId } = await carteiraNoCore()

    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('privacy.needsAnalysisSource')
  })

  // A tela pergunta uma vez, e para isso precisa saber o que oferecer. Sem as
  // candidatas na recusa, ela teria de fazer uma segunda chamada só para
  // desenhar o que a primeira já sabia.
  it('a recusa traz as candidatas e o tipo da fonte que não serviu', async () => {
    const { app, cookie, walletId } = await carteiraNoCore()

    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })

    const { params } = res.json()
    expect(params.chainKind).toBe('core')
    expect(params.network).toBe('mainnet')
    expect(params.candidates.length).toBeGreaterThan(0)
  })

  it('depois de escolher, a análise roda e não pergunta de novo', async () => {
    const { app, cookie, walletId } = await carteiraNoCore()
    const recusa = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })
    const candidata = recusa.json().params.candidates[0]

    await app.inject({
      method: 'PUT',
      url: '/api/analysis-source',
      cookies: { sb_session: cookie },
      payload: { network: 'mainnet', backendId: candidata.id },
    })

    const depois = await app.inject({
      method: 'POST',
      url: `/api/wallets/${walletId}/scan`,
      cookies: { sb_session: cookie },
    })

    expect(depois.statusCode).toBe(202)
  })
})

describe('a análise de uma carteira que já está num Esplora', () => {
  // Quem já vigia por um Esplora não é perguntado: a fonte dele serve, e
  // nenhum host novo passa a ver os endereços.
  it('não pergunta nada, e usa a própria fonte da carteira', async () => {
    const { app, cookie } = await logado(async () => RESULTADO)
    const criada = await app.inject({
      method: 'POST',
      url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/wallets/${Number(criada.json().id)}/scan`,
      cookies: { sb_session: cookie },
    })

    expect(res.statusCode).toBe(202)
  })
})

afterEach(() => {
  if (REDE_ORIGINAL === undefined) delete process.env.NETWORK
  else process.env.NETWORK = REDE_ORIGINAL
})
