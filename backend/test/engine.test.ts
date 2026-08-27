import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainAdapter, TxRef, Utxo } from '../src/chain/types'
import { seal } from '../src/crypto/secretbox'
import { pool } from '../src/db/pool'
import { walletBalance } from '../src/events/project'
import { syncWallet } from '../src/sync/engine'
import { deriveAddress } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { resetDb } from './helpers/db'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const KEY = 'c'.repeat(64)

function adapterWith(
  history: Record<string, TxRef[]>,
  utxos: Record<string, Utxo[]>,
  tip = 200,
): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => tip,
    blockHashAt: async (h: number) => 'h' + h,
    getHistoryForAddress: async (a: string) => history[a] ?? [],
    getUtxosForAddress: async (a: string) => utxos[a] ?? [],
  }
}

let walletId: number
let firstAddress: string

beforeEach(async () => {
  await resetDb()
  process.env.MASTER_KEY_HEX = KEY
  const parsed = parseExtendedKey(ZPUB)
  firstAddress = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`,
  )
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','mainnet') RETURNING id`,
  )
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','mainnet',3,$3) RETURNING id`,
    [u.rows[0]!.id, seal(parsed.canonicalXpub, KEY), b.rows[0]!.id],
  )
  walletId = Number(w.rows[0]!.id)
})

describe('syncWallet', () => {
  it('grava os endereços derivados e marca a carteira como sincronizada', async () => {
    await syncWallet(walletId, adapterWith({}, {}))
    const { rows } = await pool.query('SELECT * FROM addresses WHERE wallet_id = $1', [walletId])
    expect(rows.length).toBeGreaterThan(0)

    const w = await pool.query<{ sync_state: string }>(
      'SELECT sync_state FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(w.rows[0]!.sync_state).toBe('synced')
  })

  it('cria evento e projeta saldo ao encontrar UTXO', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    const result = await syncWallet(walletId, adapter)
    expect(result.newEvents).toHaveLength(1)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('é idempotente — sincronizar de novo não duplica eventos', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, adapter)
    const second = await syncWallet(walletId, adapter)

    expect(second.newEvents).toHaveLength(0)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('emite utxo_spent quando o UTXO some da lista', async () => {
    const comUtxo = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, comUtxo)

    const gasto = adapterWith(
      { [firstAddress]: [
        { txid: 'aa', height: 100, blockHash: 'h100' },
        { txid: 'zz', height: 105, blockHash: 'h105' },
      ] },
      { [firstAddress]: [] },
    )
    await syncWallet(walletId, gasto)
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('registra estado de erro em vez de estourar quando o backend falha', async () => {
    const quebrado: ChainAdapter = {
      ...adapterWith({}, {}),
      tipHeight: async () => {
        throw new Error('explorador fora do ar')
      },
    }
    await expect(syncWallet(walletId, quebrado)).rejects.toThrow()
    const w = await pool.query<{ sync_state: string; sync_error: string }>(
      'SELECT sync_state, sync_error FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(w.rows[0]!.sync_state).toBe('error')
    expect(w.rows[0]!.sync_error).toMatch(/fora do ar/)
  })
})

interface AdapterIncremental extends ChainAdapter {
  utxoPedidos: string[]
  estadoVisto: string | null
}

function adapterIncremental(
  status: Record<string, string>,
  utxos: Record<string, Utxo[]>,
  tip = 200,
): AdapterIncremental {
  const a: AdapterIncremental = {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    // a varredura já começou quando o adapter é chamado: é o ponto certo para
    // espiar o selo que a interface mostraria durante a reconferência
    tipHeight: async () => {
      const { rows } = await pool.query<{ sync_state: string }>(
        'SELECT sync_state FROM wallets WHERE id = $1',
        [walletId],
      )
      a.estadoVisto = rows[0]!.sync_state
      return tip
    },
    blockHashAt: async (h: number) => 'h' + h,
    getAddressStatus: async (addr: string) => ({
      used: status[addr] !== undefined,
      status: status[addr] ?? '0:0:0:0:0:0',
    }),
    getUtxosForAddress: async (addr: string) => {
      a.utxoPedidos.push(addr)
      return utxos[addr] ?? []
    },
    utxoPedidos: [],
    estadoVisto: null,
  }
  return a
}

describe('syncWallet incremental', () => {
  function comSaldo(status: string, tip = 200): AdapterIncremental {
    return adapterIncremental(
      { [firstAddress]: status },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
      tip,
    )
  }

  it('não repete a consulta de UTXO do endereço cujo status não mudou', async () => {
    await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))
    const segunda = comSaldo('1:1:0:0:0:0')
    await syncWallet(walletId, segunda)
    expect(segunda.utxoPedidos).toEqual([])
  })

  it('não dá o UTXO por gasto só porque deixou de consultar o endereço', async () => {
    await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))
    const segunda = await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))

    expect(segunda.newEvents).toHaveLength(0)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('volta a conferir o endereço assim que o status muda', async () => {
    await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))

    const gasto = adapterIncremental({ [firstAddress]: '2:1:1:0:0:0' }, {})
    await syncWallet(walletId, gasto)

    expect(gasto.utxoPedidos).toContain(firstAddress)
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('anuncia importação na primeira varredura da carteira', async () => {
    const primeira = comSaldo('1:1:0:0:0:0')
    await syncWallet(walletId, primeira)
    expect(primeira.estadoVisto).toBe('importing')
  })

  it('mantém a carteira sincronizada enquanto apenas reconfere', async () => {
    await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))
    const segunda = comSaldo('1:1:0:0:0:0')
    await syncWallet(walletId, segunda)
    expect(segunda.estadoVisto).toBe('synced')
  })

  it('guarda o status de cada endereço para a volta seguinte', async () => {
    await syncWallet(walletId, comSaldo('1:1:0:0:0:0'))
    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM addresses WHERE wallet_id = $1 AND address = $2',
      [walletId, firstAddress],
    )
    expect(rows[0]!.status).toBe('1:1:0:0:0:0')
  })
})

