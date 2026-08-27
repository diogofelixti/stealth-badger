import { loadConfig, type BackendKind } from '../config'
import { pool } from '../db/pool'
import { erro, type ErroDaApi } from '../http/erro'
import type { Network } from '../wallet/descriptor'

export interface BackendResumo {
  id: number
  kind: BackendKind
  url: string
  isPublic: boolean
  network: Network
  /** `global` é o backend da instância; `own`, o que o usuário cadastrou */
  scope: 'global' | 'own'
}

const ACEITOS: BackendKind[] = ['esplora', 'electrum', 'core']

/**
 * Valida o endereço do backend contra o protocolo que ele diz falar.
 *
 * A checagem existe porque errar aqui não dá erro na hora: um Esplora
 * cadastrado com `electrum://` só falha quando a primeira carteira tenta
 * sincronizar, longe do formulário que causou o problema.
 */
export function validarBackend(kind: string, url: string): ErroDaApi | null {
  if (!ACEITOS.includes(kind as BackendKind)) {
    return erro(
      'backend.unknownKind',
      `tipo de backend "${kind}" não tem adapter. Aceitos: esplora, electrum, core`,
      { tipo: String(kind) },
    )
  }
  if (!url?.trim()) {
    return erro('backend.urlRequired', 'endereço do backend obrigatório')
  }

  // O esquema é conferido antes de tentar interpretar a URL: quem escreve
  // `127.0.0.1:50001` não recebe "endereço inválido", que não diz o que fazer,
  // e sim a frase que mostra o formato esperado.
  if (kind === 'esplora' && !/^https?:\/\//i.test(url)) {
    return erro(
      'backend.esploraScheme',
      'o Esplora fala HTTP: o endereço precisa começar com http:// ou https://',
    )
  }
  if (kind === 'core' && !/^https?:\/\//i.test(url)) {
    return erro(
      'backend.coreScheme',
      'o RPC do Bitcoin Core fala HTTP: o endereço precisa começar com http:// ou https://',
    )
  }
  if (kind === 'electrum' && !/^electrum:\/\//i.test(url)) {
    return erro(
      'backend.electrumScheme',
      'o endereço do Electrum precisa começar com electrum:// (por exemplo electrum://127.0.0.1:50001)',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return erro('backend.invalidUrl', `endereço do backend inválido: ${url}`)
  }
  if (!parsed.hostname) {
    return erro('backend.noHost', `endereço do backend sem host: ${url}`)
  }

  return null
}

/**
 * Garante que o backend configurado na instância existe como linha.
 *
 * Chamado também na listagem, e não só no cadastro de carteira, para que a
 * tela nunca receba uma lista vazia e fique sem nada para oferecer.
 */
export async function ensureBackendGlobal(network: Network): Promise<number> {
  const cfg = loadConfig()
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES (NULL, $1, $2, $3, $4)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public, kind = EXCLUDED.kind
     RETURNING id`,
    [cfg.backendKind, cfg.backendUrl, cfg.publicBackend, network],
  )
  return Number(rows[0]!.id)
}

export async function listarBackends(
  userId: number,
  network: Network,
): Promise<BackendResumo[]> {
  await ensureBackendGlobal(network)
  const { rows } = await pool.query<{
    id: string
    kind: BackendKind
    url: string
    is_public: boolean
    network: Network
    user_id: string | null
  }>(
    `SELECT id, kind, url, is_public, network, user_id
       FROM backends
      WHERE network = $2 AND (user_id IS NULL OR user_id = $1)
      ORDER BY user_id NULLS FIRST, id`,
    [userId, network],
  )
  return rows.map(r => ({
    id: Number(r.id),
    kind: r.kind,
    url: r.url,
    isPublic: r.is_public,
    network: r.network,
    scope: r.user_id === null ? 'global' : 'own',
  }))
}

export async function criarBackend(
  userId: number,
  kind: BackendKind,
  url: string,
  isPublic: boolean,
  network: Network,
): Promise<BackendResumo> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public, kind = EXCLUDED.kind
     RETURNING id`,
    [userId, kind, url, isPublic, network],
  )
  return { id: Number(rows[0]!.id), kind, url, isPublic, network, scope: 'own' }
}

/**
 * Devolve o backend que o usuário pode usar, ou `null`.
 *
 * O `null` cobre tanto backend inexistente quanto backend de outra pessoa, de
 * propósito: distinguir os dois na resposta contaria a um usuário quais ids
 * existem no banco de outro.
 */
export async function backendDoUsuario(
  userId: number,
  backendId: number,
  network: Network,
): Promise<BackendResumo | null> {
  const todos = await listarBackends(userId, network)
  return todos.find(b => b.id === backendId) ?? null
}
