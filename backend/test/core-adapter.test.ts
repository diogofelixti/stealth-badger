import { describe, expect, it } from 'vitest'
import { createCoreAdapter } from '../src/chain/core'
import type { Rpc } from '../src/chain/core-rpc'

function rpcFalso(
  respostas: Record<string, unknown | ((params: unknown[], wallet?: string) => unknown)>,
  registro?: { chamadas: { method: string; params: unknown[]; wallet?: string }[] },
): Rpc {
  return async (method, params = [], wallet) => {
    registro?.chamadas.push({ method, params, wallet })
    const r = respostas[method]
    if (r === undefined) throw new Error(`Bitcoin Core falhou em ${method}: não simulado`)
    return typeof r === 'function' ? (r as (p: unknown[], w?: string) => unknown)(params, wallet) : r
  }
}

const DESCRIPTOR = 'wpkh(tpubDCxX2sYFS5bDkSe5GKKYHjBW7tgyN1R3UchpLJvdbf54ohxeGRtd8MbDUe1cguVHe4vnK68DsuD5MXjxi9EXx16rb9EnNsaF5KT99CinaJz/0/*)'

describe('adapter Bitcoin Core', () => {
  // A distinção central do design: Core não responde histórico de um endereço
  // arbitrário. Ele precisa que o descriptor seja registrado antes, e então
  // segue aquilo. Declarar acesso aleatório faria o motor sondar endereço por
  // endereço e receber vazio de tudo.
  it('declara que precisa de registro e não faz acesso aleatório', () => {
    const a = createCoreAdapter({ rpc: rpcFalso({}), wallet: 'vigia' })
    expect(a.capabilities()).toMatchObject({
      randomAccess: false,
      needsRegistration: true,
      supportsSubscribe: false,
    })
  })

  // Um nó que você mesmo roda é o oposto de um explorador público. É esse
  // valor que apaga o aviso de privacidade na tela.
  it('assume postura soberana, que é o ponto de rodar o próprio nó', () => {
    const a = createCoreAdapter({ rpc: rpcFalso({}), wallet: 'vigia' })
    expect(a.capabilities().isPublic).toBe(false)
  })

  it('lê a altura da ponta e o hash de bloco pelo RPC do nó', async () => {
    const a = createCoreAdapter({
      rpc: rpcFalso({ getblockcount: 319515, getblockhash: () => '0000cafe' }),
      wallet: 'vigia',
    })
    expect(await a.tipHeight()).toBe(319515)
    expect(await a.blockHashAt(10)).toBe('0000cafe')
  })

  describe('registro do descriptor', () => {
    it('cria a carteira de observação quando ela ainda não existe', async () => {
      const r = { chamadas: [] as { method: string; params: unknown[]; wallet?: string }[] }
      const a = createCoreAdapter({
        rpc: rpcFalso(
          {
            listwallets: [],
            createwallet: { name: 'vigia' },
            importdescriptors: [{ success: true }],
            getdescriptorinfo: (p: unknown[]) => ({ descriptor: p[0] + '#checksum' }),
          },
          r,
        ),
        wallet: 'vigia',
      })
      await a.registerDescriptor!(DESCRIPTOR)

      const criar = r.chamadas.find(c => c.method === 'createwallet')
      expect(criar).toBeDefined()
      // watch-only de verdade: sem chaves privadas e sem carteira em branco
      expect(criar!.params).toContain('vigia')
    })

    it('não recria a carteira quando ela já está carregada', async () => {
      const r = { chamadas: [] as { method: string; params: unknown[]; wallet?: string }[] }
      const a = createCoreAdapter({
        rpc: rpcFalso(
          {
            listwallets: ['vigia'],
            importdescriptors: [{ success: true }],
            getdescriptorinfo: (p: unknown[]) => ({ descriptor: p[0] + '#checksum' }),
          },
          r,
        ),
        wallet: 'vigia',
      })
      await a.registerDescriptor!(DESCRIPTOR)
      expect(r.chamadas.find(c => c.method === 'createwallet')).toBeUndefined()
    })

    // A carteira de observação é criada com `load_on_startup: false`, para não
    // mexer na configuração do nó de quem nos hospeda. O preço é que, depois
    // que o nó reinicia, ela existe e não está carregada — e `createwallet`
    // responde "Database already exists". Sem carregar antes, o watchtower
    // pararia de sincronizar no primeiro restart do nó.
    it('carrega a carteira que já existe no nó mas não está carregada', async () => {
      const r = { chamadas: [] as { method: string; params: unknown[]; wallet?: string }[] }
      const a = createCoreAdapter({
        rpc: rpcFalso(
          {
            listwallets: [],
            loadwallet: { name: 'vigia' },
            importdescriptors: [{ success: true }],
            getdescriptorinfo: (p: unknown[]) => ({ descriptor: p[0] + '#checksum' }),
          },
          r,
        ),
        wallet: 'vigia',
      })
      await a.registerDescriptor!(DESCRIPTOR)

      expect(r.chamadas.find(c => c.method === 'loadwallet')).toBeDefined()
      expect(r.chamadas.find(c => c.method === 'createwallet')).toBeUndefined()
    })

    // Um descriptor com curinga não diz até onde derivar, e o Core recusa
    // importá-lo sem `range`: "Descriptor is ranged, please specify the range".
    // A falha só apareceria contra um nó de verdade.
    it('informa o range ao importar descriptor com curinga', async () => {
      const r = { chamadas: [] as { method: string; params: unknown[]; wallet?: string }[] }
      const a = createCoreAdapter({
        rpc: rpcFalso(
          {
            listwallets: ['vigia'],
            getdescriptorinfo: (p: unknown[]) => ({ descriptor: p[0] + '#chk' }),
            importdescriptors: [{ success: true }],
          },
          r,
        ),
        wallet: 'vigia',
      })
      await a.registerDescriptor!(DESCRIPTOR)

      const pedido = (r.chamadas.find(c => c.method === 'importdescriptors')!
        .params[0] as { range?: [number, number] }[])[0]!
      expect(pedido.range).toBeDefined()
      expect(pedido.range![0]).toBe(0)
      expect(pedido.range![1]).toBeGreaterThanOrEqual(999)
    })

    // O Core recusa descriptor sem checksum. Pedi-lo a ele é mais seguro que
    // calcular por conta própria, e é o que a própria RPC oferece.
    it('pede o checksum ao nó antes de importar', async () => {
      const r = { chamadas: [] as { method: string; params: unknown[]; wallet?: string }[] }
      const a = createCoreAdapter({
        rpc: rpcFalso(
          {
            listwallets: ['vigia'],
            getdescriptorinfo: () => ({ descriptor: DESCRIPTOR + '#abcd1234' }),
            importdescriptors: [{ success: true }],
          },
          r,
        ),
        wallet: 'vigia',
      })
      await a.registerDescriptor!(DESCRIPTOR)

      const importar = r.chamadas.find(c => c.method === 'importdescriptors')!
      const pedido = (importar.params[0] as { desc: string }[])[0]!
      expect(pedido.desc).toContain('#abcd1234')
    })

    it('falha com o motivo quando o nó recusa o descriptor', async () => {
      const a = createCoreAdapter({
        rpc: rpcFalso({
          listwallets: ['vigia'],
          getdescriptorinfo: () => ({ descriptor: DESCRIPTOR + '#x' }),
          importdescriptors: [{ success: false, error: { message: 'descriptor inválido' } }],
        }),
        wallet: 'vigia',
      })
      await expect(a.registerDescriptor!(DESCRIPTOR)).rejects.toThrow(/descriptor inválido/)
    })
  })

  describe('leitura dos UTXOs registrados', () => {
    it('lê as saídas não gastas da carteira de observação', async () => {
      const a = createCoreAdapter({
        rpc: rpcFalso({
          listwallets: ['vigia'],
          getblockcount: 319515,
          listunspent: [
            {
              txid: 'aa'.repeat(32),
              vout: 0,
              address: 'tb1qexemplo',
              amount: 0.00051,
              confirmations: 6,
              desc: 'wpkh([abcd1234/0/7]02ff...)#chk',
            },
          ],
        }),
        wallet: 'vigia',
      })
      const utxos = await a.getRegisteredUtxos!()
      expect(utxos).toHaveLength(1)
      expect(utxos[0]).toMatchObject({
        txid: 'aa'.repeat(32),
        vout: 0,
        address: 'tb1qexemplo',
        value: 51000,
        height: 319510,
        derivationPath: '0/7',
      })
    })

    // O Core reporta valor em BTC, com ponto flutuante. Multiplicar por 1e8 e
    // truncar perde satoshis por arredondamento binário: 0.00000001 * 1e8 pode
    // virar 0.9999999. O watchtower projeta saldo a partir disso.
    it('converte BTC para satoshi sem perder pelo arredondamento', async () => {
      const a = createCoreAdapter({
        rpc: rpcFalso({
          listwallets: ['vigia'],
          getblockcount: 100,
          listunspent: [
            { txid: 'bb'.repeat(32), vout: 0, address: 'x', amount: 0.00000001, confirmations: 1, desc: 'wpkh([a/0/0]0)#c' },
            { txid: 'cc'.repeat(32), vout: 1, address: 'y', amount: 20.09999999, confirmations: 1, desc: 'wpkh([a/0/1]0)#c' },
          ],
        }),
        wallet: 'vigia',
      })
      const utxos = await a.getRegisteredUtxos!()
      expect(utxos[0]!.value).toBe(1)
      expect(utxos[1]!.value).toBe(2009999999)
    })

    // O `desc` que o `listunspent` devolve carrega a origem da chave, e ela é
    // tão longa quanto o nó souber: quando o descriptor importado traz o
    // caminho desde a master, o campo vem `[fp/84'/1'/0'/0/7]`. Ler os dois
    // primeiros trechos daria `84'/1'` como cadeia e índice — endereço gravado
    // no lugar errado, sem erro nenhum. O que interessa são os dois últimos.
    it('lê cadeia e índice do fim do caminho, não do começo', async () => {
      const a = createCoreAdapter({
        rpc: rpcFalso({
          listwallets: ['vigia'],
          getblockcount: 100,
          listunspent: [
            {
              txid: 'ee'.repeat(32), vout: 0, address: 'tb1qlongo', amount: 0.002,
              confirmations: 1, desc: "wpkh([abcd1234/84'/1'/0'/1/9]02ff)#chk",
            },
          ],
        }),
        wallet: 'vigia',
      })
      expect((await a.getRegisteredUtxos!())[0]!.derivationPath).toBe('1/9')
    })

    it('trata UTXO ainda no mempool, que não tem altura', async () => {
      const a = createCoreAdapter({
        rpc: rpcFalso({
          listwallets: ['vigia'],
          getblockcount: 100,
          listunspent: [
            { txid: 'dd'.repeat(32), vout: 0, address: 'z', amount: 0.001, confirmations: 0, desc: 'wpkh([a/0/2]0)#c' },
          ],
        }),
        wallet: 'vigia',
      })
      expect((await a.getRegisteredUtxos!())[0]!.height).toBeNull()
    })
  })
})
