import type { ChainAdapter, ChainCapabilities, RegisteredUtxo } from './types'
import type { Rpc } from './core-rpc'

export interface CoreOptions {
  rpc: Rpc
  /** carteira de observação, criada se não existir */
  wallet: string
  host?: string
}

interface UnspentDoCore {
  txid: string
  vout: number
  address: string
  amount: number
  confirmations: number
  desc?: string
}

/** `wpkh([abcd1234/0/7]02ff…)#chk` → `0/7` */
const CAMINHO_NO_DESCRIPTOR = /\[[0-9a-fA-F]{8}((?:\/\d+'?)+)\]/

/**
 * Cadeia e índice, a partir da origem da chave que o `desc` carrega.
 *
 * A origem é tão longa quanto o nó souber: quando o descriptor importado traz
 * o caminho desde a master, ela vem `[fp/84'/1'/0'/0/7]`. O resto do sistema
 * guarda `derivation_path` como `cadeia/índice` — os **dois últimos** trechos.
 * Ler os dois primeiros gravaria o endereço em `84'/1'`, sem erro nenhum.
 */
function caminhoDe(desc: string | undefined): string {
  const m = desc ? CAMINHO_NO_DESCRIPTOR.exec(desc) : null
  if (!m) return ''
  const trechos = m[1]!.replace(/^\//, '').split('/')
  return trechos.slice(-2).join('/')
}

/**
 * Converte BTC em satoshi sem passar por ponto flutuante.
 *
 * `0.00000001 * 1e8` não dá exatamente 1 em binário, e truncar perde o
 * satoshi. O watchtower projeta saldo a partir deste número, e um satoshi
 * perdido por arredondamento é saldo errado que ninguém consegue explicar
 * depois. Somar meio satoshi antes de arredondar resolve, mas contar pelos
 * dígitos do texto é exato.
 */
export function btcParaSats(btc: number): number {
  const texto = btc.toFixed(8)
  const [inteiro, decimal] = texto.split('.')
  return Number(BigInt(inteiro!) * 100_000_000n + BigInt(decimal ?? '0'))
}

export function createCoreAdapter(opts: CoreOptions): ChainAdapter {
  const { rpc, wallet } = opts

  const caps: ChainCapabilities = {
    // A distinção central do design: o Core não responde histórico de um
    // endereço arbitrário. Ele precisa que o descriptor seja registrado antes.
    randomAccess: false,
    needsRegistration: true,
    supportsSubscribe: false,
    hasTxIndex: true,
    // Um nó que você mesmo roda é o oposto de um explorador público: é este
    // valor que apaga o aviso de privacidade na tela.
    isPublic: false,
    host: opts.host ?? 'bitcoin core',
  }

  async function garantirCarteira(): Promise<void> {
    const carregadas = (await rpc('listwallets')) as string[]
    if (carregadas.includes(wallet)) return

    // Ela é criada com `load_on_startup: false`, para não mexer na
    // configuração do nó de quem nos hospeda. O preço é que, depois que o nó
    // reinicia, ela existe e não está carregada — e `createwallet` responderia
    // "Database already exists". Carregar antes é o que faz o watchtower
    // sobreviver ao primeiro restart do nó.
    try {
      await rpc('loadwallet', [wallet])
      return
    } catch {
      // não existe ainda; cria abaixo
    }

    // `disable_private_keys` é o que faz dela watch-only de verdade: sem isso o
    // nó geraria chaves de gasto para uma carteira que só deveria observar.
    await rpc('createwallet', [
      wallet,
      true, // disable_private_keys
      true, // blank
      '', // passphrase
      false, // avoid_reuse
      true, // descriptors
      false, // load_on_startup
    ])
  }

  return {
    capabilities: () => caps,

    async tipHeight() {
      return Number(await rpc('getblockcount'))
    },

    async blockHashAt(height: number) {
      return String(await rpc('getblockhash', [height]))
    },

    async registerDescriptor(descriptor: string) {
      await garantirCarteira()

      // O Core recusa descriptor sem checksum. Pedi-lo ao próprio nó é mais
      // seguro que calculá-lo aqui, e é o que a RPC oferece.
      const info = (await rpc('getdescriptorinfo', [descriptor])) as { descriptor: string }

      // `range` não é opcional para descriptor com curinga: sem ele o Core
      // recusa com "Descriptor is ranged, please specify the range". Mil é o
      // que o próprio Core usa por padrão nas carteiras de descriptor — bem
      // acima do gap limit de 20 do caminho de sondagem, porque aqui não há
      // sondagem: o nó varre a faixa inteira uma vez e passa a seguir o que
      // achou.
      // `timestamp: 0` é o que dispara a varredura desde o gênesis; por isso o
      // motor não chama `rescanFrom` em seguida.
      const resultado = (await rpc(
        'importdescriptors',
        [
          [
            {
              desc: info.descriptor,
              timestamp: 0,
              active: false,
              internal: false,
              range: [0, 999] as [number, number],
            },
          ],
        ],
        wallet,
      )) as { success: boolean; error?: { message: string } }[]

      const falha = resultado.find(r => !r.success)
      if (falha) {
        throw new Error(
          'Bitcoin Core recusou o descriptor: ' +
            (falha.error?.message ?? 'sem motivo informado'),
        )
      }
    },

    async rescanFrom(height: number) {
      // Bloqueante e possivelmente longo: quem chama decide se espera.
      await rpc('rescanblockchain', [height], wallet)
    },

    async getRegisteredUtxos(): Promise<RegisteredUtxo[]> {
      const tip = Number(await rpc('getblockcount'))
      const brutos = (await rpc('listunspent', [0, 9_999_999], wallet)) as UnspentDoCore[]

      return brutos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        value: btcParaSats(u.amount),
        // O Core reporta confirmações, não altura. Zero é mempool.
        height: u.confirmations > 0 ? tip - u.confirmations + 1 : null,
        address: u.address,
        derivationPath: caminhoDe(u.desc),
      }))
    },
  }
}
