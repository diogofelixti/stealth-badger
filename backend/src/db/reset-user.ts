import { pool } from './pool'

export interface ResumoDeUsuario {
  id: number
  email: string
  wallets: number
  alerts: number
  createdAt: Date
}

/**
 * Quem existe, e o que cada um tem.
 *
 * Chamado sem argumento, o script mostra isto e não apaga nada: um reset que
 * começa apagando é um reset que apaga o usuário errado.
 */
export async function listarUsuarios(): Promise<ResumoDeUsuario[]> {
  const { rows } = await pool.query<{
    id: string
    email: string
    wallets: string
    alerts: string
    created_at: Date
  }>(
    `SELECT u.id, u.email, u.created_at,
            (SELECT count(*) FROM wallets w WHERE w.user_id = u.id) AS wallets,
            (SELECT count(*) FROM alerts a WHERE a.user_id = u.id) AS alerts
       FROM users u
      ORDER BY u.id`,
  )
  return rows.map(r => ({
    id: Number(r.id),
    email: r.email,
    wallets: Number(r.wallets),
    alerts: Number(r.alerts),
    createdAt: r.created_at,
  }))
}

/**
 * Apaga um usuário e tudo que cascateia dele.
 *
 * É a mesma exceção ao princípio 5 que a §7.1 da especificação registra:
 * append-only protege a história contra reescrita, não contra o dono pedindo
 * para esquecer. Aqui ela existe para o teste do zero — cadastrar de novo, sem
 * carregar o que a rodada anterior deixou.
 *
 * As **fontes globais da instância sobrevivem**: elas são configuração, não
 * dado de usuário, e apagá-las deixaria o primeiro acesso seguinte sem nada
 * para oferecer.
 */
export async function apagarUsuario(email: string): Promise<{
  wallets: number
  alerts: number
}> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email],
  )
  const usuario = rows[0]
  if (!usuario) {
    throw new Error(`usuário "${email}" não existe neste banco`)
  }

  const { rows: contagem } = await pool.query<{ wallets: string; alerts: string }>(
    `SELECT (SELECT count(*) FROM wallets WHERE user_id = $1) AS wallets,
            (SELECT count(*) FROM alerts WHERE user_id = $1) AS alerts`,
    [usuario.id],
  )

  await pool.query('DELETE FROM users WHERE id = $1', [usuario.id])

  return {
    wallets: Number(contagem[0]!.wallets),
    alerts: Number(contagem[0]!.alerts),
  }
}
