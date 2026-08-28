import { describe, expect, it } from 'vitest'
import { CODIGO_VARREDURA_CEGA, scanWallet } from '../src/privacy/scan'

/**
 * "Nada encontrado" e "não consegui olhar" não são a mesma resposta.
 *
 * ── O que aconteceu em 28/08 ──────────────────────────────────────────────
 * A varredura da carteira de signet devolveu **score 70 · nota C** com este
 * `walletInfo`:
 *
 *   {"totalTxs":0,"dustUtxos":0,"totalUtxos":0,
 *    "totalBalance":0,"activeAddresses":0,"reusedAddresses":0}
 *
 * Zero achados. Numa carteira que o próprio watchtower já tinha sincronizado,
 * com **30 endereços, 32 UTXOs e 7.552.468 sats**.
 *
 * O scanner rodava contra o RPC do nó, não conseguia consultar nada, e
 * devolvia "não encontrei". O `scanWallet` só recusava quando faltava `score`
 * ou `walletInfo` — os dois vieram, então ele guardou.
 *
 * ── Por que isto é o defeito mais grave da lista ──────────────────────────
 * É o produto cometendo o que existe para denunciar. Um watchtower que não
 * distingue as duas respostas afirma o que não mediu, e o número que ele mostra
 * não significa nada — pior: parece significar.
 *
 * ── Como se descobre ──────────────────────────────────────────────────────
 * Com o que o watchtower já sabe de primeira mão. Ele sincronizou a carteira,
 * contou os UTXOs e guardou os eventos. Quando o scanner diz que a carteira
 * está vazia e a projeção local diz que não está, quem está errado é o scanner.
 */
const VAZIO = {
  version: '0.34.2',
  score: 70,
  grade: 'C',
  walletInfo: {
    activeAddresses: 0,
    totalTxs: 0,
    totalUtxos: 0,
    totalBalance: 0,
    reusedAddresses: 0,
    dustUtxos: 0,
  },
  findings: [],
}

const COM_HISTORICO = {
  ...VAZIO,
  score: 66,
  grade: 'C',
  walletInfo: {
    activeAddresses: 31,
    totalTxs: 30,
    totalUtxos: 32,
    totalBalance: 7552468,
    reusedAddresses: 2,
    dustUtxos: 1,
  },
}

const BASE = {
  canonicalXpub:
    'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
  scriptType: 'p2wpkh' as const,
  network: 'signet' as const,
  backendUrl: 'https://blockstream.info/signet/api',
}

const responde = (json: unknown) => async () => JSON.stringify(json)

describe('scanWallet', () => {
  it('recusa varredura vazia quando o watchtower já viu UTXO na carteira', async () => {
    await expect(
      scanWallet({ ...BASE, runner: responde(VAZIO), jaMedido: { utxos: 32 } }),
    ).rejects.toMatchObject({ code: CODIGO_VARREDURA_CEGA })
  })

  // A mensagem carrega os dois números, porque é a comparação entre eles que
  // prova a cegueira. "Falhou" sozinho manda procurar defeito em qualquer lugar.
  it('a recusa diz o que o watchtower viu e o que o scanner disse', async () => {
    const erro = await scanWallet({
      ...BASE,
      runner: responde(VAZIO),
      jaMedido: { utxos: 32 },
    }).catch((e: Error) => e)

    expect((erro as Error).message).toContain('32')
  })

  /*
   * O caso que impede a regra de virar zelo cego.
   *
   * Carteira recém-cadastrada, sem histórico nenhum: o scanner devolve tudo
   * zero, e desta vez ele está certo. Recusar aqui faria a análise de toda
   * carteira nova parecer quebrada.
   */
  it('carteira que o watchtower também vê vazia não é recusada', async () => {
    const r = await scanWallet({
      ...BASE,
      runner: responde(VAZIO),
      jaMedido: { utxos: 0 },
    })

    expect(r.score).toBe(70)
  })

  // Sem saber o que o watchtower mediu, não há como desmentir ninguém, e
  // inventar a recusa seria o mesmo defeito ao contrário.
  it('sem o que o watchtower mediu, guarda o que veio', async () => {
    const r = await scanWallet({ ...BASE, runner: responde(VAZIO) })

    expect(r.score).toBe(70)
  })

  it('varredura com histórico passa, como sempre passou', async () => {
    const r = await scanWallet({
      ...BASE,
      runner: responde(COM_HISTORICO),
      jaMedido: { utxos: 32 },
    })

    expect(r).toMatchObject({ score: 66, grade: 'C' })
    expect(r.walletInfo.totalUtxos).toBe(32)
  })

  // Um único sinal de vida no `walletInfo` já basta: a cegueira é o conjunto
  // inteiro zerado, e não um campo qualquer em zero.
  it('scanner que viu transações mas nenhum UTXO não é cegueira', async () => {
    const gastou = {
      ...VAZIO,
      walletInfo: { ...VAZIO.walletInfo, totalTxs: 12, activeAddresses: 8 },
    }

    const r = await scanWallet({
      ...BASE,
      runner: responde(gastou),
      jaMedido: { utxos: 0 },
    })

    expect(r.walletInfo.totalTxs).toBe(12)
  })

  it('continua recusando JSON sem score, como antes', async () => {
    await expect(
      scanWallet({ ...BASE, runner: responde({ walletInfo: {} }) }),
    ).rejects.toThrow(/score/)
  })
})
