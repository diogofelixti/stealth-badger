import { access, constants, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Network } from '../wallet/descriptor'

/**
 * Onde o bitcoind guarda o cookie de cada rede, e em que porta ela atende.
 *
 * A subpasta encontrada **diz a rede**, e a rede diz a porta. É por isso que o
 * formulário pode pedir um campo só: quem tem um nó sabe onde ele guarda os
 * dados, e não necessariamente que signet atende na 38332.
 */
const REDES: { subpasta: string; network: Network; rpcPort: number }[] = [
  { subpasta: '', network: 'mainnet', rpcPort: 8332 },
  { subpasta: 'signet', network: 'signet', rpcPort: 38332 },
  { subpasta: 'testnet4', network: 'testnet', rpcPort: 18332 },
  { subpasta: 'testnet3', network: 'testnet', rpcPort: 18332 },
]

export type MotivoDaFalha = 'notMounted' | 'noCookie' | 'unreachable'

export interface Deteccao {
  found: boolean
  network?: Network
  /** o host pelo qual o container alcança o nó, e a URL já montada */
  host?: string
  url?: string
  rpcPort?: number
  cookiePath?: string
  cookieReadable?: boolean
  reachable?: boolean
  blocks?: number
  chain?: string
  reason?: MotivoDaFalha
  hint?: string
  /** trecho de `docker-compose.yml` pronto para colar, quando falta montar */
  compose?: string
}

export type SondaDoNo = (
  url: string,
  cookiePath: string,
) => Promise<{ blocks: number; chain: string }>

/** O host pelo qual o container alcança a máquina que o hospeda. */
function hostDoNo(): string {
  return process.env.CORE_HOST_FROM_CONTAINER ?? 'host.docker.internal'
}

function trechoDoCompose(datadir: string): string {
  return [
    'services:',
    '  backend:',
    '    volumes:',
    `      - ${datadir}:${datadir}:ro`,
  ].join('\n')
}

async function legivel(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Procura um nó a partir do diretório de dados dele.
 *
 * Devolve as três coisas separadas, porque elas falham separadamente: o
 * diretório existe para o container? o cookie está legível? o RPC responde?
 * Juntar as três num "não achei" manda a pessoa procurar defeito onde não há.
 */
export async function detectarNo(
  datadir: string,
  sonda: SondaDoNo,
): Promise<Deteccao> {
  const caminho = datadir.trim().replace(/\/+$/, '')

  if (!(await legivel(caminho))) {
    return {
      found: false,
      reason: 'notMounted',
      hint:
        'este diretório não existe dentro do container do watchtower. ' +
        'Monte-o em modo leitura e suba de novo.',
      compose: trechoDoCompose(caminho),
    }
  }

  for (const rede of REDES) {
    const cookie = join(caminho, rede.subpasta, '.cookie')
    if (!(await legivel(cookie))) continue

    const url = `http://${hostDoNo()}:${rede.rpcPort}`
    try {
      const info = await sonda(url, cookie)
      return {
        found: true,
        network: rede.network,
        host: hostDoNo(),
        url,
        rpcPort: rede.rpcPort,
        cookiePath: cookie,
        cookieReadable: true,
        reachable: true,
        blocks: info.blocks,
        chain: info.chain,
      }
    } catch (err) {
      // Achar o arquivo não é falar com o nó. O cookie existe, e o RPC pode
      // estar desligado ou escutando em outra interface — são coisas
      // diferentes, e a tela precisa poder dizer qual delas.
      return {
        found: true,
        network: rede.network,
        host: hostDoNo(),
        url,
        rpcPort: rede.rpcPort,
        cookiePath: cookie,
        cookieReadable: true,
        reachable: false,
        reason: 'unreachable',
        hint:
          'o cookie está aqui, mas o RPC em ' + url + ' não respondeu: ' +
          (err as Error).message +
          '. Confira se o nó está no ar e se `rpcbind` aceita conexões do container.',
      }
    }
  }

  return {
    found: false,
    reason: 'noCookie',
    hint:
      'o diretório existe, mas não há `.cookie` nele nem nas subpastas de rede. ' +
      'O nó pode estar parado, ou configurado com `rpcuser`/`rpcpassword` em vez de cookie.',
  }
}

/** Lê o cookie no formato `usuário:senha`, para quem for falar com o nó. */
export async function credencialDoCookie(caminho: string): Promise<string> {
  return (await readFile(caminho, 'utf8')).trim()
}
