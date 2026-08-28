import { ensureBackendsPublicos } from '../chain/backends'
import { pool } from '../db/pool'
import type { Network } from '../wallet/descriptor'
import type { FonteEscolhida } from './fonte-de-analise'

/**
 * Onde mora a escolha da fonte de análise, e o que pode ser escolhido.
 *
 * A escolha é por usuário e por rede — escolher a fonte de análise é escolher
 * **quem vê os endereços que você consulta**, e num painel multi-usuário uma
 * escolha de instância faria todo mundo herdar a exposição que o admin aceitou
 * para si.
 *
 * Candidata é qualquer fonte `esplora` daquela rede que a pessoa já enxerga:
 * as globais que a instância semeia, e as dela. Não há catálogo separado —
 * fonte de análise é fonte, do mesmo `presets.ts` e da mesma tela de cadastro.
 */
export interface CandidataDeAnalise {
  id: number
  url: string
  isPublic: boolean
  preset: string | null
  label: string | null
  /** `true` quando é esta que está valendo para a rede */
  escolhida: boolean
}

export async function fonteDeAnaliseEscolhida(
  userId: number,
  network: Network,
): Promise<FonteEscolhida | null> {
  const { rows } = await pool.query<{
    id: string
    url: string
    is_public: boolean
  }>(
    `SELECT b.id, b.url, b.is_public
       FROM user_analysis_sources s
       JOIN backends b ON b.id = s.backend_id
      WHERE s.user_id = $1 AND s.network = $2
        -- a fonte pode ter sido apagada de outro usuário; só vale o que
        -- esta pessoa ainda enxerga
        AND (b.user_id IS NULL OR b.user_id = $1)`,
    [userId, network],
  )
  const linha = rows[0]
  if (!linha) return null
  return { id: Number(linha.id), url: linha.url, isPublic: linha.is_public }
}

export async function candidatasDeAnalise(
  userId: number,
  network: Network,
): Promise<CandidataDeAnalise[]> {
  // As públicas são semeadas sob demanda, como em `listarBackends`: uma
  // instância nova precisa ter o que oferecer na primeira pergunta, e não
  // depois de alguém abrir a tela de fontes.
  await ensureBackendsPublicos()

  const { rows } = await pool.query<{
    id: string
    url: string
    is_public: boolean
    preset: string | null
    label: string | null
    escolhida: boolean
  }>(
    `SELECT b.id, b.url, b.is_public, b.preset, b.label,
            (s.backend_id IS NOT NULL) AS escolhida
       FROM backends b
       LEFT JOIN user_analysis_sources s
              ON s.backend_id = b.id AND s.user_id = $1 AND s.network = $2
      WHERE b.kind = 'esplora'
        AND b.network = $2
        AND (b.user_id IS NULL OR b.user_id = $1)
      -- a própria antes das públicas: quem tem Esplora seu deve ver o dele
      -- primeiro, e não precisar procurá-lo abaixo de três de terceiros
      ORDER BY b.is_public, b.user_id NULLS LAST, b.id`,
    [userId, network],
  )
  return rows.map(r => ({
    id: Number(r.id),
    url: r.url,
    isPublic: r.is_public,
    preset: r.preset,
    label: r.label,
    escolhida: r.escolhida,
  }))
}

export type FalhaDaEscolha = 'notFound' | 'notEsplora' | 'wrongNetwork'

/**
 * Guarda a escolha, depois de conferir que ela serve.
 *
 * As três recusas são separadas porque falham por motivos diferentes, e juntá-las
 * num "fonte inválida" manda a pessoa procurar defeito onde não há: fonte que
 * não é dela, fonte que não fala REST, e fonte de outra rede.
 */
export async function escolherFonteDeAnalise(
  userId: number,
  network: Network,
  backendId: number,
): Promise<{ ok: true } | { ok: false; reason: FalhaDaEscolha }> {
  const { rows } = await pool.query<{ kind: string; network: Network }>(
    `SELECT kind, network FROM backends
      WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [backendId, userId],
  )
  const fonte = rows[0]
  if (!fonte) return { ok: false, reason: 'notFound' }
  if (fonte.kind !== 'esplora') return { ok: false, reason: 'notEsplora' }
  if (fonte.network !== network) return { ok: false, reason: 'wrongNetwork' }

  await pool.query(
    `INSERT INTO user_analysis_sources (user_id, network, backend_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, network)
     DO UPDATE SET backend_id = EXCLUDED.backend_id, chosen_at = now()`,
    [userId, network, backendId],
  )
  return { ok: true }
}
