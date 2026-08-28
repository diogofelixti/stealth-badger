import { execFile } from 'node:child_process'
import { PERFIS, type Perfil } from './controle'

/**
 * Criar o container de um caminho externo, pela tela.
 *
 * ── A premissa que caiu ───────────────────────────────────────────────────
 * Em 28/08 ficou escrito que `up` não existe na API do Docker Engine: existem
 * `start` e `stop`, sobre container que já existe. Isso continua verdade, e a
 * conclusão tirada dali — que criar pela tela exigiria reescrever a definição
 * do serviço dentro do backend, fazendo tela e `docker-compose.yml` divergirem
 * em silêncio — é que estava errada.
 *
 * O que faltava não era uma rota do engine: era o **CLI do compose**. Ele lê o
 * `docker-compose.yml` que já existe, então não há definição duplicada e não há
 * o que divergir. É o mesmo caminho que o anchor-os usa no dashboard dele.
 *
 * ── O que este arquivo não faz ────────────────────────────────────────────
 * Não monta comando a partir de string do cliente. `execFile` recebe um vetor
 * de argumentos e **não** passa por shell: não há interpretador entre isto e o
 * processo, e o perfil vem da mesma lista branca de três nomes que o resto do
 * módulo usa. O que muda em relação a 28/08 é que agora existe um processo
 * filho no caminho; a garantia de que nenhuma string do cliente vira comando
 * continua sendo de forma, e não de validação.
 */
export interface ResultadoDoCompose {
  ok: boolean
  erro?: string
}

export type ExecutorDoCompose = (
  args: string[],
  dir: string,
) => Promise<ResultadoDoCompose>

/**
 * Dez minutos, e não os cinco segundos do engine.
 *
 * `create` puxa imagem, e o `tailscale` e o `cloudflared` deste projeto são
 * imagens derivadas que podem precisar ser construídas. O prazo é longo porque
 * a chamada é assíncrona: quem espera é o container em criação, nunca a rota.
 */
const PRAZO_MS = 10 * 60_000

/** Onde o `docker-compose.yml` está, visto de dentro do container. */
export function diretorioDoProjeto(): string | null {
  const dir = process.env.COMPOSE_DIR?.trim()
  return dir ? dir : null
}

function projeto(): string {
  return process.env.COMPOSE_PROJECT?.trim() || 'coin-controll'
}

export const executarCompose: ExecutorDoCompose = (args, dir) =>
  new Promise(resolve => {
    execFile(
      'docker',
      args,
      { cwd: dir, timeout: PRAZO_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, _saida, erroPadrao) => {
        if (!err) return resolve({ ok: true })
        const texto = (erroPadrao || err.message || '').trim()
        resolve({ ok: false, erro: texto.slice(0, 400) || 'docker compose falhou' })
      },
    )
  })

/** Uma criação por perfil de cada vez, e o que a última deixou como erro. */
const emAndamento = new Set<Perfil>()
const ultimoErro = new Map<Perfil, string>()

export type PedidoDeCriacao = 'started' | 'running' | 'unavailable'

export interface AndamentoDaCriacao {
  creating: boolean
  error?: string
}

export function andamentoDaCriacao(perfil: Perfil): AndamentoDaCriacao {
  const erro = ultimoErro.get(perfil)
  return {
    creating: emAndamento.has(perfil),
    ...(erro !== undefined ? { error: erro } : {}),
  }
}

export function esquecerCriacoes(): void {
  emAndamento.clear()
  ultimoErro.clear()
}

/**
 * Dispara a criação e volta na hora.
 *
 * Volta na hora porque a rota não pode esperar: puxar imagem passa do prazo de
 * leitura do nginx, e uma requisição pendurada por dois minutos aparece para
 * quem clicou como painel travado. Quem conta o fim é `GET /api/access`, que a
 * tela já consulta para saber o estado de cada caminho.
 */
export function criarPerfil(
  perfil: Perfil,
  executor: ExecutorDoCompose = executarCompose,
): PedidoDeCriacao {
  if (!PERFIS.includes(perfil)) return 'unavailable'
  const dir = diretorioDoProjeto()
  if (!dir) return 'unavailable'
  if (emAndamento.has(perfil)) return 'running'

  emAndamento.add(perfil)
  ultimoErro.delete(perfil)

  void executor(
    // `up -d --no-deps`, e não `create`.
    //
    // Duas medições decidiram isto, as duas em 28/08:
    //
    // 1. `create tor` sobe a cadeia de `depends_on` — o `tor` depende do
    //    `nginx`, que depende do `backend` — e **recria** esses containers
    //    quando a definição deles mudou. O painel se recriou no meio da
    //    própria requisição e a pilha inteira caiu, com `000` no health até
    //    alguém subir na mão;
    // 2. `create` não aceita `--no-deps`. Só `up` aceita, e é ele que isola de
    //    verdade o serviço pedido. Como ligar é o que o botão quer dizer, `up
    //    -d` faz as duas metades numa chamada só.
    ['compose', '-p', projeto(), '--profile', perfil, 'up', '-d', '--no-deps', perfil],
    dir,
  )
    .then(r => {
      if (!r.ok) ultimoErro.set(perfil, r.erro ?? 'docker compose falhou')
    })
    .catch((err: unknown) => ultimoErro.set(perfil, (err as Error).message))
    .finally(() => emAndamento.delete(perfil))

  return 'started'
}
