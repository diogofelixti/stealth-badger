import { readFile } from 'node:fs/promises'
import { Resolver } from 'node:dns/promises'
import type { FastifyInstance } from 'fastify'
import { pool } from '../db/pool'
import { erro } from '../http/erro'
import { engineNoSocket, type ChamadaDoEngine } from './docker'
import {
  controlarPerfil,
  ehAcao,
  ehPerfil,
  estadoDoPerfil,
  type Perfil,
} from './controle'
import {
  sondarCloudflare,
  sondarTailscale,
  type ResolvedorDns,
  type Sonda,
} from './sondas'

/**
 * Por onde o painel está acessível de fora, e se cada caminho responde.
 *
 * `enabled` e `status` são coisas diferentes, e a tela mostra as duas: a
 * primeira diz que alguém configurou o caminho, a segunda diz se ele respondeu.
 * Um `.onion` no arquivo com o Tor parado satisfaz a primeira e desmente a
 * segunda, e é justamente o caso em que a pessoa acha que está publicada.
 *
 * Ligar e desligar mora em `controle.ts`, atrás do socket do Docker, de
 * `users.is_admin` e de uma lista branca de três perfis e dois verbos. Sem
 * `DOCKER_SOCKET` montado de propósito por quem hospeda, esta rota continua
 * sendo exatamente o que era em 27/08: leitura.
 */
async function lerHostname(caminho: string | undefined): Promise<string | null> {
  if (!caminho) return null
  try {
    const conteudo = (await readFile(caminho, 'utf8')).trim()
    return conteudo || null
  } catch {
    // Arquivo ausente é o caso comum — quem não usa Tor não tem hidden
    // service montado, e isso não é erro.
    return null
  }
}

/** Nenhuma sonda roda: o caminho não está configurado. */
const DESLIGADO: Sonda = { status: 'down', statusSource: 'none' }

/**
 * O Tor não tem por onde ser sondado pela rede, e a resposta diz isso.
 *
 * O `torrc` deste projeto traz `SocksPort 0` de propósito — abrir um SOCKS na
 * rede do compose seria pôr um proxy aberto de pé para poder dar um ping nele,
 * o que troca uma pergunta por uma superfície. Com o socket do Docker montado,
 * o estado do container responde; sem ele, o honesto é `unknown`.
 */
const TOR_SEM_SONDA: Sonda = { status: 'unknown', statusSource: 'none' }

const TEMPO_LIMITE_MS = 1_500

/** Resolvedor com prazo: a página não pode ficar pendurada num DNS mudo. */
const resolvedorPadrao: ResolvedorDns = async nome => {
  const resolver = new Resolver({ timeout: TEMPO_LIMITE_MS, tries: 1 })
  return resolver.resolve4(nome)
}

/** `fetch` com prazo, pelo mesmo motivo do resolvedor. */
const fetchComPrazo: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })

function urlDasMetricas(): string {
  return (
    process.env.CLOUDFLARE_METRICS_URL?.trim() || 'http://cloudflared:2000/ready'
  )
}

function socketDoDocker(): string | null {
  return process.env.DOCKER_SOCKET?.trim() || null
}

export interface AccessRouteOptions {
  /** injetáveis para o teste; em produção, DNS, `fetch` e socket de verdade */
  resolverDns?: ResolvedorDns
  fetchDeAcesso?: typeof fetch
  engineDeAcesso?: ChamadaDoEngine
}

async function ehAdmin(userId: number): Promise<boolean> {
  const { rows } = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1',
    [userId],
  )
  return rows[0]?.is_admin === true
}

/**
 * Duas medições do mesmo caminho, e qual delas ganha.
 *
 * O Docker sabe se o **processo** está de pé; a sonda de rede sabe se ele
 * chegou a **funcionar**. Container de pé não é túnel conectado, então quando
 * as duas responderam, a mais específica ganha. Container parado, por outro
 * lado, encerra a discussão: não há o que a rede possa dizer por cima disso.
 */
function combinar(docker: Sonda | null, rede: Sonda): Sonda {
  if (!docker) return rede
  if (docker.status === 'down') return docker
  if (rede.status !== 'unknown') return rede
  return docker
}

