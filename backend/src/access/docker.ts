import { request } from 'node:http'

/**
 * Falar com o Docker Engine por socket de domínio Unix.
 *
 * O engine serve HTTP comum sobre o socket, então não há biblioteca de Docker
 * aqui e nem precisa haver: é `http.request({ socketPath })`, e todo o resto do
 * módulo trata de status e corpo como trataria qualquer API.
 *
 * **Não há shell em lugar nenhum deste caminho.** Nenhuma string do cliente
 * chega a virar comando, porque comando nenhum é executado — `controle.ts`
 * monta duas URLs fixas a partir de um id que veio do próprio engine. É uma
 * garantia de forma, e não de validação: não existe injeção a evitar quando não
 * existe interpretador para injetar nada.
 */
export interface RespostaDoEngine {
  status: number
  body: string
}

export type ChamadaDoEngine = (
  metodo: string,
  caminho: string,
) => Promise<RespostaDoEngine>

/** O engine é local; um prazo curto basta, e evita a rota pendurada. */
const TEMPO_LIMITE_MS = 5_000

export function engineNoSocket(socketPath: string): ChamadaDoEngine {
  return (metodo, caminho) =>
    new Promise((resolve, reject) => {
      const req = request(
        { socketPath, path: caminho, method: metodo, timeout: TEMPO_LIMITE_MS },
        res => {
          let corpo = ''
          res.setEncoding('utf8')
          res.on('data', pedaco => (corpo += pedaco))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: corpo }))
        },
      )
      req.on('timeout', () => req.destroy(new Error('engine não respondeu a tempo')))
      req.on('error', reject)
      req.end()
    })
}
