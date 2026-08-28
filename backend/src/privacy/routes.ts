import type { FastifyInstance } from 'fastify'
import { loadConfig, type BackendKind } from '../config'
import {
  resolverFonteDeAnalise,
  type FonteDeAnalise,
  type SemFonteDeAnalise,
} from './fonte-de-analise'
import {
  candidatasDeAnalise,
  escolherFonteDeAnalise,
  fonteDeAnaliseEscolhida,
} from './analysis-source-store'
import { open } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { erro } from '../http/erro'
import type { Network, ScriptType } from '../wallet/descriptor'
import { deliver } from '../alerts/channels'
import { alertsForOrigin, alertsForScan } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import {
  addressScanEmAndamento,
  aguardarAddressScan,
  aguardarScan,
  aguardarTxScan,
  erroDoUltimoAddressScan,
  codigoDoUltimoScan,
  erroDoUltimoScan,
  erroDoUltimoTxScan,
  registrarAddressScan,
  registrarScan,
  registrarTxScan,
  scanEmAndamento,
  txScanEmAndamento,
} from './andamento'
import {
  aguardarOrigens,
  analisarOrigens,
  type TxScanContext,
  type TxScanner,
} from './origem-service'
import { scanAddress, scanBoltzmann, scanTransaction, scanWallet, type PrivacyScan } from './scan'
import { salvarAddressScan, ultimoAddressScan } from './address-store'
import { reusoMedido } from './medido'
import { historicoDeScans, salvarScan, ultimoScan } from './store'
import { salvarTxScanCompleto, ultimoTxScan } from './origem-store'

/**
 * Quantos pontos de queda de privacy score valem um aviso.
 *
 * Fixo, como o limiar de dust: uma tabela de regras por usuário é Plano 2. O
 * valor não é redondo por acaso — o scanner reavalia a carteira inteira a cada
 * execução, e variação de um ou dois pontos é ruído de heurística.
 */
const LIMIAR_DE_QUEDA = 5

export interface ScanContext {
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  backendUrl: string
  gapLimit: number
  /** o que a projeção local já contava, para desmentir um scanner cego */
  jaMedido: { utxos: number }
}

export type WalletScanner = (ctx: ScanContext) => Promise<PrivacyScan>

export interface AddressScanContext {
  address: string
  network: Network
  backendUrl: string
}

export type AddressScanner = (ctx: AddressScanContext) => Promise<PrivacyScan>

export interface PrivacyRouteOptions {
  scanner?: WalletScanner
  addressScanner?: AddressScanner
  txScanner?: TxScanner
  boltzmannScanner?: (ctx: TxScanContext) => Promise<Record<string, unknown>>
}

interface Linha {
  id: string
  kind: 'xpub' | 'address'
  xpub_encrypted: Buffer | null
  script_type: ScriptType
  network: Network
  gap_limit: number
  url: string
  /** o tipo da fonte de cadeia: é ele que decide se ela serve para analisar */
  backend_kind: BackendKind
  /** a postura dela, para o selo não mentir quando ela mesma analisa */
  backend_is_public: boolean
  address: string | null
}

interface LinhaEndereco {
  id: string
  wallet_id: string
  address: string
  network: Network
  url: string
  backend_kind: BackendKind
  backend_is_public: boolean
}

interface LinhaResumoEndereco {
  id: string
  address: string
  derivationPath: string
  used: boolean
  utxoCount: string
  balanceSats: string
  privacyScore: number | null
  privacyGrade: string | null
  privacyScannedAt: Date | null
}

/**
 * Quantos UTXOs não gastos a projeção local já conhece.
 *
 * É o número de primeira mão que permite recusar uma varredura cega: uma
 * carteira que o watchtower sincronizou com 32 UTXOs não é uma carteira vazia,
 * por mais que o scanner responda que é.
 */
async function utxosConhecidos(walletId: number): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    'SELECT count(*) AS n FROM utxos WHERE wallet_id = $1 AND NOT spent',
    [walletId],
  )
  return Number(rows[0]?.n ?? 0)
}

