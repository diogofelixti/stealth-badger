import { pool } from './pool'
import { apagarUsuario, listarUsuarios } from './reset-user'

/**
 * `npm run reset:user -- <email>` — apaga um usuário para testar do zero.
 *
 * Sem argumento, lista e não apaga nada.
 */
async function main(): Promise<void> {
  const email = process.argv[2]

  if (!email) {
    const usuarios = await listarUsuarios()
    if (usuarios.length === 0) {
      console.log('nenhum usuário neste banco')
    } else {
      console.log('usuários neste banco:\n')
      for (const u of usuarios) {
        console.log(
          `  ${u.email}  ·  ${u.wallets} carteira(s)  ·  ${u.alerts} alerta(s)` +
            `  ·  desde ${u.createdAt.toISOString().slice(0, 10)}`,
        )
      }
      console.log('\napague um com:  npm run reset:user -- <email>')
    }
    await pool.end()
    return
  }

  const apagados = await apagarUsuario(email)
  console.log(
    `apagado: ${email} · ${apagados.wallets} carteira(s) e ${apagados.alerts} alerta(s) foram junto`,
  )
  console.log('as fontes globais da instância foram preservadas')
  await pool.end()
}

main().catch(async err => {
  console.error((err as Error).message)
  await pool.end()
  process.exitCode = 1
})