describe('syncWallet de endereço avulso', () => {
  let enderecoId: number

  async function carteiraDeEndereco(endereco: string): Promise<number> {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email,password_hash) VALUES ('avulso@b.c','x') RETURNING id`,
    )
    const b = await pool.query<{ id: string }>(
      `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://y','mainnet') RETURNING id`,
    )
    const w = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id,label,kind,xpub_encrypted,xpub_fingerprint,script_type,
                            network,gap_limit,backend_id)
       VALUES ($1,'Doação','address',NULL,NULL,'p2wpkh','mainnet',20,$2) RETURNING id`,
      [u.rows[0]!.id, b.rows[0]!.id],
    )
    const id = Number(w.rows[0]!.id)
    const a = await pool.query<{ id: string }>(
      `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
       VALUES ($1,0,0,'',$2,'ff') RETURNING id`,
      [id, endereco],
    )
    enderecoId = Number(a.rows[0]!.id)
    return id
  }

  const ENDERECO = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

  // Sem xpub não há o que derivar. A varredura por gap limit abriria a chave
  // cifrada, que não existe, e a sincronização morreria antes de começar.
  it('sincroniza sem abrir chave nenhuma', async () => {
    const id = await carteiraDeEndereco(ENDERECO)
    const adapter = adapterWith(
      { [ENDERECO]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [ENDERECO]: [{ txid: 'aa', vout: 0, value: 4200, height: 100 }] },
    )
    const r = await syncWallet(id, adapter)
    expect(r.newEvents).toHaveLength(1)
    expect(await walletBalance(id)).toBe(4200)
  })

  it('não deriva endereço nenhum além do registrado', async () => {
    const id = await carteiraDeEndereco(ENDERECO)
    const consultados: string[] = []
    const adapter: ChainAdapter = {
      ...adapterWith({}, {}),
      getHistoryForAddress: async (a: string) => {
        consultados.push(a)
        return []
      },
    }
    await syncWallet(id, adapter)
    expect(consultados).toEqual([ENDERECO])
  })

  it('marca a carteira como sincronizada, como qualquer outra', async () => {
    const id = await carteiraDeEndereco(ENDERECO)
    await syncWallet(id, adapterWith({}, {}))
    const { rows } = await pool.query<{ sync_state: string }>(
      'SELECT sync_state FROM wallets WHERE id = $1',
      [id],
    )
    expect(rows[0]!.sync_state).toBe('synced')
  })

  it('emite utxo_spent quando o UTXO do endereço some', async () => {
    const id = await carteiraDeEndereco(ENDERECO)
    await syncWallet(
      id,
      adapterWith(
        { [ENDERECO]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
        { [ENDERECO]: [{ txid: 'aa', vout: 0, value: 4200, height: 100 }] },
      ),
    )
    await syncWallet(
      id,
      adapterWith({ [ENDERECO]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] }, {}),
    )
    expect(await walletBalance(id)).toBe(0)
    expect(enderecoId).toBeGreaterThan(0)
  })
})

describe('endereço que o backend não sabe servir', () => {
  // Caso real: o mempool.space recusa `/utxo` de endereço com mais de 500
  // saídas não gastas — "Too many unspent transaction outputs". A recusa é
  // permanente e não é defeito nem nosso nem dele.
  //
  // Hoje isso derruba a carteira inteira para `error`, e ela repete a falha a
  // cada trinta segundos para sempre. O schema já prevê `degraded` justamente
  // para o que é vigiado em parte.
  function adapterQueRecusaUtxo(recusados: Set<string>): ChainAdapter {
    return {
      ...adapterWith({ [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] }, {}),
      getUtxosForAddress: async (a: string) => {
        if (recusados.has(a)) {
          throw new Error('Esplora respondeu 400 em /address/' + a + '/utxo: Too many unspent')
        }
        return a === firstAddress ? [{ txid: 'aa', vout: 0, value: 900, height: 100 }] : []
      },
    }
  }

  it('marca a carteira como degradada, e não como quebrada', async () => {
    await syncWallet(walletId, adapterQueRecusaUtxo(new Set([firstAddress])))
    const { rows } = await pool.query<{ sync_state: string; sync_error: string }>(
      'SELECT sync_state, sync_error FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(rows[0]!.sync_state).toBe('degraded')
    expect(rows[0]!.sync_error).toMatch(/Too many unspent/)
  })

  // Uma carteira com trinta endereços, um deles ilegível, continua valendo
  // pelos outros vinte e nove. Abortar tudo perderia o que dava para ver.
  it('continua com os outros endereços em vez de abortar a volta', async () => {
    const outro = deriveAddress(
      parseExtendedKey(ZPUB).canonicalXpub, 'p2wpkh', 'mainnet', 0, 1,
    ).address
    const adapter: ChainAdapter = {
      ...adapterWith(
        {
          [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }],
          [outro]: [{ txid: 'bb', height: 100, blockHash: 'h100' }],
        },
        {},
      ),
      getUtxosForAddress: async (a: string) => {
        if (a === firstAddress) throw new Error('Esplora respondeu 400: Too many unspent')
        return a === outro ? [{ txid: 'bb', vout: 0, value: 700, height: 100 }] : []
      },
    }
    await syncWallet(walletId, adapter)
    expect(await walletBalance(walletId)).toBe(700)
  })

  // O endereço ilegível não pode ser lido como "sem UTXO nenhum": os UTXOs
  // conhecidos dele seriam declarados gastos, e o saldo sumiria sozinho.
  it('não declara gasto o UTXO de endereço que não conseguiu ler', async () => {
    await syncWallet(
      walletId,
      adapterWith(
        { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
        { [firstAddress]: [{ txid: 'aa', vout: 0, value: 5000, height: 100 }] },
      ),
    )
    expect(await walletBalance(walletId)).toBe(5000)

    await syncWallet(walletId, adapterQueRecusaUtxo(new Set([firstAddress])))
    expect(await walletBalance(walletId)).toBe(5000)
  })

  it('volta para sincronizada quando o endereço passa a ser legível', async () => {
    await syncWallet(walletId, adapterQueRecusaUtxo(new Set([firstAddress])))
    await syncWallet(
      walletId,
      adapterWith({ [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] }, {}),
    )
    const { rows } = await pool.query<{ sync_state: string; sync_error: string | null }>(
      'SELECT sync_state, sync_error FROM wallets WHERE id = $1',
      [walletId],
    )
    expect(rows[0]!.sync_state).toBe('synced')
    expect(rows[0]!.sync_error).toBeNull()
  })
})

describe('quando o UTXO é gasto', () => {
  async function comSaldo(): Promise<void> {
    await syncWallet(
      walletId,
      adapterWith(
        { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
        { [firstAddress]: [{ txid: 'aa', vout: 0, value: 5000, height: 100 }] },
      ),
    )
  }

  function adapterSemUtxo(over: Partial<ChainAdapter> = {}): ChainAdapter {
    return {
      ...adapterWith({ [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] }, {}),
      ...over,
    }
  }

  async function eventoDeGasto() {
    const { rows } = await pool.query<{
      height: number | null
      block_hash: string | null
      payload: { spentAtTxid?: string | null }
    }>(
      `SELECT height, block_hash, payload FROM chain_events
        WHERE wallet_id = $1 AND type = 'utxo_spent' ORDER BY id DESC LIMIT 1`,
      [walletId],
    )
    return rows[0]!
  }

  // O evento gravava a altura da ponta e "desconhecido". Altura errada num log
  // append-only é pior que altura ausente: a detecção de reorg compara
  // exatamente esses pares de altura e hash, e passaria a comparar um par que
  // nunca descreveu o gasto.
  it('registra quem gastou e em que altura, quando o backend sabe dizer', async () => {
    await comSaldo()
    await syncWallet(
      walletId,
      adapterSemUtxo({
        getOutspend: async () => ({
          spentByTxid: 'zz'.repeat(32),
          height: 105,
          blockHash: 'h105-de-verdade',
        }),
      }),
    )
    const e = await eventoDeGasto()
    expect(e.height).toBe(105)
    expect(e.block_hash).toBe('h105-de-verdade')
    expect(e.payload.spentAtTxid).toBe('zz'.repeat(32))
  })

  // Ignorância registrada como ignorância. Um `null` diz "não sei"; a altura
  // da ponta diria "sei, e foi aqui" sobre algo que ninguém verificou.
  it('não inventa altura quando o backend não sabe dizer', async () => {
    await comSaldo()
    await syncWallet(walletId, adapterSemUtxo())
    const e = await eventoDeGasto()
    expect(e.height).toBeNull()
    expect(e.block_hash).toBeNull()
    expect(e.payload.spentAtTxid).toBeNull()
  })

  it('não deixa a consulta de gasto derrubar a sincronização', async () => {
    await comSaldo()
    await syncWallet(
      walletId,
      adapterSemUtxo({
        getOutspend: async () => {
          throw new Error('explorador recusou')
        },
      }),
    )
    const e = await eventoDeGasto()
    expect(e.height).toBeNull()
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('registra o gasto que ainda está no mempool, sem altura', async () => {
    await comSaldo()
    await syncWallet(
      walletId,
      adapterSemUtxo({
        getOutspend: async () => ({
          spentByTxid: 'yy'.repeat(32),
          height: null,
          blockHash: null,
        }),
      }),
    )
    const e = await eventoDeGasto()
    expect(e.height).toBeNull()
    expect(e.payload.spentAtTxid).toBe('yy'.repeat(32))
  })
})

describe('busca de UTXO em paralelo', () => {
  it('consulta os UTXOs de vários endereços ao mesmo tempo', async () => {
    const parsed = parseExtendedKey(ZPUB)
    const enderecos = Array.from(
      { length: 6 },
      (_, i) => deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, i).address,
    )
    const historico = Object.fromEntries(
      enderecos.map(a => [a, [{ txid: 'aa', height: 100, blockHash: 'h100' }]]),
    )

    let correndo = 0
    let pico = 0
    const adapter: ChainAdapter = {
      ...adapterWith(historico, {}),
      getUtxosForAddress: async () => {
        correndo += 1
        pico = Math.max(pico, correndo)
        await new Promise(pronto => setTimeout(pronto, 10))
        correndo -= 1
        return []
      },
    }

    await syncWallet(walletId, adapter)
    expect(pico).toBeGreaterThan(1)
    expect(pico).toBeLessThanOrEqual(5)
  })

  // Cada UTXO vira um evento com o endereço de onde veio. Se a ordem das
  // respostas mandasse, o mesmo conjunto de UTXOs geraria eventos em ordens
  // diferentes a cada volta, e o log append-only deixaria de ser reproduzível.
  it('mantém a ordem dos endereços, e não a de quem respondeu antes', async () => {
    const parsed = parseExtendedKey(ZPUB)
    const primeiro = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address
    const segundo = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 1).address

    const adapter: ChainAdapter = {
      ...adapterWith(
        {
          [primeiro]: [{ txid: 'aa', height: 100, blockHash: 'h100' }],
          [segundo]: [{ txid: 'bb', height: 100, blockHash: 'h100' }],
        },
        {},
      ),
      getUtxosForAddress: async (a: string) => {
        // o primeiro endereço responde por último de propósito
        if (a === primeiro) await new Promise(pronto => setTimeout(pronto, 40))
        return a === primeiro
          ? [{ txid: 'aa', vout: 0, value: 1000, height: 100 }]
          : a === segundo
            ? [{ txid: 'bb', vout: 0, value: 2000, height: 100 }]
            : []
      },
    }

    await syncWallet(walletId, adapter)
    const { rows } = await pool.query<{ txid: string }>(
      `SELECT txid FROM chain_events WHERE wallet_id = $1 AND type = 'utxo_created' ORDER BY id`,
      [walletId],
    )
    expect(rows.map(r => r.txid)).toEqual(['aa', 'bb'])
  })
})

describe('syncWallet por registro de descriptor', () => {
  interface Registro {
    descriptors: string[]
    utxos: () => { txid: string; vout: number; value: number; height: number | null; address: string; derivationPath: string }[]
  }

  function adapterDeRegistro(reg: Registro): ChainAdapter {
    return {
      capabilities: () => ({
        randomAccess: false,
        needsRegistration: true,
        supportsSubscribe: false,
        hasTxIndex: true,
        isPublic: false,
        host: 'meu nó',
      }),
      tipHeight: async () => 200,
      blockHashAt: async (h: number) => 'h' + h,
      registerDescriptor: async (d: string) => {
        reg.descriptors.push(d)
      },
      getRegisteredUtxos: async () => reg.utxos(),
    }
  }

  // O design chama isto de "os dois modelos incompatíveis". Um backend de
  // registro não responde histórico de endereço arbitrário: sondar endereço
  // por endereço devolveria vazio de tudo, e a carteira apareceria zerada sem
  // erro nenhum.
  it('registra as duas cadeias em vez de sondar endereço por endereço', async () => {
    const reg: Registro = { descriptors: [], utxos: () => [] }
    await syncWallet(walletId, adapterDeRegistro(reg))

    expect(reg.descriptors).toHaveLength(2)
    expect(reg.descriptors[0]).toMatch(/^wpkh\(.*\/0\/\*\)$/)
    expect(reg.descriptors[1]).toMatch(/^wpkh\(.*\/1\/\*\)$/)
  })

  it('cria eventos a partir do que o nó reporta, e projeta o saldo', async () => {
    const reg: Registro = {
      descriptors: [],
      utxos: () => [
        {
          txid: 'aa'.repeat(32), vout: 0, value: 51000, height: 195,
          address: 'tb1qdonode', derivationPath: '0/7',
        },
      ],
    }
    const r = await syncWallet(walletId, adapterDeRegistro(reg))
    expect(r.newEvents).toHaveLength(1)
    expect(await walletBalance(walletId)).toBe(51000)
  })

  // No modelo de registro é o nó que sabe qual endereço é qual: o motor não
  // derivou nada. Sem gravar o endereço que ele reporta, o alerta não teria o
  // que mostrar e o coin control não teria a que se referir.
  it('registra o endereço e o caminho que o nó informou', async () => {
    const reg: Registro = {
      descriptors: [],
      utxos: () => [
        { txid: 'bb'.repeat(32), vout: 1, value: 900, height: 190, address: 'tb1qveiodono', derivationPath: '1/3' },
      ],
    }
    await syncWallet(walletId, adapterDeRegistro(reg))

    const { rows } = await pool.query<{ address: string; derivation_path: string; chain: number; idx: number }>(
      'SELECT address, derivation_path, chain, idx FROM addresses WHERE wallet_id = $1',
      [walletId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ address: 'tb1qveiodono', derivation_path: '1/3', chain: 1, idx: 3 })
  })

  it('é idempotente: sincronizar de novo não duplica evento', async () => {
    const reg: Registro = {
      descriptors: [],
      utxos: () => [
        { txid: 'cc'.repeat(32), vout: 0, value: 7000, height: 195, address: 'tb1qx', derivationPath: '0/0' },
      ],
    }
    await syncWallet(walletId, adapterDeRegistro(reg))
    const segunda = await syncWallet(walletId, adapterDeRegistro(reg))
    expect(segunda.newEvents).toHaveLength(0)
    expect(await walletBalance(walletId)).toBe(7000)
  })

  // O nó reporta a carteira inteira de uma vez, então sumir da lista é
  // evidência de gasto — diferente do modelo de sondagem, onde só conta o
  // endereço que foi perguntado.
  it('declara gasto o UTXO que o nó deixou de reportar', async () => {
    let tem = true
    const reg: Registro = {
      descriptors: [],
      utxos: () =>
        tem ? [{ txid: 'dd'.repeat(32), vout: 0, value: 4000, height: 195, address: 'tb1qy', derivationPath: '0/1' }] : [],
    }
    await syncWallet(walletId, adapterDeRegistro(reg))
    expect(await walletBalance(walletId)).toBe(4000)

    tem = false
    await syncWallet(walletId, adapterDeRegistro(reg))
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('marca a carteira como sincronizada', async () => {
    await syncWallet(walletId, adapterDeRegistro({ descriptors: [], utxos: () => [] }))
    const { rows } = await pool.query<{ sync_state: string }>(
      'SELECT sync_state FROM wallets WHERE id = $1', [walletId],
    )
    expect(rows[0]!.sync_state).toBe('synced')
  })
})
