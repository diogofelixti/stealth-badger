import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const addBackend = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return { ...real, api: { ...real.api, addBackend: (...a: unknown[]) => addBackend(...a) } }
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
