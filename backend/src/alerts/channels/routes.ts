import type { FastifyInstance } from 'fastify'
import { loadConfig } from '../../config'
import { open, seal } from '../../crypto/secretbox'
import { pool } from '../../db/pool'
import { sendToNtfy, type DeliveryResult, type NtfyConfig } from './ntfy'
import { sendToWebhook, type WebhookConfig } from './webhook'

const ACEITOS = ['ntfy', 'webhook'] as const
type Kind = (typeof ACEITOS)[number]

const NTFY_PADRAO = 'https://ntfy.sh'

interface CriarCanalBody {
  kind: string
  /** ntfy */
  topic?: string
  server?: string
  token?: string
  /** webhook */
  url?: string
  secret?: string
}

export interface ChannelRouteOptions {
  /** injetável para que o teste não dispare notificação de verdade */
  channelFetch?: typeof fetch
}

/**
 * Monta a configuração a partir do corpo, recusando o que não dá para entregar.
 *
 * Devolve a mensagem de erro em vez de lançar, porque cada recusa precisa
 * chegar ao usuário dizendo o que fazer.
 */
function configurar(body: CriarCanalBody): { config: object } | { erro: string } {
  if (!ACEITOS.includes(body.kind as Kind)) {
    return { erro: `tipo de canal "${body.kind}" não existe. Aceitos: ntfy, webhook` }
  }

  if (body.kind === 'ntfy') {
    const topic = body.topic?.trim()
    if (!topic) {
      return {
        erro:
          'tópico obrigatório. É ele que separa as suas notificações das dos outros: ' +
          'escolha algo longo e difícil de adivinhar.',
      }
    }
    const config: NtfyConfig = {
      server: (body.server?.trim() || NTFY_PADRAO).replace(/\/+$/, ''),
      topic,
      ...(body.token?.trim() ? { token: body.token.trim() } : {}),
    }
    return { config }
  }

  const url = body.url?.trim()
  if (!url) return { erro: 'url do webhook obrigatória' }
  if (!/^https?:\/\//i.test(url)) {
    return { erro: 'a url do webhook precisa começar com http:// ou https://' }
  }
  const config: WebhookConfig = {
    url,
    ...(body.secret?.trim() ? { secret: body.secret.trim() } : {}),
  }
  return { config }
}

export function registerChannelRoutes(
  app: FastifyInstance,
  opts: ChannelRouteOptions = {},
): void {
  const doFetch = opts.channelFetch ?? fetch

  app.get('/api/channels', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    // A configuração não sai daqui. No ntfy, o tópico é a única coisa que
    // separa as suas notificações de quem quiser lê-las — devolvê-lo numa
    // listagem o espalharia por log de proxy, histórico e captura de tela.
    const { rows } = await pool.query<{ id: string; kind: string; enabled: boolean }>(
      `SELECT id, kind, enabled FROM channels WHERE user_id = $1 ORDER BY id`,
      [req.userId],
    )
    return reply.send(
      rows.map(r => ({ id: Number(r.id), kind: r.kind, enabled: r.enabled })),
    )
  })

  app.post<{ Body: CriarCanalBody }>('/api/channels', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const resultado = configurar(req.body ?? ({} as CriarCanalBody))
    if ('erro' in resultado) return reply.code(400).send({ error: resultado.erro })

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO channels (user_id, kind, config_encrypted)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        req.userId,
        req.body.kind,
        seal(JSON.stringify(resultado.config), loadConfig().masterKeyHex),
      ],
    )
    return reply
      .code(201)
      .send({ id: Number(rows[0]!.id), kind: req.body.kind, enabled: true })
  })

  /**
   * Dispara uma notificação de verdade pelo canal.
   *
   * Descobrir que o push não chega no meio de uma demonstração é tarde demais:
   * o caminho inteiro — cifra, canal, servidor, celular — precisa ser
   * exercitado antes de valer.
   */
  app.post<{ Params: { id: string } }>('/api/channels/:id/test', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rows } = await pool.query<{ kind: string; config_encrypted: Buffer }>(
      'SELECT kind, config_encrypted FROM channels WHERE id = $1 AND user_id = $2',
      [Number(req.params.id), req.userId],
    )
    const canal = rows[0]
    if (!canal) return reply.code(404).send({ error: 'canal não encontrado' })

    const config = JSON.parse(open(canal.config_encrypted, loadConfig().masterKeyHex))
    const teste = {
      id: 0,
      walletId: 0,
      type: 'test',
      severity: 'info' as const,
      title: 'Stealth Badger',
      body: 'Se você está lendo isto, o alerta chega. É só um teste.',
    }

    const resultado: DeliveryResult =
      canal.kind === 'ntfy'
        ? await sendToNtfy(teste, config, doFetch)
        : await sendToWebhook(teste, config, doFetch)

    return reply.send(resultado)
  })

  app.delete<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rowCount } = await pool.query(
      'DELETE FROM channels WHERE id = $1 AND user_id = $2',
      [Number(req.params.id), req.userId],
    )
    if (!rowCount) return reply.code(404).send({ error: 'canal não encontrado' })
    return reply.code(204).send()
  })
}
