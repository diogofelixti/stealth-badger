import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  andamentoDaCriacao,
  criarPerfil,
  diretorioDoProjeto,
  esquecerCriacoes,
  type ExecutorDoCompose,
} from '../src/access/compose'
import { controlarPerfil, type ChamadaDoEngine } from '../src/access/controle'

/**
 * Criar o container pela tela.
 *
 * A premissa que caiu em 28/08: "criar exigiria reescrever a definição do
 * serviço dentro do backend, e aí tela e compose divergiriam em silêncio". O
 * CLI do compose lê o `docker-compose.yml` que já existe — não há definição
 * duplicada, e por isso não há o que divergir.
 *
 * O que estes casos protegem é a outra metade: nenhuma string do cliente vira
 * comando. O argv é montado aqui, o perfil vem da lista branca, e não há shell
 * no caminho.
 */
const AMBIENTE = {
  dir: process.env.COMPOSE_DIR,
  projeto: process.env.COMPOSE_PROJECT,
}

beforeEach(() => {
  esquecerCriacoes()
  process.env.COMPOSE_DIR = '/projeto'
  process.env.COMPOSE_PROJECT = 'coin-controll'
})

afterEach(() => {
  esquecerCriacoes()
  for (const [nome, valor] of [
    ['COMPOSE_DIR', AMBIENTE.dir],
    ['COMPOSE_PROJECT', AMBIENTE.projeto],
  ] as const) {
    if (valor === undefined) delete process.env[nome]
    else process.env[nome] = valor
  }
})

function executorFalso(resultado = { ok: true }) {
  const chamadas: { args: string[]; dir: string }[] = []
  const executar: ExecutorDoCompose = async (args, dir) => {
    chamadas.push({ args, dir })
    return resultado
  }
  return { executar, chamadas }
}

describe('criarPerfil', () => {
  it('monta o argv ele mesmo, com o perfil da lista branca', async () => {
    const { executar, chamadas } = executorFalso()
    expect(criarPerfil('tor', executar)).toBe('started')
    await esperarFim()

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.args).toEqual([
      'compose',
      '-p',
      'coin-controll',
      '--profile',
      'tor',
      'up',
      '-d',
      '--no-deps',
      'tor',
    ])
    expect(chamadas[0]!.dir).toBe('/projeto')
  })

  it('nomeia o serviço, para não recriar o resto do compose junto', async () => {
    // `create` sem serviço criaria também postgres, backend, frontend e nginx,
    // que não têm profile e por isso entram sempre — e o backend recriado é o
    // processo que está atendendo esta requisição.
    const { executar, chamadas } = executorFalso()
    criarPerfil('cloudflared', executar)
    await esperarFim()
    expect(chamadas[0]!.args.at(-1)).toBe('cloudflared')
  })

  it('não encosta no que já está de pé', async () => {
    // O `tor` tem `depends_on: [nginx]`, e o nginx depende do backend. Sem
    // `--no-deps`, o compose recriou os dois ao criar o tor, e o painel caiu
    // no meio da própria requisição — medido em 28/08, `000` no health até
    // alguém subir a pilha na mão. `create` não aceita a flag; `up` aceita.
    const { executar, chamadas } = executorFalso()
    criarPerfil('tor', executar)
    await esperarFim()
    expect(chamadas[0]!.args).toContain('--no-deps')
  })

  it('sem o diretório do projeto montado, não há o que chamar', () => {
    delete process.env.COMPOSE_DIR
    const { executar, chamadas } = executorFalso()
    expect(criarPerfil('tor', executar)).toBe('unavailable')
    expect(chamadas).toHaveLength(0)
    expect(diretorioDoProjeto()).toBeNull()
  })

  it('dois cliques não viram duas criações', async () => {
    let liberar = (): void => {}
    const presa = new Promise<{ ok: boolean }>(resolve => {
      liberar = () => resolve({ ok: true })
    })
    let chamadas = 0
    const executar: ExecutorDoCompose = () => {
      chamadas += 1
      return presa
    }

    expect(criarPerfil('tailscale', executar)).toBe('started')
    expect(criarPerfil('tailscale', executar)).toBe('running')
    expect(andamentoDaCriacao('tailscale').creating).toBe(true)

    liberar()
    await esperarFim()
    expect(chamadas).toBe(1)
    expect(andamentoDaCriacao('tailscale').creating).toBe(false)
  })

  it('o erro do compose fica guardado, e a tela pode dizer qual foi', async () => {
    const { executar } = executorFalso({ ok: false, erro: 'no such image' } as never)
    criarPerfil('tor', executar)
    await esperarFim()

    expect(andamentoDaCriacao('tor')).toEqual({ creating: false, error: 'no such image' })
  })

  it('perfil fora da lista branca não chega ao executor', () => {
    const { executar, chamadas } = executorFalso()
    expect(criarPerfil('postgres' as never, executar)).toBe('unavailable')
    expect(chamadas).toHaveLength(0)
  })
})

describe('controlarPerfil, quando o container não existe', () => {
  const engineVazio: ChamadaDoEngine = async caminho =>
    caminho === 'GET' ? { status: 200, body: '[]' } : { status: 200, body: '[]' }

  it('cria em segundo plano e responde na hora', async () => {
    const { executar } = executorFalso()
    const r = await controlarPerfil('tor', 'up', engineVazio, {
      criar: perfil => criarPerfil(perfil, executar),
    })
    await esperarFim()

    expect(r.ok).toBe(true)
    expect(r.state).toBe('creating')
    expect(r.command).toBeUndefined()
  })

  it('sem quem crie, continua devolvendo o comando de uma linha', async () => {
    // A instalação que não montou o diretório do projeto não perde a saída que
    // tinha em 28/08: ela recebe o comando exato, uma vez só.
    const r = await controlarPerfil('tor', 'up', engineVazio)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('notCreated')
    expect(r.command).toBe('docker compose --profile tor create')
  })

  it('desligar não cria nada', async () => {
    const { executar, chamadas } = executorFalso()
    const r = await controlarPerfil('tor', 'down', engineVazio, {
      criar: perfil => criarPerfil(perfil, executar),
    })
    expect(r.reason).toBe('notCreated')
    expect(chamadas).toHaveLength(0)
  })
})

/** Deixa o microtask do executor rodar antes da asserção. */
async function esperarFim(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
