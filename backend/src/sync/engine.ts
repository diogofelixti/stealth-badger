import type { ChainAdapter } from '../chain/types'
import { open } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { activeEvents, appendEvent } from '../events/log'
import { projectWallet } from '../events/project'
import { descriptorFor } from '../privacy/scan'
import type { Network, ScriptType } from '../wallet/descriptor'
import { mapComLimite } from './concorrencia'
import {
  CONSULTAS_SIMULTANEAS,
  criarSonda,
  inalterado,
  scanGap,
  type ScannedAddress,
} from './gap'
import { detectReorg, rollbackFrom } from './reorg'

export interface SyncResult {
  newEvents: number[]
  reorgAt: number | null
  tipHeight: number
  /** endereços que o backend confirmou inalterados e não foram reconferidos */
  skipped: number
  /** endereços que o backend recusou servir; a carteira fica degradada */
  ilegiveis: string[]
}

interface WalletRow {
  id: string
  kind: 'xpub' | 'address'
  xpub_encrypted: Buffer | null
  script_type: ScriptType
  network: Network
  gap_limit: number
  sync_state: string
}

async function setState(
  walletId: number,
  state: string,
  extra: { progress?: number; height?: number; error?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE wallets SET sync_state = $2,
            sync_progress = COALESCE($3, sync_progress),
            sync_height   = COALESCE($4, sync_height),
            sync_error    = $5
      WHERE id = $1`,
    [walletId, state, extra.progress ?? null, extra.height ?? null, extra.error ?? null],
  )
}

/** status guardado na volta anterior, separado por cadeia e índice */
async function knownStatuses(
  walletId: number,
): Promise<Record<0 | 1, Map<number, string | null>>> {
  const { rows } = await pool.query<{ chain: number; idx: number; status: string | null }>(
    'SELECT chain, idx, status FROM addresses WHERE wallet_id = $1',
    [walletId],
  )
  const byChain: Record<0 | 1, Map<number, string | null>> = {
    0: new Map(),
    1: new Map(),
  }
  for (const r of rows) byChain[r.chain === 1 ? 1 : 0].set(r.idx, r.status)
  return byChain
}

/**
 * Confere os endereços já cadastrados, sem derivar nada.
 *
 * É o caminho do endereço avulso. Devolve a mesma forma que a varredura por
 * gap limit para que todo o resto do motor — persistência, eventos, projeção —
 * não precise saber a diferença.
 */
async function conferirRegistrados(
  walletId: number,
  adapter: ChainAdapter,
  conhecidos: Map<number, string | null>,
): Promise<ScannedAddress[]> {
  const { rows } = await pool.query<{
    chain: number
    idx: number
    address: string
    scripthash: string
    derivation_path: string
  }>(
    `SELECT chain, idx, address, scripthash, derivation_path
       FROM addresses WHERE wallet_id = $1 ORDER BY chain, idx`,
    [walletId],
  )

  const sonda = criarSonda(adapter)
  const encontrados: ScannedAddress[] = []

  for (const r of rows) {
    const { used, status } = await sonda(r.address)
    encontrados.push({
      chain: r.chain === 1 ? 1 : 0,
      index: r.idx,
      address: r.address,
      scripthash: r.scripthash,
      path: r.derivation_path,
      used,
      status,
      unchanged: inalterado(conhecidos.get(r.idx), status),
    })
  }

  return encontrados
}

/**
 * Sincroniza um backend que **segue descriptors** em vez de responder consultas
 * por endereço — Bitcoin Core watch-only, e o Floresta pelo mesmo caminho.
 *
 * O design chama os dois de "modelos incompatíveis": aqui não há gap limit a
 * sondar, porque quem sabe quais endereços existem é o nó. Ele reporta a
 * carteira inteira de uma vez, e é por isso que sumir da lista é evidência de
 * gasto — diferente do modelo de sondagem, onde só conta o endereço que foi
 * de fato perguntado.
 */
async function sincronizarPorRegistro(
  walletId: number,
  adapter: ChainAdapter,
  wallet: WalletRow,
): Promise<{ newEvents: number[] }> {
  if (!adapter.registerDescriptor || !adapter.getRegisteredUtxos) {
    throw new Error(
      'este adapter diz precisar de registro, mas não oferece registerDescriptor e ' +
        'getRegisteredUtxos — sem os dois o descriptor entra e nada volta',
    )
  }

  if (wallet.kind === 'address') {
    // Carteira de endereço avulso não tem xpub do qual montar descriptor de
    // cadeia — e não precisa: `addr(<endereço>)` é descriptor válido, e é o
    // que deixa alguém vigiar o endereço que publicou pelo próprio nó.
    const { rows } = await pool.query<{ address: string }>(
      'SELECT address FROM addresses WHERE wallet_id = $1 ORDER BY id LIMIT 1',
      [walletId],
    )
    const endereco = rows[0]?.address
    if (!endereco) {
      throw new Error(
        'carteira de endereço avulso sem endereço gravado: não há o que registrar',
      )
    }
    await adapter.registerDescriptor(`addr(${endereco})`)
  } else {
    const masterKey = process.env.MASTER_KEY_HEX
    if (!masterKey) throw new Error('MASTER_KEY_HEX ausente')
    const canonicalXpub = open(wallet.xpub_encrypted!, masterKey)

    // As duas cadeias: recebimento e troco. Registrar só a primeira deixaria o
    // troco invisível, e o saldo apareceria menor do que é.
    for (const chain of [0, 1] as const) {
      await adapter.registerDescriptor(
        descriptorFor(canonicalXpub + '/' + chain + '/*', wallet.script_type),
      )
    }
  }

  const doNo = await adapter.getRegisteredUtxos()

  // O endereço vem do nó, não da derivação: no modelo de registro o motor não
  // derivou nada, e sem gravá-lo o alerta não teria o que mostrar nem o coin
  // control a que se referir.
  const addressIds = new Map<string, number>()
  for (const u of doNo) {
    const [chainStr, idxStr] = u.derivationPath.split('/')
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash, is_used)
       VALUES ($1,$2,$3,$4,$5,'',true)
       ON CONFLICT (wallet_id, chain, idx) DO UPDATE SET is_used = true
       RETURNING id`,
      [walletId, Number(chainStr ?? 0) === 1 ? 1 : 0, Number(idxStr ?? 0), u.derivationPath, u.address],
    )
    addressIds.set(u.txid + ':' + u.vout, Number(rows[0]!.id))
  }

  const existing = await activeEvents(walletId)
  const conhecidos = new Set(
    existing.filter(e => e.type === 'utxo_created').map(e => e.txid + ':' + e.vout),
  )
  const jaGastos = new Set(
    existing.filter(e => e.type === 'utxo_spent').map(e => e.txid + ':' + e.vout),
  )

  const newEvents: number[] = []
  const vistos = new Set<string>()

  for (const u of doNo) {
    const key = u.txid + ':' + u.vout
    vistos.add(key)
    if (conhecidos.has(key)) continue
    newEvents.push(
      await appendEvent({
        walletId,
        type: 'utxo_created',
        height: u.height,
        blockHash: u.height !== null ? await adapter.blockHashAt(u.height) : null,
        txid: u.txid,
        vout: u.vout,
        payload: { addressId: addressIds.get(key)!, valueSats: u.value },
      }),
    )
  }

  for (const key of conhecidos) {
    if (vistos.has(key) || jaGastos.has(key)) continue
    const [txid, voutStr] = key.split(':')
    const vout = Number(voutStr)

    let gasto: Awaited<ReturnType<NonNullable<ChainAdapter['getOutspend']>>> = null
    if (adapter.getOutspend) {
      try {
        gasto = await adapter.getOutspend(txid!, vout)
      } catch (err) {
        console.error(
          'não foi possível saber quem gastou ' + key + ': ' + (err as Error).message,
        )
      }
    }

    newEvents.push(
      await appendEvent({
        walletId,
        type: 'utxo_spent',
        height: gasto?.height ?? null,
        blockHash: gasto?.blockHash ?? null,
        txid: txid!,
        vout,
        payload: { spentAtTxid: gasto?.spentByTxid ?? null },
      }),
    )
  }

  await projectWallet(walletId)
  return { newEvents }
}

