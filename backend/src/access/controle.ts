import type { ChamadaDoEngine } from './docker'
import type { Sonda } from './sondas'

// Reexportado para quem controla não precisar saber que o transporte é socket.
export type { ChamadaDoEngine }

/**
 * Ligar e desligar um caminho externo pela tela.
 *
 * ── A exceção, escrita ────────────────────────────────────────────────────
 * O backlog de 27/08 recusou montar `/var/run/docker.sock` com esta razão:
 * quem alcança o socket é root na máquina hospedeira, e este projeto é
 * multi-usuário e ensina a publicar o painel num túnel. A decisão de 28/08
 * reverte a recusa, e a consequência não fica implícita:
 *
 * **com o socket montado, uma sessão do painel vale execução de código na
 * máquina que hospeda** — e, se o painel estiver publicado num túnel, isso vale
 * para quem obtiver uma sessão de fora.
 *
 * Três coisas estreitam a superfície, e as três são obrigatórias:
 *
 * 1. **Lista branca.** O backend não recebe comando: recebe `profile` e
 *    `action`, confere contra três perfis e dois verbos, e monta ele mesmo as
 *    duas únicas URLs que sabe montar — `/start` e `/stop`, sobre um id que
 *    veio do próprio engine. Nenhum `exec`, nenhum `logs`, nenhum `create`,
 *    nenhuma outra rota do engine;
 * 2. **`users.is_admin`**, conferido na rota, antes de qualquer chamada;
 * 3. **opt-in do host.** Sem `DOCKER_SOCKET` montado, nada disto existe, e o
 *    painel continua sendo o de leitura que era em 27/08.
 */
export const PERFIS = ['tor', 'tailscale', 'cloudflared'] as const
export const ACOES = ['up', 'down'] as const

export type Perfil = (typeof PERFIS)[number]
export type Acao = (typeof ACOES)[number]

export function ehPerfil(v: unknown): v is Perfil {
  return typeof v === 'string' && (PERFIS as readonly string[]).includes(v)
}

export function ehAcao(v: unknown): v is Acao {
  return typeof v === 'string' && (ACOES as readonly string[]).includes(v)
}

export type MotivoDaFalha =
  | 'notCreated'
  | 'ambiguous'
  | 'unreachable'
  | 'engineError'

export interface Resultado {
  ok: boolean
  profile: Perfil
  action: Acao
  /** o estado em que o container ficou, quando deu para saber */
  state?: string
  reason?: MotivoDaFalha
  hint?: string
  /** o comando de uma linha, quando o painel não pode resolver sozinho */
  command?: string
}

interface ContainerDoEngine {
  Id: string
  State: string
}

/** O projeto do compose, para o painel não alcançar o `tor` de outra instância. */
function projeto(): string {
  return process.env.COMPOSE_PROJECT?.trim() || 'coin-controll'
}

function buscaDoPerfil(perfil: Perfil): string {
  const filtros = JSON.stringify({
    label: [
      `com.docker.compose.service=${perfil}`,
      `com.docker.compose.project=${projeto()}`,
    ],
  })
  return `/containers/json?all=true&filters=${encodeURIComponent(filtros)}`
}

async function containersDoPerfil(
  perfil: Perfil,
  chamar: ChamadaDoEngine,
): Promise<ContainerDoEngine[]> {
  const res = await chamar('GET', buscaDoPerfil(perfil))
  if (res.status !== 200) throw new Error(`engine respondeu ${res.status}`)
  return JSON.parse(res.body) as ContainerDoEngine[]
}

/**
 * O estado do caminho, medido pelo container.
 *
 * É o mais forte dos três sinais que o `/api/access` tem, e por isso ele ganha
 * das sondas de DNS e de HTTP quando o socket está montado: o Docker sabe se o
 * processo está de pé, e as outras duas inferem isso de fora.
 *
 * Continua valendo a regra: engine mudo é `unknown`, e nunca `down`.
 */
export async function estadoDoPerfil(
  perfil: Perfil,
  chamar: ChamadaDoEngine,
): Promise<Sonda> {
  try {
    const encontrados = await containersDoPerfil(perfil, chamar)
    const dePe = encontrados.some(c => c.State === 'running')
    return { status: dePe ? 'up' : 'down', statusSource: 'docker' }
  } catch {
    return { status: 'unknown', statusSource: 'none' }
  }
}

export async function controlarPerfil(
  perfil: Perfil,
  acao: Acao,
  chamar: ChamadaDoEngine,
  opts: { criar?: (perfil: Perfil) => 'started' | 'running' | 'unavailable' } = {},
): Promise<Resultado> {
  const base = { profile: perfil, action: acao }

  let encontrados: ContainerDoEngine[]
  try {
    encontrados = await containersDoPerfil(perfil, chamar)
  } catch (err) {
    return {
      ...base,
      ok: false,
      reason: 'unreachable',
      hint:
        'o socket do Docker não respondeu: ' +
        (err as Error).message +
        '. Confira se DOCKER_SOCKET está montado no container do backend.',
    }
  }

  // O engine sabe iniciar e parar o que existe, e não sabe o que o
  // `docker-compose.yml` diz. Quem sabe é o CLI do compose, e é ele que
  // `compose.ts` chama — lendo o mesmo arquivo, sem definição duplicada e sem
  // nada que possa divergir dele. A volta é imediata de propósito: criar puxa
  // imagem, e a rota não pode ficar pendurada esperando por isso.
  if (encontrados.length === 0) {
    if (acao === 'up' && opts.criar) {
      const pedido = opts.criar(perfil)
      if (pedido === 'started' || pedido === 'running') {
        return { ...base, ok: true, state: 'creating' }
      }
    }

    // Sem o diretório do projeto montado, o painel não inventa: devolve o
    // comando exato, uma vez só, e daí em diante controla pelo engine.
    return {
      ...base,
      ok: false,
      reason: 'notCreated',
      hint:
        'este perfil nunca subiu nesta máquina, então não há container para ' +
        'ligar. Rode o comando abaixo uma vez; depois dele, o painel liga e ' +
        'desliga sozinho.',
      command: `docker compose --profile ${perfil} create`,
    }
  }

  // Duas instâncias do mesmo projeto na mesma máquina: escolher uma é escolher
  // errado metade das vezes, e a metade errada desliga o painel de outra pessoa.
  if (encontrados.length > 1) {
    return {
      ...base,
      ok: false,
      reason: 'ambiguous',
      hint:
        `há ${encontrados.length} containers do perfil ${perfil} no projeto ` +
        `${projeto()}. Defina COMPOSE_PROJECT para o projeto certo, ou ` +
        'resolva o duplicado na mão.',
    }
  }

  const alvo = encontrados[0]!
  const verbo = acao === 'up' ? 'start' : 'stop'
  const res = await chamar('POST', `/containers/${alvo.Id}/${verbo}`)

  // 204 é feito; 304 é o engine dizendo "já estava assim", que é o que o
  // usuário pediu. Tratar 304 como erro faria o botão piscar vermelho por ter
  // conseguido exatamente o que ele queria.
  if (res.status !== 204 && res.status !== 304) {
    return {
      ...base,
      ok: false,
      reason: 'engineError',
      hint: `o Docker recusou ${verbo}: ${res.status} ${res.body}`.trim(),
    }
  }

  return { ...base, ok: true, state: acao === 'up' ? 'running' : 'exited' }
}
