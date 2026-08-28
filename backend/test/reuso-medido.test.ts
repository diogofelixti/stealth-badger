import { beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db/pool'
import { appendEvent } from '../src/events/log'
import { reusoMedido } from '../src/privacy/medido'
import { resetDb } from './helpers/db'

/**
 * O reuso de endereço, medido de primeira mão.
 *
 * ── O que estava errado ───────────────────────────────────────────────────
 * O painel lia `walletInfo.reusedAddresses` e `activeAddresses` **do scanner**.
 * Em 28/08 o scanner devolveu tudo zero — ele nem conseguia consultar a cadeia
 * — e a barra de reuso mostrou "0 de 0" numa carteira que tinha reuso.
 *
 * ── Por que o dado certo já estava aqui ───────────────────────────────────
 * O watchtower **detectou o reuso sozinho**, sem scanner nenhum: a mesma
 * carteira tinha dois alertas `address_reused`, gerados pela regra em
 * `alerts/rules.ts` a partir dos eventos que ele próprio gravou ao sincronizar.
 *
 * Ou seja: o painel ignorava o que a aplicação observou e repetia o que um
 * processo externo disse. Isso vale mesmo com o scanner funcionando — o número
 * medido na cadeia que o watchtower sincronizou é de primeira mão, e o do
 * scanner é de segunda.
 *
 * Medido no banco da máquina de desenvolvimento: 30 endereços ativos, 2
 * reusados, e exatamente 2 alertas de `address reuse`. Os dois caminhos
 * concordam porque leem o mesmo log.
 */
beforeEach(async () => {
  await resetDb()
})

async function carteira(): Promise<number> {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, is_admin, language)
     VALUES ('dono@exemplo.com', 'x', true, 'pt') RETURNING id`,
  )
  const { rows: b } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES (NULL, 'esplora', 'https://exemplo/api', true, 'signet') RETURNING id`,
  )
  const { rows: w } = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id, backend_id, label, kind, script_type, network,
                          sync_state, sync_progress, gap_limit)
     VALUES ($1, $2, 'Cofre', 'xpub', 'p2wpkh', 'signet', 'synced', 100, 20)
     RETURNING id`,
    [Number(u[0]!.id), Number(b[0]!.id)],
  )
  return Number(w[0]!.id)
}

async function endereco(walletId: number, indice: number): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO addresses (wallet_id, address, derivation_path, chain, idx, scripthash)
     VALUES ($1, $2, $3, 0, $4, $5) RETURNING id`,
    [
      walletId,
      'tb1qexemplo' + indice,
      "m/84'/1'/0'/0/" + indice,
      indice,
      'sh' + walletId + '-' + indice,
    ],
  )
  return Number(rows[0]!.id)
}

async function recebeu(walletId: number, addressId: number, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await appendEvent({
      walletId,
      type: 'utxo_created',
      height: 100 + i,
      blockHash: null,
      txid: `tx-${addressId}-${i}`,
      vout: 0,
      payload: { addressId, valueSats: 10_000 },
    })
  }
}

describe('reusoMedido', () => {
  it('conta endereço que recebeu duas vezes como reusado', async () => {
    const w = await carteira()
    const a = await endereco(w, 0)
    const b = await endereco(w, 1)
    await recebeu(w, a, 2)
    await recebeu(w, b, 1)

    expect(await reusoMedido(w)).toEqual({ activeAddresses: 2, reusedAddresses: 1 })
  })

  // Endereço derivado que nunca recebeu não é ativo. Contá-lo diluiria o
  // percentual de reuso: uma carteira com gap limit de 20 pareceria melhor do
  // que é só por ter endereços vazios à frente.
  it('endereço derivado e nunca usado não entra na conta', async () => {
    const w = await carteira()
    const a = await endereco(w, 0)
    await endereco(w, 1)
    await endereco(w, 2)
    await recebeu(w, a, 3)

    expect(await reusoMedido(w)).toEqual({ activeAddresses: 1, reusedAddresses: 1 })
  })

  // Reorg: o evento compensado deixa de contar. Sem isto, um endereço que
  // recebeu uma vez e sofreu reorg apareceria como reusado para sempre.
  it('evento revertido por reorg não conta como recebimento', async () => {
    const w = await carteira()
    const a = await endereco(w, 0)
    await recebeu(w, a, 2)
    // O compensatório é um evento de verdade: `rolled_back_by` aponta para ele,
    // e é assim que o reorg some sem nenhum DELETE no log append-only.
    const compensatorio = await appendEvent({
      walletId: w,
      type: 'reorg_detected',
      height: 100,
      blockHash: null,
      txid: null,
      vout: null,
      payload: {},
    })
    await pool.query(
      `UPDATE chain_events SET rolled_back_by = $2
        WHERE wallet_id = $1 AND type = 'utxo_created'
          AND id = (SELECT max(id) FROM chain_events
                     WHERE wallet_id = $1 AND type = 'utxo_created')`,
      [w, compensatorio],
    )

    expect(await reusoMedido(w)).toEqual({ activeAddresses: 1, reusedAddresses: 0 })
  })

  it('carteira sem movimento nenhum devolve zeros, e não quebra', async () => {
    const w = await carteira()
    await endereco(w, 0)

    expect(await reusoMedido(w)).toEqual({ activeAddresses: 0, reusedAddresses: 0 })
  })

  it('não mistura carteiras: cada uma conta a sua', async () => {
    const w1 = await carteira()
    const a1 = await endereco(w1, 0)
    await recebeu(w1, a1, 2)

    const { rows: w } = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id, backend_id, label, kind, script_type, network,
                            sync_state, sync_progress, gap_limit)
       SELECT user_id, backend_id, 'Outra', kind, script_type, network, sync_state,
              sync_progress, gap_limit FROM wallets WHERE id = $1 RETURNING id`,
      [w1],
    )
    const w2 = Number(w[0]!.id)
    const a2 = await endereco(w2, 0)
    await recebeu(w2, a2, 1)

    expect(await reusoMedido(w2)).toEqual({ activeAddresses: 1, reusedAddresses: 0 })
  })
})
