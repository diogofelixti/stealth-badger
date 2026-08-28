import { connectionString, pool } from '../../src/db/pool'
import { migrate } from '../../src/db/migrate'

let ready = false

/**
 * `resetDb` esvazia o banco entre os casos. Apontada para o banco de
 * desenvolvimento, a suíte apaga as carteiras cadastradas e o log de eventos
 * já sincronizado — e o estrago só aparece depois, quando a tela abre vazia.
 *
 * Daí a exigência de que o nome do banco termine em `_test`. Não é burocracia:
 * é a única barreira entre rodar os testes e perder a demonstração.
 */
export function exigirBancoDeTeste(): void {
  const nome = (() => {
    try {
      return new URL(connectionString).pathname.replace(/^\//, '')
    } catch {
      return connectionString
    }
  })()

  if (nome.endsWith('_test')) return
  throw new Error(
    'os testes truncam o banco inteiro e recusam rodar em "' +
      nome +
      '", que não termina em _test. Aponte DATABASE_URL para um banco de teste ' +
      '(ex.: .../stealth_badger_test) antes de rodar a suíte.',
  )
}

/**
 * Esvazia por `DELETE`, e não por `TRUNCATE`.
 *
 * `TRUNCATE` cria um arquivo novo para cada relação e força `fsync` imediato
 * em cada um. Rodando no `beforeEach` de trinta arquivos, com o schema
 * crescendo, isso passou a estourar o limite de 10 s do hook em execuções
 * aleatórias — medido: 3 s só de espera em `IO / DataFileImmediateSync`, com o
 * pool ocioso e nenhuma contenção de lock. A suíte ficou intermitente, que é
 * pior que quebrada, porque some quando se vai olhar.
 *
 * `DELETE` não troca arquivo e não força sincronização. Com o volume de dados
 * de um teste, é mais rápido — e o cascata das chaves estrangeiras faz o
 * trabalho: apagar `users` leva junto sessão, carteira, endereço, evento,
 * UTXO, alerta, canal, análise de privacidade e marca de coin control. Só os
 * backends globais sobrevivem, porque têm `user_id` nulo de propósito.
 */
export async function resetDb(): Promise<void> {
  exigirBancoDeTeste()
  if (!ready) {
    await migrate()
    ready = true
  }

  await pool.query('DELETE FROM access_configs')
  await pool.query('DELETE FROM users')
  await pool.query('DELETE FROM backends')

  // Vários casos comparam ids literais, e um id que muda conforme a ordem de
  // execução transformaria a suíte em outra fonte de intermitência.
  await pool.query(`
    DO $$
    DECLARE s record;
    BEGIN
      FOR s IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
      LOOP
        EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', s.sequencename);
      END LOOP;
    END $$;
  `)
}
