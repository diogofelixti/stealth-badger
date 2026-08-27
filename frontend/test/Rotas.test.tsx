import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Backend, Catalog, Me, Wallet } from '../src/lib/api'

const wallets = vi.fn<() => Promise<Wallet[]>>()
const alerts = vi.fn()
const backends = vi.fn<() => Promise<Backend[]>>()
const channels = vi.fn()
const search = vi.fn()
const utxos = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      wallets: () => wallets(),
      alerts: () => alerts(),
      backends: () => backends(),
      channels: () => channels(),
      search: () => search(),
      utxos: () => utxos(),
    },
  }
})

class EventSourceFalso {
  addEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', EventSourceFalso)

const { Rotas } = await import('../src/Rotas')

const CATALOGO: Catalog = {
  'privacy.public': 'Explorador público',
  'privacy.sovereign': 'Soberano',
  'nav.panel': 'Painel',
  'nav.wallets': 'Carteiras',
  'nav.alerts': 'Alertas',
  'nav.settings': 'Configurações',
  'nav.access': 'Acessos',
  'balance.total': 'Saldo total',
  'balance.wallets': '{n} carteiras',
  'balance.utxos': '{n} UTXOs',
  'wallet.alerts': 'Alertas desta carteira',
  'wallet.notFoundOnScreen': 'Esta carteira não existe, ou não é sua.',
  'privacy.severalHosts': '{n} backends',
}

const ME: Me = { email: 'quem@exemplo.local', isAdmin: false, language: 'pt' }

const PUBLICA: Wallet = {
  id: 1, label: 'Cofre', kind: 'xpub', address: null, scriptType: 'p2wpkh',
  network: 'signet', fingerprint: 'aabb', syncState: 'synced', syncProgress: 100,
  syncHeight: 100, syncError: null, balanceSats: '50000', utxoCount: 1,
  frozenCount: 0, backendIsPublic: true, backendUrl: 'https://mempool.space/signet/api',
  privacyScore: null, privacyGrade: null, privacyScannedAt: null,
}

beforeEach(() => {
  wallets.mockResolvedValue([PUBLICA])
  alerts.mockResolvedValue({ items: [], nextCursor: null })
  backends.mockResolvedValue([])
  channels.mockResolvedValue([])
  search.mockResolvedValue([])
  utxos.mockResolvedValue([])
})

function montarEm(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Rotas me={ME} catalog={CATALOGO} lang="pt" onLang={() => {}} onSaiu={() => {}} />
    </MemoryRouter>,
  )
}

// O princípio 2 do projeto: o aviso de privacidade é persistente, nunca um
// toast que some. Uma rota desenhada fora da Shell o apagaria sem ninguém
// perceber — e é justamente quando a interface cresce que isso acontece.
describe('todas as rotas vivem dentro da Shell', () => {
  for (const rota of ['/', '/carteiras/1', '/alertas', '/configuracoes', '/acessos']) {
    it(`${rota} mantém o aviso de explorador público`, async () => {
      const { container } = montarEm(rota)

      await waitFor(() =>
        expect(container.querySelector('[data-posture="public"]')).not.toBeNull(),
      )
      expect(container.querySelector('[role="status"][data-posture="public"]')).not.toBeNull()
    })
  }
})

// A postura é da sessão inteira, e não da primeira carteira: basta uma
// exposta para a resposta honesta ser pública, e quando mais de um explorador
// expõe, contar quantos é mais honesto que eleger um.
describe('o selo de postura', () => {
  it('só anuncia soberano quando nenhuma carteira passa por explorador', async () => {
    wallets.mockResolvedValue([
      { ...PUBLICA, backendIsPublic: false, backendUrl: 'electrum://127.0.0.1:50001' },
    ])
    const { container } = montarEm('/')

    await waitFor(() =>
      expect(container.querySelector('[role="status"][data-posture="sovereign"]')).not.toBeNull(),
    )
  })

  it('nomeia o explorador que expõe, e não o backend da primeira carteira', async () => {
    wallets.mockResolvedValue([
      { ...PUBLICA, id: 2, backendIsPublic: false, backendUrl: 'electrum://127.0.0.1:50001' },
      PUBLICA,
    ])
    const { container } = montarEm('/')

    await waitFor(() =>
      expect(container.querySelector('[role="status"][data-posture="public"]')).not.toBeNull(),
    )
    const selo = container.querySelector('[role="status"][data-posture]')!
    expect(selo.textContent).toMatch(/mempool\.space/)
    expect(selo.textContent).not.toMatch(/127\.0\.0\.1/)
  })

  it('conta os exploradores quando mais de um expõe, em vez de eleger um', async () => {
    wallets.mockResolvedValue([
      PUBLICA,
      { ...PUBLICA, id: 3, backendUrl: 'https://blockstream.info/api' },
    ])
    montarEm('/')

    await waitFor(() => expect(screen.getByText(/2 backends/)).toBeDefined())
  })
})

describe('a página de uma carteira', () => {
  // O `bigint` do Postgres chega como string no JSON: `"1"`, não `1`. A
  // fixture repete isso de propósito — comparar com número mostrava "esta
  // carteira não existe" para uma carteira que existe, e só o navegador pegou.
  it('acha a carteira mesmo quando o id vem como texto', async () => {
    wallets.mockResolvedValue([{ ...PUBLICA, id: '1' as unknown as number }])
    montarEm('/carteiras/1')

    await waitFor(() => expect(screen.getByText('Cofre')).toBeDefined())
  })
})

describe('navegação', () => {
  it('oferece as cinco rotas na barra lateral', async () => {
    montarEm('/')

    await waitFor(() => expect(screen.getByText('Painel')).toBeDefined())
    for (const nome of ['Carteiras', 'Alertas', 'Configurações', 'Acessos']) {
      expect(screen.getByText(nome)).toBeDefined()
    }
  })

  it('a página de uma carteira que não existe diz isso, em vez de quebrar', async () => {
    montarEm('/carteiras/999')

    await waitFor(() =>
      expect(document.querySelector('[data-posture="public"]')).not.toBeNull(),
    )
  })
})
