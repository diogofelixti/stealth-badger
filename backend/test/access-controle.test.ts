import { beforeEach, describe, expect, it } from 'vitest'
import { controlarPerfil, estadoDoPerfil, type ChamadaDoEngine } from '../src/access/controle'

/**
 * A superfície que a decisão de 28/08 abriu, e o que a estreita.
 *
 * Com o socket do Docker montado, uma sessão do painel vale execução de código
 * na máquina que hospeda. O que impede isso de virar "o cliente manda o
 * comando" é estrutural, e é o que estes casos provam: nenhuma string do
 * cliente entra em caminho de URL, só três perfis existem, só dois verbos
 * existem, e qualquer coisa fora disso morre antes de o engine ser tocado.
 */
type Chamada = { metodo: string; caminho: string }

function engineFalso(containers: unknown[], respostaDaAcao = 204) {
  const chamadas: Chamada[] = []
  const chamar: ChamadaDoEngine = async (metodo, caminho) => {
    chamadas.push({ metodo, caminho })
    if (caminho.startsWith('/containers/json')) {
      return { status: 200, body: JSON.stringify(containers) }
    }
    return { status: respostaDaAcao, body: '' }
  }
  return { chamar, chamadas }
}

const container = (id: string, state: string, servico = 'tor', projeto = 'badger') => ({
  Id: id,
  Names: ['/' + projeto + '-' + servico + '-1'],
  State: state,
  Labels: {
    'com.docker.compose.service': servico,
    'com.docker.compose.project': projeto,
  },
})

beforeEach(() => {
  process.env.COMPOSE_PROJECT = 'badger'
})

describe('controlarPerfil', () => {
  it('liga um container que existe e está parado', async () => {
    const { chamar, chamadas } = engineFalso([container('abc123', 'exited')])

    const r = await controlarPerfil('tor', 'up', chamar)

    expect(r).toMatchObject({ ok: true, profile: 'tor', action: 'up' })
    expect(chamadas.at(-1)).toEqual({ metodo: 'POST', caminho: '/containers/abc123/start' })
  })

  it('desliga um container que existe e está de pé', async () => {
    const { chamar, chamadas } = engineFalso([container('abc123', 'running')])

    const r = await controlarPerfil('tor', 'down', chamar)

    expect(r.ok).toBe(true)
    expect(chamadas.at(-1)).toEqual({ metodo: 'POST', caminho: '/containers/abc123/stop' })
  })

  // 304 é o engine dizendo "já está assim". Não é erro, e tratar como erro
  // faria o botão piscar vermelho por ter conseguido o que pediu.
  it('container que já estava no estado pedido é sucesso, não erro', async () => {
    const { chamar } = engineFalso([container('abc123', 'running')], 304)

    expect((await controlarPerfil('tor', 'up', chamar)).ok).toBe(true)
  })

  /*
   * A falha honesta deste item, e a razão de ela existir.
   *
   * O engine sabe iniciar e parar container que existe; ele não sabe o que o
   * `docker-compose.yml` diz. Criar o container do zero pela API exigiria
   * reescrever a definição do serviço aqui dentro, e aí a tela e o compose
   * passariam a discordar em silêncio na primeira vez que um deles mudasse.
   *
   * Então o painel não inventa: quando o container nunca foi criado, ele
   * devolve o comando exato de uma linha, e é a mesma escolha do item C ao
   * dizer "este diretório não existe dentro do container" em vez de "não
   * achei".
   */
  it('perfil que nunca subiu devolve o comando de criar, em vez de erro seco', async () => {
    const { chamar, chamadas } = engineFalso([])

    const r = await controlarPerfil('tor', 'up', chamar)

    expect(r).toMatchObject({ ok: false, reason: 'notCreated' })
    expect(r.command).toBe('docker compose --profile tor create')
    expect(chamadas.every(c => c.metodo === 'GET')).toBe(true)
  })

  // Duas instâncias do projeto na mesma máquina: escolher uma é escolher errado
  // metade das vezes, e a metade errada desliga o painel de outra pessoa.
  it('dois containers para o mesmo perfil não são desempatados no chute', async () => {
    const { chamar, chamadas } = engineFalso([
      container('abc123', 'running'),
      container('def456', 'running'),
    ])

    const r = await controlarPerfil('tor', 'down', chamar)

    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' })
    expect(chamadas.every(c => c.metodo === 'GET')).toBe(true)
  })

  it('engine fora do ar não derruba a rota', async () => {
    const chamar: ChamadaDoEngine = async () => {
      throw new Error('connect ENOENT /var/run/docker.sock')
    }

    expect(await controlarPerfil('tor', 'up', chamar)).toMatchObject({
      ok: false,
      reason: 'unreachable',
    })
  })

  it('resposta de erro do engine vira reason, e não exceção', async () => {
    const chamar: ChamadaDoEngine = async (_m, caminho) =>
      caminho.startsWith('/containers/json')
        ? { status: 200, body: JSON.stringify([container('abc123', 'exited')]) }
        : { status: 500, body: '{"message":"driver failed"}' }

    expect(await controlarPerfil('tor', 'up', chamar)).toMatchObject({
      ok: false,
      reason: 'engineError',
    })
  })

  // O filtro por projeto existe para o painel não alcançar o `tor` de outro
  // compose que por acaso rode na mesma máquina.
  it('a busca é filtrada por serviço e por projeto do compose', async () => {
    const { chamar, chamadas } = engineFalso([container('abc123', 'exited')])

    await controlarPerfil('cloudflared', 'up', chamar)

    const busca = decodeURIComponent(chamadas[0]!.caminho)
    expect(busca).toContain('com.docker.compose.service=cloudflared')
    expect(busca).toContain('com.docker.compose.project=badger')
  })
})

describe('estadoDoPerfil', () => {
  it('container de pé é o caminho de pé, medido pelo Docker', async () => {
    const { chamar } = engineFalso([container('abc123', 'running')])

    expect(await estadoDoPerfil('tor', chamar)).toEqual({
      status: 'up',
      statusSource: 'docker',
    })
  })

  it('container parado é o caminho desligado', async () => {
    const { chamar } = engineFalso([container('abc123', 'exited')])

    expect(await estadoDoPerfil('tor', chamar)).toEqual({
      status: 'down',
      statusSource: 'docker',
    })
  })

  it('container que não existe é o caminho desligado', async () => {
    const { chamar } = engineFalso([])

    expect(await estadoDoPerfil('tor', chamar)).toEqual({
      status: 'down',
      statusSource: 'docker',
    })
  })

  // Sem conseguir perguntar ao engine, a sonda não vira vermelha: ela vira
  // "não sei", que é a mesma regra das outras duas.
  it('engine mudo não vira "desligado"', async () => {
    const chamar: ChamadaDoEngine = async () => {
      throw new Error('ECONNREFUSED')
    }

    expect(await estadoDoPerfil('tor', chamar)).toEqual({
      status: 'unknown',
      statusSource: 'none',
    })
  })
})