/** Carteira do usuário, ou `null` — inclusive quando é de outra pessoa. */
async function carteiraDoUsuario(
  userId: number,
  walletId: number,
): Promise<Linha | null> {
  const { rows } = await pool.query<Linha>(
    `SELECT w.id, w.kind, w.xpub_encrypted, w.script_type, w.network, w.gap_limit, b.url,
            b.kind AS backend_kind, b.is_public AS backend_is_public,
            (SELECT a.address FROM addresses a WHERE a.wallet_id = w.id ORDER BY a.id LIMIT 1)
              AS address
       FROM wallets w JOIN backends b ON b.id = w.backend_id
      WHERE w.id = $1 AND w.user_id = $2`,
    [walletId, userId],
  )
  return rows[0] ?? null
}

async function enderecoDoUsuario(
  userId: number,
  walletId: number,
  addressId: number,
): Promise<LinhaEndereco | null> {
  const { rows } = await pool.query<LinhaEndereco>(
    `SELECT a.id, a.wallet_id, a.address, w.network, b.url, b.kind AS backend_kind, b.is_public AS backend_is_public
       FROM addresses a
       JOIN wallets w ON w.id = a.wallet_id
       JOIN backends b ON b.id = w.backend_id
      WHERE a.id = $1 AND w.id = $2 AND w.user_id = $3`,
    [addressId, walletId, userId],
  )
  return rows[0] ?? null
}

async function enderecosUsadosDoUsuario(
  userId: number,
  walletId: number,
): Promise<LinhaEndereco[]> {
  const { rows } = await pool.query<LinhaEndereco>(
    `SELECT a.id, a.wallet_id, a.address, w.network, b.url, b.kind AS backend_kind, b.is_public AS backend_is_public
       FROM addresses a
       JOIN wallets w ON w.id = a.wallet_id
       JOIN backends b ON b.id = w.backend_id
      WHERE w.id = $1 AND w.user_id = $2
        AND (
          a.is_used
          OR EXISTS (
            SELECT 1 FROM chain_events e
             WHERE e.wallet_id = w.id
               AND (e.payload->>'addressId')::bigint = a.id
          )
        )
      ORDER BY a.chain, a.idx, a.id`,
    [walletId, userId],
  )
  return rows
}

async function resumoDeEnderecos(userId: number, walletId: number) {
  const { rows } = await pool.query<LinhaResumoEndereco>(
    `SELECT a.id, a.address, a.derivation_path AS "derivationPath",
            (
              a.is_used
              OR EXISTS (
                SELECT 1 FROM chain_events e
                 WHERE e.wallet_id = w.id
                   AND e.payload->>'addressId' = a.id::text
                   AND e.rolled_back_by IS NULL
              )
            ) AS used,
            count(u.txid) FILTER (WHERE u.txid IS NOT NULL AND NOT u.spent)::text AS "utxoCount",
            coalesce(sum(u.value_sats) FILTER (WHERE NOT u.spent), 0)::text AS "balanceSats",
            s.score AS "privacyScore", s.grade AS "privacyGrade", s.scanned_at AS "privacyScannedAt"
       FROM addresses a
       JOIN wallets w ON w.id = a.wallet_id
       LEFT JOIN utxos u ON u.wallet_id = a.wallet_id AND u.address_id = a.id
       LEFT JOIN LATERAL (
         SELECT score, grade, scanned_at
           FROM address_privacy_scans s
          WHERE s.wallet_id = a.wallet_id AND s.address_id = a.id
          ORDER BY scanned_at DESC
          LIMIT 1
       ) s ON true
      WHERE w.id = $1 AND w.user_id = $2
      GROUP BY a.id, a.address, a.derivation_path, a.is_used, w.id,
               s.score, s.grade, s.scanned_at
      ORDER BY a.chain, a.idx`,
    [walletId, userId],
  )
  return rows.map(r => ({
    id: Number(r.id),
    address: r.address,
    derivationPath: r.derivationPath,
    used: r.used,
    utxoCount: Number(r.utxoCount),
    balanceSats: r.balanceSats,
    privacyScore: r.privacyScore,
    privacyGrade: r.privacyGrade,
    privacyScannedAt: r.privacyScannedAt,
  }))
}

