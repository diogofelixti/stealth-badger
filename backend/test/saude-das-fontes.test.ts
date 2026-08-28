import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import {
  ensureBackendsPublicos,
  fontePublicaPadrao,
  listarBackends,
} from '../src/chain/backends'
import { guardarMedicao, varrerSaude, type SondaDeFonte } from '../src/chain/saude'
import { redeDaChainDoCore, redeDoGenesis } from '../src/chain/rede-medida'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

const AMBIENTE = {
  network: process.env.NETWORK,
  kind: process.env.CHAIN_BACKEND,
  url: process.env.CORE_URL,
}

beforeEach(async () => {
  await resetDb()
  process.env.NETWORK = 'signet'
})

afterEach(() => {
  for (const [nome, valor] of [
    ['NETWORK', AMBIENTE.network],
    ['CHAIN_BACKEND', AMBIENTE.kind],
    ['CORE_URL', AMBIENTE.url],
  ] as const) {
    if (valor === undefined) delete process.env[nome]
    else process.env[nome] = valor
  }
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

/** Uma sonda que responde pelo host, sem sair para a rede. */
function sondaDe(resposta: Record<string, number | string>): SondaDeFonte {
  return async fonte => {
    const casa = Object.keys(resposta).find(chave => fonte.url.includes(chave))
    const valor = casa === undefined ? undefined : resposta[casa]
    if (typeof valor === 'number') return { ok: true, height: valor }
    return { ok: false, error: typeof valor === 'string' ? valor : 'sem resposta' }
  }
}

describe('a fonte do .env não é mais oferecida', () => {
  it('instância nova lista só as públicas prontas', async () => {
    // Esta é a configuração desta máquina, e era exatamente ela que aparecia
    // na tela de todo mundo como "configurado no servidor".
    process.env.CHAIN_BACKEND = 'core'
    process.env.CORE_URL = 'http://host.docker.internal:38332'

    const { userId } = await usuario()
    const fontes = await listarBackends(userId)

    expect(fontes.length).toBeGreaterThan(0)
    expect(fontes.map(f => f.url)).not.toContain('http://host.docker.internal:38332')
    expect(fontes.every(f => f.isPublic)).toBe(true)
  })

  it('as duas redes continuam existindo sem ninguém cadastrar nada', async () => {
    const { userId } = await usuario()
    const redes = new Set((await listarBackends(userId)).map(f => f.network))
    expect(redes.has('mainnet')).toBe(true)
    expect(redes.has('signet')).toBe(true)
  })
})

describe('varrerSaude', () => {
  it('mede a fonte nunca medida e guarda a altura', async () => {
    const { userId } = await usuario()
    const medidas = await varrerSaude({ sonda: sondaDe({ blockstream: 319_741 }) })
    expect(medidas).toBeGreaterThan(0)

    const fontes = await listarBackends(userId)
    const bs = fontes.find(f => f.url.includes('blockstream'))!
    expect(bs.status).toBe('up')
    expect(bs.height).toBe(319_741)
  })

  it('a fonte que não responde vira down, com o motivo à vista', async () => {
    const { userId } = await usuario()
    await varrerSaude({ sonda: sondaDe({ blockstream: 319_741 }) })

    const mempool = (await listarBackends(userId)).find(f => f.url.includes('mempool.space'))!
    expect(mempool.status).toBe('down')
    expect(mempool.statusError).toBeTruthy()
  })

  it('não remede o que acabou de medir', async () => {
    await usuario()
    await varrerSaude({ sonda: sondaDe({ blockstream: 1 }) })

    let chamadas = 0
    const contando: SondaDeFonte = async () => {
      chamadas += 1
      return { ok: true, height: 2 }
    }
    await varrerSaude({ sonda: contando })
    expect(chamadas).toBe(0)
  })

  it('remede quando a medição venceu', async () => {
    const { userId } = await usuario()
    await varrerSaude({ sonda: sondaDe({ blockstream: 1 }) })
    await pool.query("UPDATE backend_health SET checked_at = now() - interval '10 minutes'")

    await varrerSaude({ sonda: sondaDe({ blockstream: 999 }) })
    const bs = (await listarBackends(userId)).find(f => f.url.includes('blockstream'))!
    expect(bs.height).toBe(999)
  })
})

describe('listarBackends', () => {
  it('fonte nunca medida é unknown, e não down', async () => {
    // Esta é a diferença que impede a tela de mandar consertar uma fonte que
    // talvez esteja perfeitamente de pé.
    const { userId } = await usuario()
    expect((await listarBackends(userId)).every(f => f.status === 'unknown')).toBe(true)
  })
})

describe('fontePublicaPadrao', () => {
  it('prefere a que respondeu à que não respondeu', async () => {
    await usuario()
    await varrerSaude({ sonda: sondaDe({ blockstream: 319_741 }) })

    const padrao = await fontePublicaPadrao('signet')
    expect(padrao?.url).toContain('blockstream')
  })

  it('sem medição nenhuma, ainda devolve uma fonte', async () => {
    await usuario()
    expect(await fontePublicaPadrao('signet')).not.toBeNull()
  })
})

describe('POST /api/backends/:id/test', () => {
  it('guarda o que mediu, e a listagem passa a dizer o mesmo', async () => {
    const { app, cookie } = await logado()
    const criado = await app.inject({
      method: 'POST',
      url: '/api/backends',
      cookies: { sb_session: cookie },
      payload: { kind: 'electrum', url: 'electrum://127.0.0.1:1/', isPublic: false },
    })
    const id = criado.json().id

    const res = await app.inject({
      method: 'POST',
      url: `/api/backends/${id}/test`,
      cookies: { sb_session: cookie },
    })
    expect(res.json().ok).toBe(false)

    const { rows } = await pool.query(
      'SELECT ok, error FROM backend_health WHERE backend_id = $1',
      [id],
    )
    expect(rows[0]?.ok).toBe(false)
    expect(rows[0]?.error).toBeTruthy()
  })
})

describe('guardarMedicao', () => {
  it('sobrescreve a linha em vez de acumular histórico', async () => {
    const { userId } = await usuario()
    const alguma = (await listarBackends(userId))[0]!
    await guardarMedicao(alguma.id, { ok: false, error: 'primeira' })
    await guardarMedicao(alguma.id, { ok: true, height: 7 })

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM backend_health WHERE backend_id = $1',
      [alguma.id],
    )
    expect(rows[0]!.n).toBe(1)
  })
})

/** Cria o usuário direto no banco: estes casos não passam pela rota. */
async function usuario(): Promise<{ userId: number }> {
  // As públicas prontas são semeadas na primeira listagem; no processo de
  // verdade quem as semeia antes da primeira medição é o boot.
  await ensureBackendsPublicos()
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
    ['medidor@exemplo.com', 'x'],
  )
  return { userId: Number(rows[0]!.id) }
}

