import { loadConfig, type BackendKind } from '../config'
import { seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { erro, type ErroDaApi } from '../http/erro'
import type { Network } from '../wallet/descriptor'
import { PRESETS, presetConhecido, type PresetId } from './presets'

export interface BackendResumo {
  id: number
  kind: BackendKind
  url: string
  isPublic: boolean
  network: Network
  /** `global` é o backend da instância; `own`, o que o usuário cadastrou */
  scope: 'global' | 'own'
  /** qual entrada do catálogo o cadastrou; apresentação, nunca comportamento */
  preset?: PresetId | null
  label?: string | null
  /**
   * Se existe credencial guardada. **O conteúdo nunca sai daqui**: quem tem a
   * senha do RPC pode parar o nó, e um campo a mais na resposta é o tipo de
   * vazamento que ninguém vê revisando a tela.
   */
  hasCredentials: boolean
}

export interface AuthDoBackend {
  mode: 'cookie' | 'userpass'
  cookiePath?: string
  user?: string
  password?: string
}

export interface EntradaDePreset {
  preset: string
  host?: string
  port?: number
  url?: string
  isPublic?: boolean
  label?: string
  auth?: AuthDoBackend
}

export interface BackendMontado {
  kind: BackendKind
  url: string
  isPublic: boolean
  preset: PresetId
  label: string | null
  credenciais: string | null
}

/**
 * Traduz uma escolha do catálogo em `kind` + URL, ou explica o que falta.
 *
 * Toda a inteligência de preset mora aqui, e só aqui: o resto do sistema vê
 * três adapters, como sempre viu.
 */
export function montarDoPreset(
  entrada: EntradaDePreset,
  rede: Network,
): { montado: BackendMontado } | { problema: ErroDaApi } {
  const id = String(entrada.preset)
  if (!presetConhecido(id)) {
    return {
      problema: erro(
        'backend.unknownPreset',
        `não conheço a fonte "${id}". Escolha uma do catálogo.`,
        { preset: id },
      ),
    }
  }

  const preset = PRESETS[id]

  if (preset.pede === 'host-porta') {
    if (!entrada.host?.trim()) {
      return { problema: erro('backend.hostRequired', 'informe o host da fonte') }
    }
    const porta = Number(entrada.port ?? preset.portaPadrao?.[rede])
    if (!entrada.port && !preset.portaPadrao) {
      return { problema: erro('backend.portRequired', 'informe a porta da fonte') }
    }
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
      return {
        problema: erro(
          'backend.portRange',
          `porta ${entrada.port} fora da faixa: use um número entre 1 e 65535`,
          { porta: String(entrada.port) },
        ),
      }
    }
  }

  if (preset.pede === 'url' && !entrada.url?.trim()) {
    return { problema: erro('backend.urlRequired', 'endereço do backend obrigatório') }
  }

  const auth = entrada.auth
  const temCredencial =
    auth?.mode === 'cookie'
      ? Boolean(auth.cookiePath?.trim())
      : Boolean(auth?.user?.trim() && auth?.password)

  if (preset.precisaAutenticar && !temCredencial) {
    return {
      problema: erro(
        'backend.authRequired',
        'o RPC do Bitcoin Core precisa de autenticação: informe o caminho do ' +
          'arquivo .cookie do nó, ou usuário e senha do rpcauth',
      ),
    }
  }

  const porta = Number(entrada.port ?? preset.portaPadrao?.[rede])
  return {
    montado: {
      kind: preset.kind,
      url: preset.url({ host: entrada.host?.trim(), port: porta, url: entrada.url }, rede),
      isPublic: entrada.isPublic ?? preset.isPublic,
      preset: id,
      label: entrada.label?.trim() || null,
      credenciais: temCredencial
        ? JSON.stringify(
            auth!.mode === 'cookie'
              ? { cookiePath: auth!.cookiePath!.trim() }
              : { user: auth!.user!.trim(), password: auth!.password },
          )
        : null,
    },
  }
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

/**
 * As duas fontes públicas que existem sem ninguém cadastrar nada.
 *
 * Antes disto, a instância só garantia a fonte da própria `NETWORK`, e a
 * pergunta de 28/08 — *"está tudo apontando só pra signet, por quê?"* — tinha
 * esta resposta. Rede é propriedade da fonte desde o item 0; o que faltava era
 * mainnet **existir** para quem abre a tela pela primeira vez.
 *
 * São públicas, e a listra dirá isso na hora em que uma carteira usar uma
 * delas. Oferecer não é escolher: quem tem nó cadastra o dele e troca.
 */
const PUBLICAS_PRONTAS: { url: string; network: Network }[] = [
  { url: 'https://mempool.space/api', network: 'mainnet' },
  { url: 'https://mempool.space/signet/api', network: 'signet' },
]

export async function ensureBackendsPublicos(): Promise<void> {
  for (const fonte of PUBLICAS_PRONTAS) {
    await pool.query(
      `INSERT INTO backends (user_id, kind, url, is_public, network, preset)
       VALUES (NULL, 'esplora', $1, true, $2, 'mempool')
       ON CONFLICT (user_id, url, network) DO NOTHING`,
      [fonte.url, fonte.network],
    )
  }
}

export async function listarBackends(
  userId: number,
  network?: Network,
): Promise<BackendResumo[]> {
  await ensureBackendGlobal(loadConfig().network)
  await ensureBackendsPublicos()
  const { rows } = await pool.query<{
    id: string
    kind: BackendKind
    url: string
    is_public: boolean
    network: Network
    user_id: string | null
    preset: PresetId | null
    label: string | null
    tem_credencial: boolean
  }>(
    `SELECT id, kind, url, is_public, network, user_id, preset, label,
            credentials_encrypted IS NOT NULL AS tem_credencial
       FROM backends
      WHERE (user_id IS NULL OR user_id = $1)
        AND ($2::text IS NULL OR network = $2)
      ORDER BY CASE network WHEN 'mainnet' THEN 0 WHEN 'signet' THEN 1 ELSE 2 END,
               user_id NULLS FIRST, id`,
    [userId, network ?? null],
  )
  return rows.map(r => ({
    id: Number(r.id),
    kind: r.kind,
    url: r.url,
    isPublic: r.is_public,
    network: r.network,
    scope: r.user_id === null ? 'global' : 'own',
    preset: r.preset,
    label: r.label,
    hasCredentials: r.tem_credencial,
  }))
}

export async function criarBackend(
  userId: number,
  kind: BackendKind,
  url: string,
  isPublic: boolean,
  network: Network,
  extras: { preset?: PresetId | null; label?: string | null; credenciais?: string | null } = {},
): Promise<BackendResumo> {
  const cifrada = extras.credenciais
    ? seal(extras.credenciais, loadConfig().masterKeyHex)
    : null

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network, preset, label,
                           credentials_encrypted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public, kind = EXCLUDED.kind,
                   preset = EXCLUDED.preset, label = EXCLUDED.label,
                   -- credencial nova só substitui a antiga quando veio uma
                   credentials_encrypted = COALESCE(EXCLUDED.credentials_encrypted,
                                                    backends.credentials_encrypted)
     RETURNING id`,
    [userId, kind, url, isPublic, network, extras.preset ?? null, extras.label ?? null, cifrada],
  )
  return {
    id: Number(rows[0]!.id),
    kind,
    url,
    isPublic,
    network,
    scope: 'own',
    preset: extras.preset ?? null,
    label: extras.label ?? null,
    hasCredentials: cifrada !== null,
  }
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
): Promise<BackendResumo | null> {
  const todos = await listarBackends(userId)
  return todos.find(b => b.id === backendId) ?? null
}