export function registerPrivacyRoutes(
  app: FastifyInstance,
  opts: PrivacyRouteOptions = {},
): void {
  const scanner = opts.scanner ?? ((ctx: ScanContext) => scanWallet(ctx))
  const addressScanner =
    opts.addressScanner ?? ((ctx: AddressScanContext) => scanAddress(ctx))
  const txScanner = opts.txScanner ?? ((ctx) => scanTransaction(ctx))
  const boltzmannScanner =
    opts.boltzmannScanner ?? ((ctx) => scanBoltzmann(ctx))
  /** Publica um alerta e o entrega pelos canais do usuário. */
  async function publicar(
    candidatos: ReturnType<typeof alertsForScan>,
    userId: number,
    walletId: number,
  ): Promise<void> {
    for (const candidato of candidatos) {
      const id = await saveAlert(candidato)
      if (id === null) continue
      await deliver(
        {
          id,
          walletId,
          type: candidato.type,
          severity: candidato.severity,
          params: candidato.params,
        },
        userId,
      )
    }
  }

  /**
   * A fonte de análise da carteira, ou a recusa com o motivo.
   *
   * Mora aqui e não dentro de cada rota porque as quatro entradas de análise —
   * carteira, endereço, varredura em lote e transação — precisam da mesma
   * resposta. Duas cópias divergiriam no primeiro backend novo.
   */
  async function analiseDe(
    userId: number,
    linha: {
      backend_kind: BackendKind
      backend_is_public?: boolean
      url: string
      network: Network
    },
  ): Promise<FonteDeAnalise | SemFonteDeAnalise> {
    return resolverFonteDeAnalise({
      backendKind: linha.backend_kind,
      backendUrl: linha.url,
      ...(linha.backend_is_public === undefined
        ? {}
        : { backendIsPublic: linha.backend_is_public }),
      network: linha.network,
      escolhida: await fonteDeAnaliseEscolhida(userId, linha.network),
    })
  }

  /**
   * A recusa que é um pedido de escolha.
   *
   * Vai com as candidatas dentro: a tela pergunta uma vez por rede, e sem a
   * lista ela teria de fazer uma segunda chamada só para desenhar o que a
   * primeira já sabia.
   */
  async function pedirEscolhaDeAnalise(userId: number, sem: SemFonteDeAnalise) {
    return erro(
      'privacy.needsAnalysisSource',
      'a análise profunda precisa de uma fonte tipo Esplora; escolha uma para esta rede',
      {
        chainKind: sem.chainKind,
        network: sem.network,
        candidates: await candidatasDeAnalise(userId, sem.network),
      },
    )
  }

  app.post<{ Params: { id: string } }>('/api/wallets/:id/scan', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const walletId = Number(req.params.id)
    const carteira = await carteiraDoUsuario(req.userId, walletId)
    if (!carteira) return reply.code(404).send({ error: 'carteira não encontrada' })

    // O scanner só fala REST no formato Esplora. Com a fonte de cadeia num Core
    // ou num Electrum, ele receberia um RPC e responderia `Not found` — que foi
    // o que aconteceu com dez de dez análises em 28/08. Recusar aqui, com o
    // motivo, é melhor que guardar um resultado vazio como se fosse resposta.
    const fonte = await analiseDe(req.userId, carteira)
    if (!fonte.disponivel) {
      return reply.code(409).send(await pedirEscolhaDeAnalise(req.userId, fonte))
    }

    // A análise leva mais de um minuto contra a cadeia real. Segurar a conexão
    // aberta entregaria a decisão a um timeout de proxy, e o usuário veria
    // "erro" numa análise que estava indo bem.
    const userId = req.userId
    registrarScan(walletId, async () => {
      // Lido antes de gravar: depois, a análise nova já é a última.
      const anterior = await ultimoScan(walletId)

      // Endereço avulso não tem chave para abrir nem descriptor para montar: a
      // análise dele é de outro tipo, e o scanner tem os dois.
      const resultado =
        carteira.kind === 'address'
          ? await addressScanner({
              address: carteira.address!,
              network: carteira.network,
              backendUrl: fonte.url,
            })
          : await scanner({
              canonicalXpub: open(carteira.xpub_encrypted!, loadConfig().masterKeyHex),
              scriptType: carteira.script_type,
              network: carteira.network,
              backendUrl: fonte.url,
              gapLimit: carteira.gap_limit,
              // Primeira mão contra segunda: o watchtower sincronizou esta
              // carteira e sabe quantos UTXOs ela tem. Se o scanner disser
              // que ela está vazia, quem está errado é o scanner.
              jaMedido: { utxos: await utxosConhecidos(walletId) },
            })
      const scanId = await salvarScan(walletId, resultado)

      await publicar(
        alertsForScan(
          anterior,
          { id: scanId, score: resultado.score, grade: resultado.grade },
          { userId, walletId, scanId, dropThreshold: LIMIAR_DE_QUEDA },
        ),
        userId,
        walletId,
      )

      // Mesmo caminho que o worker usa quando detecta transação nova: uma
      // função só, dois gatilhos.
      analisarOrigens({
        walletId,
        userId,
        network: carteira.network,
        backendUrl: fonte.url,
        ...(opts.txScanner ? { txScanner: opts.txScanner } : {}),
      })
    })

    return reply.code(202).send({ status: 'running' })
  })

  app.get<{ Params: { id: string } }>('/api/wallets/:id/privacy', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const walletId = Number(req.params.id)
    if (!(await carteiraDoUsuario(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }

    return reply.send({
      latest: await ultimoScan(walletId),
      history: (await historicoDeScans(walletId)).map(s => ({
        score: s.score,
        grade: s.grade,
        scannedAt: s.scannedAt,
      })),
      running: scanEmAndamento(walletId),
      error: erroDoUltimoScan(walletId),
      // O código viaja junto para a tela poder traduzir a recusa. Sem ele,
      // uma instância em inglês mostraria a mensagem em português.
      errorCode: codigoDoUltimoScan(walletId),
      /*
       * O que o watchtower mediu sozinho, e que a tela prefere ao do scanner.
       *
       * O reuso de endereço vinha de `walletInfo.reusedAddresses`, de segunda
       * mão. Em 28/08 o scanner devolveu tudo zero e a barra mostrou "0 de 0"
       * numa carteira com dois alertas de `address reuse` que o próprio
       * watchtower tinha gerado. O número de primeira mão sempre esteve aqui.
       */
      measured: await reusoMedido(walletId),
    })
  })

  app.get<{ Params: { id: string } }>('/api/wallets/:id/addresses', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const walletId = Number(req.params.id)
    if (!(await carteiraDoUsuario(req.userId, walletId))) {
      return reply.code(404).send({ error: 'carteira não encontrada' })
    }

    return reply.send(await resumoDeEnderecos(req.userId, walletId))
  })

  app.post<{ Params: { id: string; addressId: string } }>(
    '/api/wallets/:id/addresses/:addressId/privacy',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const walletId = Number(req.params.id)
      const addressId = Number(req.params.addressId)
      const endereco = await enderecoDoUsuario(req.userId, walletId, addressId)
      if (!endereco) return reply.code(404).send({ error: 'endereço não encontrado' })

      const fonte = await analiseDe(req.userId, endereco)
      if (!fonte.disponivel) {
        return reply.code(409).send(await pedirEscolhaDeAnalise(req.userId, fonte))
      }

      registrarAddressScan(addressId, async () => {
        const resultado = await addressScanner({
          address: endereco.address,
          network: endereco.network,
          backendUrl: fonte.url,
        })
        await salvarAddressScan(walletId, addressId, resultado)
      })

      return reply.code(202).send({ status: 'running' })
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/wallets/:id/addresses/privacy',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const walletId = Number(req.params.id)
      const daCarteira = await carteiraDoUsuario(req.userId, walletId)
      if (!daCarteira) {
        return reply.code(404).send({ error: 'carteira não encontrada' })
      }

      const fonte = await analiseDe(req.userId, daCarteira)
      if (!fonte.disponivel) {
        return reply.code(409).send(await pedirEscolhaDeAnalise(req.userId, fonte))
      }

      const enderecos = await enderecosUsadosDoUsuario(req.userId, walletId)
      for (const endereco of enderecos) {
        const addressId = Number(endereco.id)
        registrarAddressScan(addressId, async () => {
          const resultado = await addressScanner({
            address: endereco.address,
            network: endereco.network,
            backendUrl: fonte.url,
          })
          await salvarAddressScan(walletId, addressId, resultado)
        })
      }

      return reply.code(202).send({ status: 'running', addresses: enderecos.length })
    },
  )

  app.get<{ Params: { id: string; addressId: string } }>(
    '/api/wallets/:id/addresses/:addressId/privacy',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const walletId = Number(req.params.id)
      const addressId = Number(req.params.addressId)
      const endereco = await enderecoDoUsuario(req.userId, walletId, addressId)
      if (!endereco) return reply.code(404).send({ error: 'endereço não encontrado' })

      return reply.send({
        latest: await ultimoAddressScan(walletId, addressId),
        running: addressScanEmAndamento(addressId),
        error: erroDoUltimoAddressScan(addressId),
      })
    },
  )

  app.post<{ Params: { id: string; txid: string } }>(
    '/api/wallets/:id/tx/:txid/privacy',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const walletId = Number(req.params.id)
      const carteira = await carteiraDoUsuario(req.userId, walletId)
      if (!carteira) return reply.code(404).send({ error: 'carteira não encontrada' })

      const fonte = await analiseDe(req.userId, carteira)
      if (!fonte.disponivel) {
        return reply.code(409).send(await pedirEscolhaDeAnalise(req.userId, fonte))
      }

      registrarTxScan(walletId, req.params.txid, async () => {
        const resultado = await txScanner({
          txid: req.params.txid,
          network: carteira.network,
          backendUrl: fonte.url,
        })
        await salvarTxScanCompleto(walletId, req.params.txid, resultado)
        const boltzmann = await boltzmannScanner({
          txid: req.params.txid,
          network: carteira.network,
          backendUrl: fonte.url,
        })
        await salvarTxScanCompleto(walletId, req.params.txid, {
          ...resultado,
          boltzmann,
        })
      })

      return reply.code(202).send({ status: 'running' })
    },
  )

  app.get<{ Params: { id: string; txid: string } }>(
    '/api/wallets/:id/tx/:txid/privacy',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const walletId = Number(req.params.id)
      if (!(await carteiraDoUsuario(req.userId, walletId))) {
        return reply.code(404).send({ error: 'carteira não encontrada' })
      }

      return reply.send({
        latest: await ultimoTxScan(walletId, req.params.txid),
        running: txScanEmAndamento(walletId, req.params.txid),
        error: erroDoUltimoTxScan(walletId, req.params.txid),
      })
    },
  )

  /**
   * A fonte de análise de uma rede: o que existe para escolher, e o que está
   * valendo.
   *
   * Só fontes `esplora` aparecem, porque é o único formato que o scanner fala.
   * As da própria pessoa vêm antes das públicas: quem tem Esplora seu não deve
   * ter de procurá-lo abaixo de três de terceiros.
   */
  app.get<{ Querystring: { network?: string } }>(
    '/api/analysis-source',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const network = (req.query.network ?? loadConfig().network) as Network
      return reply.send({
        network,
        candidates: await candidatasDeAnalise(req.userId, network),
      })
    },
  )

  /**
   * Guardar a escolha, uma vez por rede.
   *
   * Escolher a fonte de análise é escolher **quem vê os endereços que você
   * consulta** — por isso a escolha é do usuário, e não da instância: num
   * painel multi-usuário, uma escolha de instância faria todo mundo herdar a
   * exposição que o admin aceitou para si.
   */
  app.put<{ Body: { network?: string; backendId?: number } }>(
    '/api/analysis-source',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      const network = (req.body?.network ?? loadConfig().network) as Network
      const backendId = Number(req.body?.backendId)
      if (!Number.isInteger(backendId)) {
        return reply
          .code(400)
          .send(erro('privacy.badAnalysisSource', 'informe a fonte escolhida'))
      }

      const r = await escolherFonteDeAnalise(req.userId, network, backendId)
      if (!r.ok) {
        // As três recusas são separadas de propósito: fonte que não é sua,
        // fonte que não fala REST e fonte de outra rede falham por motivos
        // diferentes, e um "fonte inválida" só manda procurar defeito.
        return reply
          .code(400)
          .send(erro('privacy.analysisSource.' + r.reason, 'fonte recusada: ' + r.reason))
      }

      return reply.send({
        network,
        candidates: await candidatasDeAnalise(req.userId, network),
      })
    },
  )
}

export { aguardarAddressScan, aguardarScan, aguardarOrigens, aguardarTxScan }
