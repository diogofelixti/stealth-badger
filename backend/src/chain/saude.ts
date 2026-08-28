import type { BackendKind } from '../config'
import { pool } from '../db/pool'
import type { Network } from '../wallet/descriptor'
import { createAdapter, credenciaisDoBackend } from './adapter'
import { criarRpc } from './core-rpc'
import {
  fraseDaRedeTrocada,
  redeDaChainDoCore,
  redeDoGenesis,
} from './rede-medida'

/**
 * O estado medido de uma fonte de consulta.
 *
 * Três estados, e não dois, pela mesma razão da página de acessos: `down` é a
 * sonda ter respondido que não, e `unknown` é a sonda não ter conseguido
 * perguntar ainda. Colapsar os dois esconderia uma fonte perfeitamente boa que
 * simplesmente nunca foi medida — e o seletor de carteira ficaria vazio numa
 * instância recém-subida.
 */
export type EstadoDaFonte = 'up' | 'down' | 'unknown'

export interface SaudeDaFonte {
  status: EstadoDaFonte
  height?: number
  error?: string
  checkedAt?: string
}

export interface LinhaDeFonte {
  id: number
  kind: BackendKind
  url: string
  isPublic: boolean
  network: Network
  credentialsEncrypted?: Buffer | null
}

export interface Medicao {
  ok: boolean
  height?: number
  error?: string
  /** a cadeia que a fonte serve de fato, quando o genesis é conhecido */
  chain?: Network
}

export type SondaDeFonte = (fonte: LinhaDeFonte) => Promise<Medicao>

/**
 * O prazo da sonda, que **não** é o prazo do adapter.
 *
 * `CORE_RPC_TIMEOUT_MS` é 600 s de propósito: um `rescanblockchain` leva
 * minutos e não pode ser cortado no meio. Medir se a fonte responde é outra
 * pergunta, e esperar dez minutos por ela deixaria a varredura inteira presa
 * numa fonte morta.
 */
const PRAZO_DA_SONDA_MS = 4_000

/** Depois disto, a medição é velha demais para ser afirmada de novo. */
const VALIDADE_MS = 5 * 60_000

/**
 * A altura da ponta é a prova mais barata de que a fonte serve: se ela
 * responde isso, responde o resto.
 */