describe('a rede declarada contra a rede servida', () => {
  it('recusa a fonte que serve outra cadeia, nomeando as duas', async () => {
    // Medido em 28/08: um Fulcrum de signet cadastrado como mainnet respondeu
    // `responde, bloco 319.762` e ficou por isso mesmo. A altura prova que
    // alguém está do outro lado; ela não prova qual cadeia.
    const { userId } = await usuario()
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO backends (user_id, kind, url, is_public, network, preset)
       VALUES ($1, 'electrum', 'electrum://host.docker.internal:50001', false,
               'mainnet', 'fulcrum')
       RETURNING id`,
      [userId],
    )
    const id = Number(rows[0]!.id)

    const comoSignet: SondaDeFonte = async fonte =>
      fonte.id === id
        ? {
            ok: false,
            error:
              'esta fonte serve signet, e está cadastrada como mainnet. ' +
              'Cadastre-a de novo escolhendo signet',
          }
        : { ok: true, height: 1 }

    await varrerSaude({ sonda: comoSignet })

    const fonte = (await listarBackends(userId)).find(f => f.id === id)!
    expect(fonte.status).toBe('down')
    expect(fonte.statusError).toContain('serve signet')
    expect(fonte.statusError).toContain('cadastrada como mainnet')
  })
})

describe('redeDoGenesis', () => {
  it('reconhece as cadeias públicas pelo bloco 0', () => {
    expect(redeDoGenesis('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')).toBe('mainnet')
    expect(redeDoGenesis('00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6')).toBe('signet')
    expect(redeDoGenesis('000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943')).toBe('testnet')
  })

  it('genesis desconhecido é null, e não contradição', () => {
    // Signet é parametrizável: quem roda um signet próprio tem outro genesis,
    // e chamá-lo de rede errada seria afirmar o que não foi medido.
    expect(redeDoGenesis('00'.repeat(32))).toBeNull()
  })

  it('a cadeia do Core vira rede, e o que não se conhece vira null', () => {
    expect(redeDaChainDoCore('main')).toBe('mainnet')
    expect(redeDaChainDoCore('signet')).toBe('signet')
    expect(redeDaChainDoCore('test')).toBe('testnet')
    expect(redeDaChainDoCore('regtest')).toBeNull()
  })
})
