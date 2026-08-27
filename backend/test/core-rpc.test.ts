import { describe, expect, it } from 'vitest'
import { criarRpc, type RpcTransport } from '../src/chain/core-rpc'

function transporteFalso(
  respostas: Record<string, unknown>,
  espia?: { corpos: unknown[] },
): RpcTransport {
  return async (caminho: string, corpo: unknown) => {
    espia?.corpos.push({ caminho, corpo })
    const { method } = corpo as { method: string }
    if (!(method in respostas)) {
      return { error: { code: -32601, message: `Method not found: ${method}` } }
    }
    const r = respostas[method]
    return r instanceof Error ? { error: { code: -1, message: r.message } } : { result: r }
  }
}

describe('cliente RPC do Bitcoin Core', () => {
  it('chama o método e devolve o resultado', async () => {
    const rpc = criarRpc({ transport: transporteFalso({ getblockcount: 319515 }) })
    expect(await rpc('getblockcount')).toBe(319515)
  })

  // O RPC do Core devolve erro dentro de um 200. Ler só o corpo e ignorar o
  // campo `error` faria o adapter tratar falha como sucesso e seguir com
  // `undefined` no lugar do dado.
  it('trata erro que vem dentro da resposta, e não como exceção de rede', async () => {
    const rpc = criarRpc({ transport: transporteFalso({}) })
    await expect(rpc('naoexiste')).rejects.toThrow(/Method not found/)
  })

  // Carteira e nó têm caminhos diferentes no RPC: `/` fala com o nó,
  // `/wallet/<nome>` fala com a carteira. Mandar `listunspent` para a raiz
  // devolve erro de método não encontrado quando há mais de uma carteira
  // carregada, que é o caso comum.
  it('endereça a carteira pelo caminho, e o nó pela raiz', async () => {
    const espia = { corpos: [] as unknown[] }
    const rpc = criarRpc({
      transport: transporteFalso({ getblockcount: 1, listunspent: [] }, espia),
    })
    await rpc('getblockcount')
    await rpc('listunspent', [], 'vigia')
    expect((espia.corpos[0] as { caminho: string }).caminho).toBe('/')
    expect((espia.corpos[1] as { caminho: string }).caminho).toBe('/wallet/vigia')
  })

  it('nomeia o método na mensagem, para o erro dizer o que falhou', async () => {
    const rpc = criarRpc({ transport: transporteFalso({}) })
    await expect(rpc('getblockhash', [10])).rejects.toThrow(/getblockhash/)
  })
})
