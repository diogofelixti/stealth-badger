import type { FastifyInstance, FastifyReply } from 'fastify'
import { erro } from '../http/erro'
import type { ChainAdapter } from '../chain/types'
import { createAdapter, type BackendRow } from '../chain/adapter'
import { backendDoUsuario, ensureBackendGlobal } from '../chain/backends'
import { scanEmAndamento } from '../privacy/andamento'
import { loadConfig } from '../config'
import { seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { parseWatchAddress } from './address'
import { detectScriptType } from './detect'
import {
  parseExtendedKey,
  type KeyNetwork,
  type Network,
  type ScriptType,
} from './descriptor'

/**
 * A carteira como a tela a conhece: saldo, contagem, postura da fonte e a
 * última análise de privacidade. Mora numa constante porque a listagem e a
 * troca de fonte precisam devolver **a mesma coisa** — duas consultas
 * parecidas divergem no primeiro campo novo, e a tela passa a mostrar dado
 * diferente conforme o caminho que a trouxe.
 */
const SELECT_DA_CARTEIRA = `SELECT w.id, w.label, w.kind, w.script_type AS "scriptType", w.network,
              w.xpub_fingerprint AS fingerprint, w.sync_state AS "syncState",
              -- só o endereço avulso: uma carteira por chave tem dezenas, e
              -- eleger um deles seria mostrar um dado que não significa nada
              CASE WHEN w.kind = 'address' THEN (
                SELECT a.address FROM addresses a
                 WHERE a.wallet_id = w.id ORDER BY a.id LIMIT 1
              ) END AS address,
              w.sync_progress AS "syncProgress", w.sync_height AS "syncHeight",
              w.sync_error AS "syncError", w.archived_at AS "archivedAt",
              b.is_public AS "backendIsPublic", b.url AS "backendUrl",
              p.score AS "privacyScore", p.grade AS "privacyGrade",
              p.scanned_at AS "privacyScannedAt",
              COALESCE((
                SELECT sum(value_sats) FROM utxos u
                WHERE u.wallet_id = w.id AND NOT u.spent
              ), 0)::bigint AS "balanceSats",
              (
                SELECT count(*) FROM utxos u
                WHERE u.wallet_id = w.id AND NOT u.spent
              )::int AS "utxoCount",
              (
                SELECT count(*) FROM utxos u
                WHERE u.wallet_id = w.id AND NOT u.spent AND u.frozen
              )::int AS "frozenCount"
         FROM wallets w
         JOIN backends b ON b.id = w.backend_id
         -- LATERAL em vez de subconsulta por coluna: uma varredura só traz
         -- score, nota e data da mesma análise, e não de três diferentes
         LEFT JOIN LATERAL (
           SELECT score, grade, scanned_at FROM privacy_scans ps
            WHERE ps.wallet_id = w.id
            ORDER BY ps.scanned_at DESC, ps.id DESC LIMIT 1
         ) p ON true`

export interface WalletRouteOptions {
  adapterFactory?: (backend: BackendRow) => ChainAdapter
}

/**
 * Quando nem a chave nem a cadeia dizem o tipo, é carteira nova: sem
 * histórico não há o que detectar. Native segwit é o que qualquer carteira
 * criada hoje usa — e era assumir legado que produzia o saldo zero silencioso.
 */
const PADRAO_QUANDO_NAO_DA_PARA_SABER: ScriptType = 'p2wpkh'

interface CreateWalletBody {
  label: string
  /** chave estendida ou descriptor; exclusivo com `address` */
  key?: string
  /** endereço avulso a vigiar; exclusivo com `key` */
  address?: string
  gapLimit?: number
  /** backend escolhido na tela; ausente usa o configurado na instância */
  backendId?: number
  /**
   * Tipo de script declarado por quem cadastra. Só faz sentido com chave
   * estendida ambígua — `xpub`/`tpub` — e existe porque um backend de
   * registro não responde por endereço: sem ninguém a quem perguntar, o
   * palpite errado mostra saldo zero e nenhum erro.
   */
  scriptType?: string
}

/** Os tipos que o cadastro aceita declarar. Taproot ainda não deriva. */
const TIPOS_DECLARAVEIS: ScriptType[] = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh']

function redeEsperadaDaChave(network: Network): KeyNetwork {
  return network === 'mainnet' ? 'mainnet' : 'testnet'
}

function nomeDaRedeDaChave(keyNetwork: KeyNetwork): string {
  return keyNetwork === 'mainnet' ? 'mainnet' : 'testnet ou signet'
}

function hostDoBackend(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function mensagemDeRede(
  redeDaChave: string,
  redeDoBackend: Network,
  backend: BackendRow,
): string {
  return (
    'esta chave é de ' + redeDaChave +
    ', mas a fonte escolhida ' + hostDoBackend(backend.url) +
    ' vigia ' + redeDoBackend +
    '. Escolha uma fonte de ' + redeDaChave + ' ou cadastre outra.'
  )
}


export function registerWalletRoutes(
  app: FastifyInstance,
  opts: WalletRouteOptions = {},
): void {
  const adapterFactory = opts.adapterFactory ?? createAdapter

  app.post<{ Body: CreateWalletBody }>('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { label, key, address, gapLimit } = req.body
    if (!label?.trim()) {
      return reply.code(400).send(erro('wallet.labelRequired', 'rótulo obrigatório'))
    }

    // Exclusivos de propósito: aceitar os dois obrigaria a escolher um em
    // silêncio, e o usuário descobriria depois que vigiou o que não pediu.
    if (key?.trim() && address?.trim()) {
      return reply
        .code(400)
        .send(
          erro(
            'wallet.keyOrAddress',
            'informe uma chave estendida ou um endereço, não os dois',
          ),
        )
    }
    const declarado = req.body.scriptType?.trim()
    if (declarado !== undefined && declarado !== '') {
      if (!TIPOS_DECLARAVEIS.includes(declarado as ScriptType)) {
        return reply.code(400).send(
          erro(
            'wallet.unknownScriptType',
            'tipo de script desconhecido: ' + declarado + '. Use ' +
              TIPOS_DECLARAVEIS.join(', ') + '.',
            { tipo: declarado, aceitos: TIPOS_DECLARAVEIS.join(', ') },
          ),
        )
      }
      if (address?.trim()) {
        return reply.code(400).send(
          erro(
            'wallet.scriptTypeWithAddress',
            'o endereço já diz o tipo de script dele; declarar outro só ' +
              'poderia contradizê-lo',
          ),
        )
      }
    }

    if (!key?.trim() && !address?.trim()) {
      return reply
        .code(400)
        .send(
          erro(
            'wallet.keyOrAddressRequired',
            'informe a chave estendida da carteira ou um endereço a vigiar',
          ),
        )
    }

    const cfg = loadConfig()

    // O backend é resolvido antes da detecção de tipo de script porque é ele
    // que responderá a consulta: detectar por um backend e vigiar por outro
    // seria perguntar a cadeia em dois lugares sem motivo — e, se um deles for
    // público, expor os endereços a mais um observador do que o necessário.
    let backend: BackendRow & { id: number }
    if (req.body.backendId !== undefined) {
      const escolhido = await backendDoUsuario(
        req.userId,
        Number(req.body.backendId),
      )
      if (!escolhido) {
        return reply.code(400).send(
          erro(
            'wallet.backendNotFound',
            `backend ${req.body.backendId} não existe ou não é seu. ` +
              'Consulte GET /api/backends para os disponíveis.',
          ),
        )
      }
      backend = escolhido
    } else {
      backend = {
        id: await ensureBackendGlobal(cfg.network),
        kind: cfg.backendKind,
        url: cfg.backendUrl,
        isPublic: cfg.publicBackend,
        network: cfg.network,
      }
    }

    const network: Network = backend.network

    // Endereço avulso e carteira divergem só aqui: o que se guarda e o que
    // precisa ser derivado. Daqui para baixo o motor não sabe a diferença.
    let scriptType: ScriptType
    let cifrada: Buffer | null = null
    let fingerprint: string | null = null
    let enderecoAvulso: string | null = null

    if (address?.trim()) {
      let avulso
      try {
        avulso = parseWatchAddress(address, network)
      } catch (err) {
        const mensagem = (err as Error).message.replace(
          /este watchtower vigia [^.]+/i,
          'a fonte escolhida ' + hostDoBackend(backend.url) + ' vigia ' + network,
        )
        return reply.code(400).send(erro('wallet.networkMismatch', mensagem, {
          rede_do_backend: network,
          nome_do_backend: hostDoBackend(backend.url),
        }))
      }
      scriptType = avulso.scriptType
      enderecoAvulso = avulso.address
    } else {
      let parsed
      try {
        parsed = parseExtendedKey(key!)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }

      // Um backend Esplora atende uma rede só. Aceitar a chave da outra rede
      // faria o watchtower derivar endereços que o explorador recusa, e a
      // carteira morreria em `error` sem dizer o motivo. Melhor recusar aqui,
      // enquanto ainda dá para explicar. Signet e testnet compartilham as
      // mesmas version bytes, por isso a comparação é com `testnet`.
      const esperada: KeyNetwork = redeEsperadaDaChave(network)
      if (parsed.keyNetwork !== esperada) {
        const redeDaChave = nomeDaRedeDaChave(parsed.keyNetwork)
        return reply.code(400).send(
          erro(
            'wallet.networkMismatch',
            mensagemDeRede(redeDaChave, network, backend),
            {
              rede_da_chave: redeDaChave,
              rede_do_backend: network,
              nome_do_backend: hostDoBackend(backend.url),
            },
          ),
        )
      }

      // `xpub`/`tpub` não dizem o tipo de script: quem exporta por descriptor
      // usa a mesma codificação para legado, segwit e taproot. Assumir errado
      // não dá erro — a carteira sincroniza e mostra saldo zero para sempre.
      //
      // Descobrir exige perguntar à cadeia por endereço, e um backend de
      // registro não responde isso: com ele, o padrão é assumido e o usuário
      // informa o tipo se quiser outro.
      // As version bytes de `zpub`/`vpub`/`ypub` dizem o tipo. Aceitar uma
      // declaração que as contradiga seria escolher em silêncio qual das duas
      // vale — e a carteira derivaria endereços que ninguém tem.
      if (declarado && !parsed.scriptTypeAmbiguous && declarado !== parsed.scriptType) {
        return reply.code(400).send(
          erro(
            'wallet.scriptTypeConflict',
            'esta chave já declara ' + parsed.scriptType + ', e o cadastro ' +
              'pediu ' + declarado + '. Use a chave do tipo que quer vigiar.',
            { tipo_da_chave: parsed.scriptType, tipo_pedido: declarado },
          ),
        )
      }

      scriptType = (declarado as ScriptType) || parsed.scriptType
      // Sem declaração e com chave ambígua, pergunta-se à cadeia. Quando não
      // há a quem perguntar, o padrão é native segwit: assumir legado era o
      // que fazia uma carteira com saldo aparecer com zero.
      if (!declarado && parsed.scriptTypeAmbiguous) {
        scriptType =
          (await tipoPelaCadeia(adapterFactory, backend, parsed.canonicalXpub, network)) ??
          PADRAO_QUANDO_NAO_DA_PARA_SABER
      }

      cifrada = seal(parsed.canonicalXpub, cfg.masterKeyHex)
      fingerprint = parsed.fingerprint
    }

    const kind = enderecoAvulso ? 'address' : 'xpub'
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO wallets
         (user_id, label, kind, xpub_encrypted, xpub_fingerprint, script_type,
          network, gap_limit, backend_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        req.userId,
        label.trim(),
        kind,
        cifrada,
        fingerprint,
        scriptType,
        network,
        gapLimit ?? 20,
        backend.id,
      ],
    )
    const walletId = Number(rows[0]!.id)

    if (enderecoAvulso) {
      // Registrado já: sem isto o motor não teria o que conferir, porque não
      // há chave da qual derivar.
      const avulso = parseWatchAddress(enderecoAvulso, network)
      await pool.query(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
         VALUES ($1, 0, 0, '', $2, $3)`,
        [walletId, avulso.address, avulso.scripthash],
      )
    }

    return reply.code(201).send({
      id: walletId,
      label: label.trim(),
      kind,
      scriptType,
      network,
      fingerprint,
      address: enderecoAvulso,
      syncState: 'pending',
    })
  })

  app.get<{ Querystring: { archived?: string } }>('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    // Uma lista só, com uma chave: a tela pede as vigiadas ou as arquivadas,
    // e nunca as duas misturadas — arquivada no meio das outras seria a
    // carteira que o usuário tirou da frente voltando sozinha.
    const arquivadas = req.query.archived === 'true'

    const { rows } = await pool.query(
      SELECT_DA_CARTEIRA +
        ` WHERE w.user_id = $1 AND (w.archived_at IS NOT NULL) = $2
          ORDER BY w.created_at DESC`,
      [req.userId, arquivadas],
    )
    // Se a análise está correndo é estado de processo, não de banco: vem do
    // registro em memória para que a tela não precise inferir pelo relógio.
    return reply.send(
      rows.map(r => ({ ...r, privacyScanning: scanEmAndamento(Number(r.id)) })),
    )
  })

  /**
   * Trocar a fonte de consulta de uma carteira já cadastrada.
   *
   * Pode trocar de modelo de sincronização junto — sair da sondagem para o
   * registro, ou o contrário. O que **não** muda é o log: `chain_events` é
   * append-only, e um UTXO que existe continua existindo independentemente de
   * quem responde por ele. A projeção é reconstruída pelo ciclo seguinte, e
   * por isso a carteira volta a `pending`.
   */
  app.patch<{ Params: { id: string }; Body: { backendId?: number } }>(
    '/api/wallets/:id',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const alvo = await carteiraDoUsuario(Number(req.params.id), req.userId)
      if (!alvo) {
        return reply
          .code(404)
          .send(erro('wallet.notFound', 'esta carteira não existe, ou não é sua'))
      }

      const escolhido = await backendDoUsuario(req.userId, Number(req.body?.backendId))
      if (!escolhido) {
        // A mesma resposta para fonte inexistente e fonte de outro usuário:
        // distinguir as duas contaria quais ids existem no banco alheio.
        return reply
          .code(404)
          .send(erro('backend.notFound', 'esta fonte não existe, ou não é sua'))
      }

      if (escolhido.network !== alvo.network) {
        return reply.code(400).send(
          erro(
            'backend.networkMismatch',
            'esta carteira é de ' + alvo.network + ', e a fonte escolhida ' +
              hostDoBackend(escolhido.url) + ' vigia ' + escolhido.network,
            {
              rede_da_carteira: alvo.network,
              rede_do_backend: escolhido.network,
              nome_do_backend: hostDoBackend(escolhido.url),
            },
          ),
        )
      }

      // A projeção se refaz sozinha; o log não é tocado.
      await pool.query(
        `UPDATE wallets
            SET backend_id = $2, sync_state = 'pending', sync_progress = 0,
                sync_error = NULL
          WHERE id = $1`,
        [alvo.id, escolhido.id],
      )

      const { rows } = await pool.query(
        SELECT_DA_CARTEIRA + ' WHERE w.user_id = $1 AND w.id = $2',
        [req.userId, alvo.id],
      )
      return reply.send({ ...rows[0], privacyScanning: scanEmAndamento(alvo.id) })
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/wallets/:id/archive',
    async (req, reply) => arquivar(req, reply, true),
  )

  app.post<{ Params: { id: string } }>(
    '/api/wallets/:id/unarchive',
    async (req, reply) => arquivar(req, reply, false),
  )

  /**
   * Apagar de verdade.
   *
   * É a exceção deliberada ao princípio 5 — `chain_events` é append-only e
   * nunca sofre DELETE. A razão: append-only protege a história contra
   * reescrita, não contra o dono pedindo para esquecer. Um watchtower de
   * privacidade que não deixa alguém remover o próprio xpub do banco
   * contraria a própria tese.
   *
   * Por isso a porta é estreita: só carteira já arquivada, e só depois de
   * digitar o rótulo exato. Arquivar é a ação de todo dia; esta é a de uma
   * vez só.
   */
  app.delete<{ Params: { id: string }; Body: { confirm?: string } }>(
    '/api/wallets/:id',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const alvo = await carteiraDoUsuario(Number(req.params.id), req.userId)
      if (!alvo) {
        return reply
          .code(404)
          .send(erro('wallet.notFound', 'esta carteira não existe, ou não é sua'))
      }

      if (!alvo.archived_at) {
        return reply.code(409).send(
          erro(
            'wallet.mustArchiveFirst',
            'arquive a carteira antes de apagá-la. Arquivar já a tira da tela ' +
              'e do worker, e dá para voltar atrás',
          ),
        )
      }

      if ((req.body?.confirm ?? '') !== alvo.label) {
        return reply.code(400).send(
          erro(
            'wallet.confirmMismatch',
            'para apagar, digite o rótulo exato da carteira: ' + alvo.label,
            { rotulo: alvo.label },
          ),
        )
      }

      // O cascata de `wallets` leva junto endereços, UTXOs, eventos e alertas.
      await pool.query('DELETE FROM wallets WHERE id = $1', [alvo.id])
      return reply.code(204).send()
    },
  )

}

interface CarteiraDoDono {
  id: number
  label: string
  network: Network
  kind: 'xpub' | 'address'
  archived_at: Date | null
}

async function carteiraDoUsuario(
  id: number,
  userId: number,
): Promise<CarteiraDoDono | null> {
  if (!Number.isFinite(id)) return null
  const { rows } = await pool.query<CarteiraDoDono>(
    'SELECT id, label, network, kind, archived_at FROM wallets WHERE id = $1 AND user_id = $2',
    [id, userId],
  )
  return rows[0] ?? null
}

/**
 * Arquivar tira da lista e do ciclo do worker; desarquivar devolve as duas
 * coisas. O log não é tocado nem numa direção nem na outra.
 */
async function arquivar(
  req: { userId?: number | null; params: { id: string } },
  reply: FastifyReply,
  arquivada: boolean,
): Promise<unknown> {
  if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

  const alvo = await carteiraDoUsuario(Number(req.params.id), req.userId)
  if (!alvo) {
    return reply
      .code(404)
      .send(erro('wallet.notFound', 'esta carteira não existe, ou não é sua'))
  }

  const { rows } = await pool.query<{ id: string; label: string; archivedAt: Date | null }>(
    `UPDATE wallets SET archived_at = $2 WHERE id = $1
     RETURNING id, label, archived_at AS "archivedAt"`,
    [alvo.id, arquivada ? new Date() : null],
  )
  return reply.send(rows[0])
}

/**
 * Pergunta o tipo de script à cadeia, ou devolve `null` quando não há a quem
 * perguntar.
 *
 * São dois "não dá" diferentes, e os dois terminam aqui:
 *
 * - o backend responde por endereço, mas nenhum candidato tem histórico —
 *   `detectScriptType` devolve `null`, e é carteira nova;
 * - o backend **não pode nem ser montado para a consulta**: o adapter de
 *   Bitcoin Core exige saber de que carteira se trata, e no cadastro a
 *   carteira ainda não existe. Antes disto, esse caso derrubava o cadastro
 *   com 500 — medido em 27/08, cadastrando uma `tpub` pelo nó da máquina.
 */
async function tipoPelaCadeia(
  adapterFactory: (backend: BackendRow) => ChainAdapter,
  backend: BackendRow,
  canonicalXpub: string,
  network: Network,
): Promise<ScriptType | null> {
  let adapter: ChainAdapter
  try {
    adapter = adapterFactory(backend)
  } catch {
    return null
  }
  try {
    return await detectScriptType(canonicalXpub, network, adapter).catch(() => null)
  } finally {
    // adapter aberto só para esta consulta; com Electrum é um socket
    adapter.close?.()
  }
}
