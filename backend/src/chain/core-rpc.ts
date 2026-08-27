import { readFile } from 'node:fs/promises'

/**
 * Uma chamada crua ao RPC. Injetável para que o teste não abra socket.
 *
 * O caminho importa: `/` fala com o nó, `/wallet/<nome>` fala com a carteira.
 * Mandar `listunspent` para a raiz devolve "method not found" quando há mais de
 * uma carteira carregada, que é o caso comum de quem já usa o nó para outra
 * coisa.
 */
export type RpcTransport = (
  caminho: string,
  corpo: unknown,
) => Promise<{ result?: unknown; error?: { code: number; message: string } }>

export interface RpcOptions {
  url?: string
  /** caminho do arquivo `.cookie` do bitcoind */
  cookiePath?: string
  user?: string
  password?: string
  transport?: RpcTransport
  timeoutMs?: number
}

export type Rpc = (
  method: string,
  params?: unknown[],
  wallet?: string,
) => Promise<unknown>

/**
 * Lê a credencial do cookie do bitcoind.
 *
 * O cookie é regerado a cada reinício do nó, então é lido a cada chamada em vez
 * de guardado: guardá-lo faria o watchtower parar de autenticar depois que o
 * nó reiniciasse, e o erro apareceria como "unauthorized" sem explicar por quê.
 */
async function credencialDoCookie(caminho: string): Promise<string> {
  const conteudo = (await readFile(caminho, 'utf8')).trim()
  return Buffer.from(conteudo, 'utf8').toString('base64')
}

function transporteHttp(url: string, opts: RpcOptions): RpcTransport {
  const base = url.replace(/\/+$/, '')
  // `importdescriptors` e `rescanblockchain` podem bloquear enquanto o Core
  // varre a cadeia. Trinta segundos basta para consulta comum, mas marca uma
  // carteira saudável como erro no primeiro registro contra um nó real.
  const timeoutMs = opts.timeoutMs ?? 600_000

  return async (caminho, corpo) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.cookiePath) {
      headers.Authorization = 'Basic ' + (await credencialDoCookie(opts.cookiePath))
    } else if (opts.user !== undefined) {
      headers.Authorization =
        'Basic ' +
        Buffer.from(opts.user + ':' + (opts.password ?? ''), 'utf8').toString('base64')
    }

    const res = await fetch(base + caminho, {
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    })

    // O Core responde 500 com o erro no corpo em vários casos, então o corpo é
    // lido antes de olhar o status: descartá-lo perderia a explicação.
    const texto = await res.text()
    try {
      return JSON.parse(texto) as { result?: unknown; error?: { code: number; message: string } }
    } catch {
      return { error: { code: res.status, message: texto.slice(0, 200) } }
    }
  }
}

export function criarRpc(opts: RpcOptions = {}): Rpc {
  const transport = opts.transport ?? transporteHttp(opts.url ?? 'http://127.0.0.1:8332', opts)
  let proximoId = 1

  return async (method, params = [], wallet) => {
    const resposta = await transport(wallet ? '/wallet/' + wallet : '/', {
      jsonrpc: '1.0',
      id: 'sb-' + proximoId++,
      method,
      params,
    })

    // O erro do Core vem dentro de uma resposta bem-sucedida. Ler só o
    // `result` faria a falha passar como `undefined` e o defeito aparecer
    // longe daqui.
    if (resposta.error) {
      throw new Error(
        `Bitcoin Core falhou em ${method}: ${resposta.error.message} (código ${resposta.error.code})`,
      )
    }
    return resposta.result
  }
}