export const sondarPelaPonta: SondaDeFonte = async fonte => {
  // O Bitcoin Core sai por fora do adapter, e não por preferência: o adapter
  // de Core exige saber **de qual carteira** se trata, porque cada carteira
  // vigiada tem a sua carteira de observação no nó. Uma sonda não tem carteira
  // nenhuma, e pedir uma seria inventar. `getblockchaininfo` não precisa de
  // uma: é a pergunta mais barata que prova que o nó está do outro lado.
  //
  // Isto também consertava, sem querer, o `Testar` de uma fonte Core: ele
  // montava o adapter do mesmo jeito e estourava antes de chamar o nó.
  if (fonte.kind === 'core') {
    try {
      const rpc = criarRpc({
        url: fonte.url,
        ...credenciaisDoBackend({
          kind: fonte.kind,
          url: fonte.url,
          isPublic: fonte.isPublic,
          network: fonte.network,
          credentialsEncrypted: fonte.credentialsEncrypted ?? null,
        }),
        timeoutMs: PRAZO_DA_SONDA_MS,
      })
      const info = (await comPrazo(
        rpc('getblockchaininfo'),
        PRAZO_DA_SONDA_MS,
      )) as { blocks?: number; chain?: string }

      const servida = info.chain ? redeDaChainDoCore(info.chain) : null
      if (servida && servida !== fonte.network) {
        return { ok: false, error: fraseDaRedeTrocada(servida, fonte.network) }
      }
      return {
        ok: true,
        ...(typeof info.blocks === 'number' ? { height: info.blocks } : {}),
        ...(servida ? { chain: servida } : {}),
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  let adapter
  try {
    adapter = createAdapter({
      kind: fonte.kind,
      url: fonte.url,
      isPublic: fonte.isPublic,
      network: fonte.network,
      credentialsEncrypted: fonte.credentialsEncrypted ?? null,
    })
  } catch (err) {
    // Montar o adapter também falha, e falhar aqui derrubava a varredura
    // inteira: `Promise.all` rejeita no primeiro que estoura, e as outras
    // fontes ficavam sem medição por causa de uma.
    return { ok: false, error: (err as Error).message }
  }

  try {
    const height = await comPrazo(adapter.tipHeight(), PRAZO_DA_SONDA_MS)

    // Responder a ponta prova que **alguém** está do outro lado; não prova
    // qual cadeia. O genesis prova, e as três fontes sabem devolvê-lo.
    const genesis = await comPrazo(adapter.blockHashAt(0), PRAZO_DA_SONDA_MS)
    const servida = redeDoGenesis(genesis)
    if (servida && servida !== fonte.network) {
      return { ok: false, error: fraseDaRedeTrocada(servida, fonte.network) }
    }

    return { ok: true, height, ...(servida ? { chain: servida } : {}) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    adapter.close?.()
  }
}

/**
 * Corta a espera sem cortar a chamada.
 *
 * O `fetch` continua correndo até o fim; o que este prazo garante é que a
 * varredura não fica parada esperando por ele. A promessa perdida é ignorada
 * de propósito — sem o `catch` vazio, uma fonte morta derrubaria o processo
 * com `unhandledRejection` alguns segundos depois de a sonda já ter desistido.
 */
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const relogio = setTimeout(
      () => reject(new Error('a fonte não respondeu em ' + ms / 1000 + 's')),
      ms,
    )
    promessa.then(
      valor => {
        clearTimeout(relogio)
        resolve(valor)
      },
      err => {
        clearTimeout(relogio)
        reject(err as Error)
      },
    )
  })
}

export async function guardarMedicao(backendId: number, m: Medicao): Promise<void> {
  await pool.query(
    `INSERT INTO backend_health (backend_id, ok, height, error, checked_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (backend_id) DO UPDATE
        SET ok = EXCLUDED.ok, height = EXCLUDED.height,
            error = EXCLUDED.error, checked_at = EXCLUDED.checked_at`,
    [backendId, m.ok, m.height ?? null, m.error ?? null],
  )
}

/**
 * Mede as fontes cuja última medição não existe ou já venceu.
 *
 * Em paralelo, e não em série: são cinco a dez fontes, e a mais lenta é a que
 * não responde — enfileirá-las somaria o prazo de cada uma.
 */
export async function varrerSaude(
  opts: { sonda?: SondaDeFonte; validadeMs?: number } = {},
): Promise<number> {
  const sonda = opts.sonda ?? sondarPelaPonta
  const validade = opts.validadeMs ?? VALIDADE_MS

  const { rows } = await pool.query<{
    id: string
    kind: BackendKind
    url: string
    is_public: boolean
    network: Network
    credentials_encrypted: Buffer | null
  }>(
    `SELECT b.id, b.kind, b.url, b.is_public, b.network, b.credentials_encrypted
       FROM backends b
       LEFT JOIN backend_health h ON h.backend_id = b.id
      WHERE h.checked_at IS NULL
         OR h.checked_at < now() - ($1::bigint || ' milliseconds')::interval
      ORDER BY b.id`,
    [validade],
  )

  await Promise.all(
    rows.map(async r => {
      const medicao = await sonda({
        id: Number(r.id),
        kind: r.kind,
        url: r.url,
        isPublic: r.is_public,
        network: r.network,
        credentialsEncrypted: r.credentials_encrypted,
      })
      await guardarMedicao(Number(r.id), medicao)
    }),
  )

  return rows.length
}

export async function saudeDasFontes(): Promise<Map<number, SaudeDaFonte>> {
  const { rows } = await pool.query<{
    backend_id: string
    ok: boolean
    height: string | null
    error: string | null
    checked_at: Date
  }>('SELECT backend_id, ok, height, error, checked_at FROM backend_health')

  const mapa = new Map<number, SaudeDaFonte>()
  for (const r of rows) {
    mapa.set(Number(r.backend_id), {
      status: r.ok ? 'up' : 'down',
      ...(r.height !== null ? { height: Number(r.height) } : {}),
      ...(r.error !== null ? { error: r.error } : {}),
      checkedAt: r.checked_at.toISOString(),
    })
  }
  return mapa
}
