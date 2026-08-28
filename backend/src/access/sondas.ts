/**
 * Se cada caminho externo está de pé — medido, e não deduzido da configuração.
 *
 * `enabled` diz que **alguém configurou** o caminho. Não diz que ele funciona:
 * um `.onion` no arquivo com o Tor parado, ou um `TUNNEL_TOKEN` no `.env` com o
 * `cloudflared` fora do ar, são exatamente o caso em que a pessoa acha que está
 * publicada e não está. Daí `status` existir separado de `enabled`.
 *
 * Três valores, e o terceiro é o que importa:
 *
 * - `up` — a sonda perguntou e o caminho respondeu que sim;
 * - `down` — a sonda perguntou e o caminho respondeu que não;
 * - `unknown` — **a sonda não conseguiu perguntar.**
 *
 * Colapsar `unknown` em `down` daria um indicador mais simples e uma tela que
 * mente: ela diria "desligado" quando a verdade é "não sei olhar daqui". Um
 * watchtower que inventa medição não tem como cobrar honestidade de ninguém.
 */
export type EstadoDoCaminho = 'up' | 'down' | 'unknown'

/** Como o estado foi medido. `none` é o que a tela usa para dizer que não olhou. */
export type FonteDoEstado = 'docker' | 'dns' | 'http' | 'none'

export interface Sonda {
  status: EstadoDoCaminho
  statusSource: FonteDoEstado
}

const NAO_SEI: Sonda = { status: 'unknown', statusSource: 'none' }

/** Códigos de DNS que são **resposta** — o nome não existe — e não falha da rede. */
const NOME_AUSENTE = new Set(['ENOTFOUND', 'ENODATA', 'NOTFOUND'])

export type ResolvedorDns = (nome: string) => Promise<string[]>

/**
 * O nome da MagicDNS existe?
 *
 * A Tailscale publica o registro de `<máquina>.<tailnet>.ts.net` assim que a
 * máquina entra na tailnet, então resolver o nome prova que ela entrou. O que
 * isto **não** prova é que você alcança o painel: só quem está na mesma tailnet
 * alcança o 100.x que o registro aponta — e é isso que a página escreve embaixo
 * do indicador, em vez de deixar o verde sugerir mais do que ele mediu.
 */
export async function sondarTailscale(
  hostname: string,
  resolver: ResolvedorDns,
): Promise<Sonda> {
  try {
    const enderecos = await resolver(hostname)
    return { status: enderecos.length > 0 ? 'up' : 'down', statusSource: 'dns' }
  } catch (err) {
    const codigo = (err as { code?: string }).code ?? ''
    if (NOME_AUSENTE.has(codigo)) return { status: 'down', statusSource: 'dns' }
    // Resolvedor fora do ar não é nome inexistente.
    return NAO_SEI
  }
}

/**
 * O túnel tem conexão com a borda da Cloudflare?
 *
 * `/ready` é o endpoint de prontidão do próprio `cloudflared`, servido pela
 * porta de métricas. Ele responde 200 assim que o processo sobe, ainda sem
 * conexão nenhuma — por isso `readyConnections` é conferido: verde com zero
 * conexões diria que o painel está publicado quando ele não é alcançável de
 * lugar nenhum.
 *
 * Sem `--metrics` no compose não há a quem perguntar, e aí o estado é `unknown`
 * em vez de `down`: o túnel pode estar perfeitamente de pé.
 */
export async function sondarCloudflare(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<Sonda> {
  try {
    const res = await fetchFn(url)
    if (!res.ok) return { status: 'down', statusSource: 'http' }

    // Corpo ausente ou ilegível não desmente o 200: o processo respondeu.
    const corpo = (await res.json().catch(() => null)) as {
      readyConnections?: number
    } | null
    const conexoes = corpo?.readyConnections
    const pronto = conexoes === undefined || conexoes > 0
    return { status: pronto ? 'up' : 'down', statusSource: 'http' }
  } catch {
    return NAO_SEI
  }
}
