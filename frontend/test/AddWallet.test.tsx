import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Backend, Catalog } from '../src/lib/api'

const backends = vi.fn<() => Promise<Backend[]>>()
const addWallet = vi.fn()
const addBackend = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      backends: () => backends(),
      addWallet: (...a: unknown[]) => addWallet(...a),
      addBackend: (...a: unknown[]) => addBackend(...a),
    },
  }
})

const { AddWallet } = await import('../src/components/AddWallet')

const CATALOGO: Catalog = {
  'wallets.formTitle': 'Vigiar uma carteira',
  'wallets.labelPlaceholder': 'Rótulo',
  'wallets.keyPlaceholder': 'xpub, ypub, zpub',
  'wallets.modeKey': 'Carteira inteira',
  'wallets.modeAddress': 'Um endereço',
  'wallets.addressPlaceholder': 'bc1..., 3..., 1...',
  'wallets.addressNote': 'Vigia só este endereço.',
  'wallets.watchOnly': 'Somente chaves públicas.',
  'wallets.submit': 'Começar a vigiar',
  'wallets.submitting': 'cadastrando...',
  'backends.title': 'Vigiar por',
  'backends.global': 'configurado no servidor',
  'backends.own': 'seu',
  'backends.addToggle': '+ outro backend',
  'backends.urlPlaceholder': 'https://... ou electrum://host:50001',
  'backends.isPublic': 'É um serviço público de terceiro',
  'backends.publicNote': 'Um backend público enxerga quais endereços você consulta.',
  'backends.save': 'Adicionar backend',
  'backend.networkRequired': 'Rede',
  'network.mainnet': 'mainnet',
  'network.signet': 'signet',
  'network.testnet': 'testnet',
}

const GLOBAL: Backend = {
  id: 1,
  kind: 'esplora',
  url: 'https://mempool.space/signet/api',
  isPublic: true,
  network: 'signet',
  scope: 'global',
}

const MEU: Backend = {
  id: 2,
  kind: 'electrum',
  url: 'electrum://127.0.0.1:50001',
  isPublic: false,
  network: 'signet',
  scope: 'own',
}

function montar() {
  return render(<AddWallet catalog={CATALOGO} lang="pt" onAdded={() => {}} />)
}

beforeEach(() => {
  backends.mockResolvedValue([GLOBAL])
  addWallet.mockResolvedValue({})
  addBackend.mockReset()
})

describe('AddWallet — escolha de backend', () => {
  it('oferece o backend do servidor sem o usuário precisar cadastrar nada', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
  })

  it('vigia pelo backend escolhido, e não sempre pelo primeiro', async () => {
    backends.mockResolvedValue([GLOBAL, MEU])
    montar()

    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    fireEvent.change(screen.getByLabelText(/vigiar por/i), { target: { value: String(MEU.id) } })
    fireEvent.change(screen.getByPlaceholderText(/rótulo/i), { target: { value: 'No meu nó' } })
    fireEvent.change(screen.getByPlaceholderText(/xpub/i), { target: { value: 'zpub123' } })
    fireEvent.click(screen.getByRole('button', { name: /começar a vigiar/i }))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith('No meu nó', { key: 'zpub123' }, MEU.id),
    )
  })

  // O usuário está escolhendo por onde os endereços dele serão consultados.
  // Se a opção é pública, ele precisa ler isso na hora de escolher, não só
  // depois, no selo do topo.
  it('avisa o que um backend público enxerga, no momento da escolha', async () => {
    montar()
    await waitFor(() =>
      expect(screen.getByText(/enxerga quais endereços/i)).toBeDefined(),
    )
  })

  it('não repete o aviso quando o backend escolhido é soberano', async () => {
    backends.mockResolvedValue([MEU])
    montar()
    await waitFor(() => expect(screen.getByText(/127\.0\.0\.1/)).toBeDefined())
    expect(screen.queryByText(/enxerga quais endereços/i)).toBeNull()
  })

  it('cadastra backend novo e passa a oferecê-lo já selecionado', async () => {
    addBackend.mockResolvedValue(MEU)
    montar()

    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /outro backend/i }))
    fireEvent.change(screen.getByPlaceholderText(/electrum:\/\/host/i), {
      target: { value: 'electrum://127.0.0.1:50001' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar backend/i }))

    await waitFor(() => expect(screen.getByText(/127\.0\.0\.1/)).toBeDefined())
    expect((screen.getByLabelText(/vigiar por/i) as HTMLSelectElement).value).toBe(
      String(MEU.id),
    )
  })

  // O terceiro modelo de backend: um nó que o próprio usuário roda, falado
  // por RPC. Sem a opção no seletor, cadastrá-lo dependeria de mexer no `.env`
  // do servidor — e a postura soberana ficaria fora do alcance de quem usa a
  // instância sem administrá-la.
  it('oferece Bitcoin Core como tipo de backend', async () => {
    addBackend.mockResolvedValue({ ...MEU, kind: 'core', url: 'http://127.0.0.1:38332' })
    montar()

    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /outro backend/i }))
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'core' } })
    fireEvent.change(screen.getByPlaceholderText(/electrum:\/\/host/i), {
      target: { value: 'http://127.0.0.1:38332' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar backend/i }))

    await waitFor(() =>
      expect(addBackend).toHaveBeenCalledWith('core', 'http://127.0.0.1:38332', false, 'mainnet'),
    )
  })

  // A descrição do produto promete "endereços e carteiras". Quem publica um
  // endereço de doação quer saber quando alguém paga, sem entregar a carteira
  // inteira ao watchtower.
  it('deixa escolher entre vigiar a carteira inteira ou só um endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /um endereço/i })).toBeDefined()
  })

  it('manda o endereço, e não a chave, quando o modo é de endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /um endereço/i }))
    fireEvent.change(screen.getByPlaceholderText(/rótulo/i), { target: { value: 'Doações' } })
    fireEvent.change(screen.getByPlaceholderText(/bc1/i), {
      target: { value: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
    })
    fireEvent.click(screen.getByRole('button', { name: /começar a vigiar/i }))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith(
        'Doações',
        { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
        GLOBAL.id,
      ),
    )
  })

  it('avisa que o modo de endereço vigia só aquele endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /um endereço/i }))
    expect(screen.getByText(/vigia só este endereço/i)).toBeDefined()
  })
})
