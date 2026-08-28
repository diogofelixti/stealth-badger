import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const addBackend = vi.fn()
const detectNode = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return { ...real, api: {
      ...real.api,
      addBackend: (...a: unknown[]) => addBackend(...a),
      detectNode: (...a: unknown[]) => detectNode(...a),
    } }
})

const { BackendForm } = await import('../src/components/BackendForm')

const CATALOGO: Catalog = {
  'backends.preset': 'Fonte',
  'backends.host': 'Host',
  'backends.port': 'Porta',
  'backends.labelField': 'Apelido (opcional)',
  'backends.auth': 'Autenticação',
  'backends.authCookie': 'arquivo .cookie',
  'backends.authUserPass': 'usuário e senha',
  'backends.cookiePath': 'Caminho do .cookie',
  'backends.user': 'Usuário do RPC',
  'backends.password': 'Senha do RPC',
  'backends.credentialNote': 'A credencial é cifrada e nunca volta.',
  'backends.datadir': 'Diretório de dados do nó',
  'backends.datadirHint': 'onde o bitcoind guarda os dados, por exemplo /mnt/dados2 ou ~/.bitcoin',
  'backends.detect': 'Procurar o nó',
  'backends.detectFound': 'achei um nó de {network} na altura {blocks}',
  'backends.detectMount': 'monte este diretório no container e suba de novo',
  'backends.dockerHint':
    'Este watchtower roda em container: localhost aqui é o próprio container, não a sua máquina. Use host.docker.internal.',
  'backends.save': 'Adicionar backend',
  'backends.isPublic': 'É um serviço público de terceiro',
  'backend.networkRequired': 'Rede',
  'network.mainnet': 'mainnet',
  'network.signet': 'signet',
  'network.testnet': 'testnet',
}

function montar(rede: 'mainnet' | 'signet' | 'testnet' = 'signet') {
  render(
    <BackendForm catalog={CATALOGO} lang="pt" network={rede} onSaved={() => {}} />,
  )
}

function escolher(fonte: string) {
  fireEvent.change(screen.getByLabelText(/fonte/i), { target: { value: fonte } })
}

beforeEach(() => {
  detectNode.mockReset()
  addBackend.mockReset()
  addBackend.mockResolvedValue({ id: 1 })
})

describe('BackendForm', () => {
  it('o Fulcrum já vem com a porta do protocolo Electrum', () => {
    montar()
    escolher('fulcrum')

    expect((screen.getByLabelText(/porta/i) as HTMLInputElement).value).toBe('50001')
  })

  it('o Bitcoin Core sugere a porta da rede escolhida', () => {
    montar('signet')
    escolher('core')

    expect((screen.getByLabelText(/porta/i) as HTMLInputElement).value).toBe('38332')
  })

  it('mempool.space não pergunta host nem porta — a rede escolhe o caminho', () => {
    montar()
    escolher('mempool')

    expect(screen.queryByLabelText(/host/i)).toBeNull()
    expect(screen.queryByLabelText(/porta/i)).toBeNull()
  })

  // A armadilha que custa a primeira tentativa de todo mundo.
  it('avisa que localhost não alcança a máquina de quem roda em container', () => {
    montar()
    escolher('fulcrum')

    fireEvent.change(screen.getByLabelText(/host/i), { target: { value: 'localhost' } })

    expect(screen.getByText(/host\.docker\.internal/)).toBeDefined()
  })

  it('o Core pede autenticação, e o cookie é o padrão', () => {
    montar()
    escolher('core')

    expect(screen.getByLabelText(/caminho do \.cookie/i)).toBeDefined()
  })

  it('manda o preset, o host e a porta para a API', async () => {
    montar()
    escolher('fulcrum')
    fireEvent.change(screen.getByLabelText(/host/i), { target: { value: '127.0.0.1' } })

    fireEvent.click(screen.getByText('Adicionar backend'))

    expect(addBackend).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'fulcrum', host: '127.0.0.1', port: 50001, network: 'signet' }),
    )
  })
})

describe('BackendForm — Bitcoin Core pelo diretório', () => {
  const ACHADO = {
    found: true,
    network: 'signet',
    host: 'host.docker.internal',
    url: 'http://host.docker.internal:38332',
    rpcPort: 38332,
    cookiePath: '/mnt/dados2/signet/.cookie',
    cookieReadable: true,
    reachable: true,
    blocks: 319631,
    chain: 'signet',
  }

  // Quem tem um nó sabe onde ele guarda os dados. Porta, subpasta da rede e
  // caminho do cookie são detalhe que o programa deduz.
  it('pede um campo só: o diretório do nó', () => {
    montar()
    escolher('core-datadir')

    expect(screen.getByLabelText(/diretório/i)).toBeDefined()
    expect(screen.queryByLabelText(/^host$/i)).toBeNull()
    expect(screen.queryByLabelText(/^porta$/i)).toBeNull()
    expect(screen.queryByLabelText(/caminho do \.cookie/i)).toBeNull()
  })

  it('não cadastra o atalho por diretório antes de achar o nó', () => {
    montar()
    escolher('core-datadir')

    fireEvent.click(screen.getByText('Adicionar backend'))

    expect(addBackend).not.toHaveBeenCalled()
  })

  it('procura o nó e mostra a rede e a altura que achou', async () => {
    detectNode.mockResolvedValue(ACHADO)
    montar()
    escolher('core-datadir')
    fireEvent.change(screen.getByLabelText(/diretório/i), {
      target: { value: '/mnt/dados2' },
    })

    fireEvent.click(screen.getByRole('button', { name: /procurar/i }))

    await waitFor(() => expect(detectNode).toHaveBeenCalledWith('/mnt/dados2'))
    await waitFor(() => expect(screen.getByText(/319\.631|319631/)).toBeDefined())
    expect(screen.getByText(/signet/)).toBeDefined()
  })

  // O container não enxerga o disco de quem hospeda: dizer "não achei" sem
  // dizer isso manda a pessoa procurar defeito onde não há.
  it('diretório que o container não enxerga mostra o trecho do compose', async () => {
    detectNode.mockResolvedValue({
      found: false,
      reason: 'notMounted',
      hint: 'este diretório não existe dentro do container',
      compose: 'services:\n  backend:\n    volumes:\n      - /mnt/dados2:/mnt/dados2:ro',
    })
    montar()
    escolher('core-datadir')
    fireEvent.change(screen.getByLabelText(/diretório/i), { target: { value: '/mnt/dados2' } })

    fireEvent.click(screen.getByRole('button', { name: /procurar/i }))

    await waitFor(() => expect(screen.getByText(/volumes:/)).toBeDefined())
  })

  it('cadastra com o que a detecção achou, sem pedir mais nada', async () => {
    detectNode.mockResolvedValue(ACHADO)
    montar()
    escolher('core-datadir')
    fireEvent.change(screen.getByLabelText(/diretório/i), { target: { value: '/mnt/dados2' } })
    fireEvent.click(screen.getByRole('button', { name: /procurar/i }))
    await waitFor(() => expect(screen.getByText(/signet/)).toBeDefined())

    fireEvent.click(screen.getByText('Adicionar backend'))

    await waitFor(() =>
      expect(addBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: 'core',
          host: 'host.docker.internal',
          port: 38332,
          network: 'signet',
          auth: { mode: 'cookie', cookiePath: '/mnt/dados2/signet/.cookie' },
        }),
      ),
    )
  })
})