export async function syncWallet(
  walletId: number,
  adapter: ChainAdapter,
): Promise<SyncResult> {
  const { rows } = await pool.query<WalletRow>(
    `SELECT id, kind, xpub_encrypted, script_type, network, gap_limit, sync_state
       FROM wallets WHERE id = $1`,
    [walletId],
  )
  const wallet = rows[0]
  if (!wallet) throw new Error('carteira ' + walletId + ' não encontrada')

  // Uma carteira já sincronizada não volta a "importando" a cada ciclo: o selo
  // ficaria piscando o tempo todo, e o usuário leria como se a carteira
  // estivesse sempre no meio de uma importação que nunca acaba.
  const reconferindo = wallet.sync_state === 'synced' || wallet.sync_state === 'degraded'
  const anunciar = async (progress: number): Promise<void> => {
    if (!reconferindo) await setState(walletId, 'importing', { progress })
  }

  try {
    await anunciar(0)

    const tipHeight = await adapter.tipHeight()
    const reorgAt = await detectReorg(walletId, adapter)
    if (reorgAt !== null) await rollbackFrom(walletId, reorgAt)

    // Os dois modelos de backend divergem aqui e não voltam a se encontrar:
    // um sonda endereços, o outro segue descriptors que registrou.
    if (adapter.capabilities().needsRegistration) {
      const { newEvents } = await sincronizarPorRegistro(walletId, adapter, wallet)
      await setState(walletId, 'synced', { progress: 100, height: tipHeight })
      return { newEvents, reorgAt, tipHeight, skipped: 0, ilegiveis: [] }
    }

    // Um reorg desfaz o que se sabia dos endereços atingidos: o status
    // guardado passa a descrever uma cadeia que não existe mais, e tudo
    // precisa ser reconferido.
    const conhecidos =
      reorgAt !== null
        ? { 0: new Map<number, string | null>(), 1: new Map<number, string | null>() }
        : await knownStatuses(walletId)

    const scanned: ScannedAddress[] = []
    if (wallet.kind === 'address') {
      // Endereço avulso não tem chave para abrir nem cadeia para derivar: a
      // lista de endereços já é o que foi cadastrado, e a varredura é só
      // perguntar o que existe em cada um.
      scanned.push(...(await conferirRegistrados(walletId, adapter, conhecidos[0])))
      await anunciar(90)
    } else {
      const masterKey = process.env.MASTER_KEY_HEX
      if (!masterKey) throw new Error('MASTER_KEY_HEX ausente')
      const canonicalXpub = open(wallet.xpub_encrypted!, masterKey)

      for (const chain of [0, 1] as const) {
        scanned.push(
          ...(await scanGap({
            adapter,
            canonicalXpub,
            scriptType: wallet.script_type,
            network: wallet.network,
            chain,
            gapLimit: wallet.gap_limit,
            knownStatus: conhecidos[chain],
          })),
        )
        await anunciar(chain === 0 ? 50 : 90)
      }
    }

    const addressIds = new Map<string, number>()
    for (const a of scanned) {
      const { rows: ar } = await pool.query<{ id: string }>(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash, is_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (wallet_id, chain, idx)
         DO UPDATE SET is_used = EXCLUDED.is_used
         RETURNING id`,
        [walletId, a.chain, a.index, a.path, a.address, a.scripthash, a.used],
      )
      addressIds.set(a.address, Number(ar[0]!.id))
    }

    const existing = await activeEvents(walletId)
    const known = new Map<string, number | null>()
    for (const e of existing) {
      if (e.type !== 'utxo_created') continue
      known.set(e.txid + ':' + e.vout, (e.payload as { addressId?: number }).addressId ?? null)
    }
    const spent = new Set(
      existing.filter(e => e.type === 'utxo_spent').map(e => e.txid + ':' + e.vout),
    )

    const newEvents: number[] = []
    const seen = new Set<string>()
    const consultados = new Set<number>()
    let skipped = 0

    if (!adapter.getUtxosForAddress) {
      throw new Error('adapter sem listagem de UTXO por endereço')
    }

    const ilegiveis: string[] = []
    let motivoDaRecusa: string | null = null

    const paraConsultar = scanned.filter(s => s.used && !s.unchanged)
    // O backend afirmou que nada mudou nos demais: pedir a lista de UTXO de
    // novo devolveria exatamente o que já está no log.
    skipped = scanned.filter(s => s.used && s.unchanged).length

    // As consultas correm em paralelo, com teto; o que vem depois é percorrido
    // na ordem dos endereços, e não na de quem respondeu antes. Cada UTXO vira
    // um evento no log append-only, e a ordem de quem respondeu primeiro faria
    // a mesma carteira gerar sequências diferentes a cada volta.
    const lidos = await mapComLimite(
      paraConsultar,
      CONSULTAS_SIMULTANEAS,
      async a => {
        // Um endereço que o backend recusa servir não invalida os outros. O
        // mempool.space, por exemplo, recusa `/utxo` de endereço com mais de
        // 500 saídas não gastas — recusa permanente, e nem defeito nosso nem
        // dele. Abortar a volta perderia o que dava para ver nos outros.
        try {
          return { a, utxos: await adapter.getUtxosForAddress!(a.address), erro: null }
        } catch (err) {
          return { a, utxos: null, erro: (err as Error).message }
        }
      },
    )

    for (const { a, utxos, erro: falha } of lidos) {
      if (utxos === null) {
        ilegiveis.push(a.address)
        motivoDaRecusa ??= falha
        continue
      }

      // Só depois de ler com sucesso: um endereço marcado como consultado sem
      // que a leitura tenha dado certo faria seus UTXOs conhecidos serem
      // declarados gastos, e o saldo sumiria sozinho.
      consultados.add(addressIds.get(a.address)!)

      for (const u of utxos) {
        const key = u.txid + ':' + u.vout
        seen.add(key)
        if (known.has(key)) continue
        newEvents.push(
          await appendEvent({
            walletId,
            type: 'utxo_created',
            height: u.height,
            blockHash: u.height !== null ? await adapter.blockHashAt(u.height) : null,
            txid: u.txid,
            vout: u.vout,
            payload: { addressId: addressIds.get(a.address)!, valueSats: u.value },
          }),
        )
      }
    }

    for (const [key, addressId] of known) {
      if (seen.has(key) || spent.has(key)) continue
      // Sumiço só é gasto quando o endereço foi de fato perguntado nesta volta.
      // Endereço pulado — ou fora da janela do gap — não é evidência de nada,
      // e tratá-lo como evidência esvaziaria a carteira inteira num ciclo
      // silencioso.
      if (addressId === null || !consultados.has(addressId)) continue
      const [txid, voutStr] = key.split(':')
      const vout = Number(voutStr)

      // Onde e por quem o UTXO foi gasto, quando o backend sabe dizer.
      //
      // Antes gravava a altura da ponta e "desconhecido". Altura errada num
      // log append-only é pior que altura ausente: a detecção de reorg compara
      // exatamente esses pares de altura e hash, e passaria a comparar um par
      // que nunca descreveu o gasto. `null` diz "não sei"; a altura da ponta
      // diria "sei, e foi aqui" sobre algo que ninguém verificou.
      let gasto: Awaited<ReturnType<NonNullable<ChainAdapter['getOutspend']>>> = null
      if (adapter.getOutspend) {
        try {
          gasto = await adapter.getOutspend(txid!, vout)
        } catch (err) {
          // Saber quem gastou é acessório: o gasto em si já foi observado, e
          // perder a volta inteira por causa do detalhe seria pior.
          console.error(
            'não foi possível saber quem gastou ' + key + ': ' + (err as Error).message,
          )
        }
      }

      newEvents.push(
        await appendEvent({
          walletId,
          type: 'utxo_spent',
          height: gasto?.height ?? null,
          blockHash: gasto?.blockHash ?? null,
          txid: txid!,
          vout,
          payload: { spentAtTxid: gasto?.spentByTxid ?? null },
        }),
      )
    }

    await projectWallet(walletId)

    // O status só é gravado depois que os eventos da volta entraram. Gravar
    // antes faria um ciclo que morre no meio deixar o endereço marcado como
    // conferido, e o ciclo seguinte o pularia para sempre. Endereço ilegível
    // fica sem status para ser tentado de novo na volta seguinte.
    const legiveis = new Set(ilegiveis)
    for (const a of scanned) {
      if (legiveis.has(a.address)) continue
      await pool.query(
        'UPDATE addresses SET status = $3 WHERE wallet_id = $1 AND address = $2',
        [walletId, a.address, a.status],
      )
    }

    if (ilegiveis.length > 0) {
      // `degraded` é o estado que o schema já previa para o que é vigiado em
      // parte: o watchtower continua funcionando, mas não sobre tudo.
      await setState(walletId, 'degraded', {
        progress: 100,
        height: tipHeight,
        error:
          ilegiveis.length +
          ' endereço(s) o backend recusou servir. ' +
          motivoDaRecusa,
      })
    } else {
      await setState(walletId, 'synced', { progress: 100, height: tipHeight })
    }

    return { newEvents, reorgAt, tipHeight, skipped, ilegiveis }
  } catch (err) {
    await setState(walletId, 'error', { error: (err as Error).message })
    throw err
  }
}
