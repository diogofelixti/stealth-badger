import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'

/**
 * Por onde o painel está acessível de fora.
 *
 * **Só leitura.** Ligar e desligar é `docker compose --profile tor up -d`, na
 * mão de quem hospeda: um painel que se desliga sozinho é um painel que se
 * tranca para fora, e um painel que liga túnel sozinho é um painel que se
 * publica sem ninguém mandar. Nada aqui monta o socket do Docker.
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

export function registerAccessRoutes(app: FastifyInstance): void {
  app.get('/api/access', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const onion = await lerHostname(process.env.TOR_HOSTNAME_PATH)
    const tailscale = process.env.TAILSCALE_HOSTNAME?.trim() || null
    const cloudflare = process.env.CLOUDFLARE_HOSTNAME?.trim() || null

    return reply.send({
      tor: { enabled: onion !== null, ...(onion ? { onion } : {}) },
      tailscale: {
        enabled: tailscale !== null,
        ...(tailscale ? { hostname: tailscale } : {}),
      },
      // `warning` é constante de propósito: quem termina o TLS enxerga o
      // tráfego em claro, e essa frase não pode depender de configuração.
      cloudflare: {
        enabled: cloudflare !== null,
        ...(cloudflare ? { hostname: cloudflare } : {}),
        warning: true,
      },
    })
  })
}