export function registerAccessRoutes(
  app: FastifyInstance,
  opts: AccessRouteOptions = {},
): void {
  /** O engine, quando quem hospeda montou o socket de propósito. */
  function engine(): ChamadaDoEngine | null {
    if (opts.engineDeAcesso) return opts.engineDeAcesso
    const socket = socketDoDocker()
    return socket ? engineNoSocket(socket) : null
  }

  app.get('/api/access', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const onion = await lerHostname(process.env.TOR_HOSTNAME_PATH)
    const tailscale = process.env.TAILSCALE_HOSTNAME?.trim() || null
    const cloudflare = process.env.CLOUDFLARE_HOSTNAME?.trim() || null
    const motor = engine()

    const peloDocker = (perfil: Perfil, configurado: boolean) =>
      motor && configurado ? estadoDoPerfil(perfil, motor) : Promise.resolve(null)

    // Tudo em paralelo: cada sonda tem prazo próprio, e somá-los em série faria
    // a página esperar o pior caso de todas.
    const [dockerTor, dockerTailscale, dockerCloudflare, redeTailscale, redeCloudflare, admin] =
      await Promise.all([
        peloDocker('tor', onion !== null),
        peloDocker('tailscale', tailscale !== null),
        peloDocker('cloudflared', cloudflare !== null),
        tailscale
          ? sondarTailscale(tailscale, opts.resolverDns ?? resolvedorPadrao)
          : Promise.resolve(DESLIGADO),
        cloudflare
          ? sondarCloudflare(urlDasMetricas(), opts.fetchDeAcesso ?? fetchComPrazo)
          : Promise.resolve(DESLIGADO),
        ehAdmin(req.userId),
      ])

    return reply.send({
      tor: {
        enabled: onion !== null,
        ...(onion ? { onion } : {}),
        ...(onion ? combinar(dockerTor, TOR_SEM_SONDA) : DESLIGADO),
      },
      tailscale: {
        enabled: tailscale !== null,
        ...(tailscale ? { hostname: tailscale } : {}),
        ...combinar(dockerTailscale, redeTailscale),
      },
      // `warning` é constante de propósito: quem termina o TLS enxerga o
      // tráfego em claro, e essa frase não pode depender de configuração.
      cloudflare: {
        enabled: cloudflare !== null,
        ...(cloudflare ? { hostname: cloudflare } : {}),
        warning: true,
        ...combinar(dockerCloudflare, redeCloudflare),
      },
      // Quem pode ligar e desligar pela tela, e se a instância sequer oferece
      // isso. `available: false` é o padrão: sem o socket montado, o painel
      // continua sendo leitura, como era antes de 28/08.
      control: {
        available: motor !== null,
        isAdmin: admin,
      },
    })
  })

  /**
   * Ligar e desligar um caminho — a superfície que a decisão de 28/08 abriu.
   *
   * A ordem das recusas é deliberada: sessão, depois admin, e só então o que
   * veio no corpo. Quem não é admin não descobre a lista branca tentando
   * valores até um deles responder diferente.
   */
  app.post<{ Body: { profile?: unknown; action?: unknown } }>(
    '/api/access/control',
    async (req, reply) => {
      if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

      if (!(await ehAdmin(req.userId))) {
        return reply
          .code(403)
          .send(
            erro(
              'access.adminOnly',
              'ligar e desligar acesso externo é do admin da instância',
            ),
          )
      }

      const { profile, action } = req.body ?? {}
      if (!ehPerfil(profile) || !ehAcao(action)) {
        // O corpo não vira comando em lugar nenhum, mas ele também não passa:
        // três perfis, dois verbos, e nada mais atravessa esta linha.
        return reply
          .code(400)
          .send(erro('access.badRequest', 'perfil ou ação fora da lista branca'))
      }

      const motor = engine()
      if (!motor) {
        return reply
          .code(503)
          .send(
            erro(
              'access.noSocket',
              'esta instância subiu sem DOCKER_SOCKET: o painel lê os acessos, e não os controla',
            ),
          )
      }

      return reply.send(await controlarPerfil(profile, action, motor))
    },
  )
}
