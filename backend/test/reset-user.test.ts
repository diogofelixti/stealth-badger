import { beforeEach, describe, expect, it } from 'vitest'
import { apagarUsuario, listarUsuarios } from '../src/db/reset-user'
import { pool } from '../src/db/pool'
import { resetDb } from './helpers/db'

async function usuarioCom(email: string): Promise<number> {
  const { rows: u } = await pool.query<{ id: string }>(
    'INSERT INTO users (email,password_hash) VALUES ($1,$2) RETURNING id',
    [email, 'x'],
  )
  const id = Number(u[0]!.id)
  const { rows: b } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id,kind,url,network) VALUES ($1,'esplora','http://propria','signet') RETURNING id`,
    [id],
  )
  const { rows: w } = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','signet',$3) RETURNING id`,
    [id, Buffer.from([0]), b[0]!.id],
  )
  await pool.query(
    `INSERT INTO chain_events (wallet_id,type,payload,height) VALUES ($1,'utxo_created','{}'::jsonb,1)`,
    [w[0]!.id],
  )
  await pool.query(
    `INSERT INTO alerts (user_id,wallet_id,type,severity,params,dedupe_key)
     VALUES ($1,$2,'funds_received','info','{}'::jsonb,$3)`,
    [id, w[0]!.id, 'k-' + email],
  )
  return id
}

beforeEach(async () => {
  await resetDb()
})

describe('reset de usuário', () => {
  it('apaga o usuário e tudo que cascateia dele', async () => {
    await usuarioCom('some@exemplo.com')

    const apagados = await apagarUsuario('some@exemplo.com')

    expect(apagados.wallets).toBe(1)
    expect(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count)).toBe(0)
    expect(Number((await pool.query('SELECT count(*) FROM wallets')).rows[0].count)).toBe(0)
    expect(Number((await pool.query('SELECT count(*) FROM chain_events')).rows[0].count)).toBe(0)
    expect(Number((await pool.query('SELECT count(*) FROM alerts')).rows[0].count)).toBe(0)
  })

  // As fontes da instância são configuração, não dado de usuário: apagá-las
  // deixaria o primeiro acesso seguinte sem nada para oferecer.
  it('preserva as fontes globais da instância', async () => {
    await pool.query(
      `INSERT INTO backends (user_id,kind,url,network,is_public)
       VALUES (NULL,'esplora','https://mempool.space/signet/api','signet',true)`,
    )
    await usuarioCom('some@exemplo.com')

    await apagarUsuario('some@exemplo.com')

    const { rows } = await pool.query('SELECT count(*) FROM backends')
    expect(Number(rows[0].count)).toBe(1)
  })

  it('não apaga os outros usuários', async () => {
    await usuarioCom('some@exemplo.com')
    await usuarioCom('outro@exemplo.com')

    await apagarUsuario('some@exemplo.com')

    const { rows } = await pool.query<{ email: string }>('SELECT email FROM users')
    expect(rows.map(r => r.email)).toEqual(['outro@exemplo.com'])
  })

  it('e-mail que não existe é dito, e não apaga nada por engano', async () => {
    await usuarioCom('some@exemplo.com')

    await expect(apagarUsuario('ninguem@exemplo.com')).rejects.toThrow(/não existe/i)
    expect(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count)).toBe(1)
  })

  it('lista quem existe, com o que cada um tem', async () => {
    await usuarioCom('some@exemplo.com')

    const lista = await listarUsuarios()

    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ email: 'some@exemplo.com', wallets: 1, alerts: 1 })
  })
})
