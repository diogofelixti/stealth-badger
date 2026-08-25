import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Alert, Catalog, Me, Wallet } from '../src/lib/api'

const wallets = vi.fn<() => Promise<Wallet[]>>()
const alerts = vi.fn<() => Promise<Alert[]>>()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: { ...real.api, wallets: () => wallets(), alerts: () => alerts() },
  }
})

// jsdom não tem EventSource, e o feed ao vivo abre um no primeiro render.
class EventSourceFalso {
  addEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', EventSourceFalso)

const { Dashboard } = await import('../src/pages/Dashboard')

const CATALOGO: Catalog = {
  'wallets.empty': 'Nenhuma carteira vigiada ainda.',
  'wallets.emptyHint': 'Cole a chave pública estendida da carteira.',
  'wallets.add': '+ Vigiar carteira',
  'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub ou vpub',
  'balance.total': 'Saldo total',
  'balance.wallets': '{n} carteiras',
  'balance.utxos': '{n} UTXOs',
}

const ME: Me = { email: 'quem@exemplo.local', isAdmin: true, language: 'pt' }

const CARTEIRA: Wallet = {
  id: 1,
  label: 'Cofre',
  scriptType: 'p2wpkh',
  network: 'signet',
  fingerprint: '7ef32bdb',
  syncState: 'synced',
  syncProgress: 100,
  syncHeight: 319333,
  balanceSats: '11000',
  utxoCount: 2,
  frozenCount: 0,
  backendIsPublic: true,
  backendUrl: 'https://mempool.space/signet/api',
}

function montar() {
  return render(
    <Dashboard
      me={ME}
      catalog={CATALOGO}
      lang="pt"
      onLang={() => {}}
      onSaiu={() => {}}
    />,
  )
}

beforeEach(() => {
  alerts.mockResolvedValue([])
})

describe('Dashboard — primeiro acesso', () => {
  // Sem isto a tela de estreia mostra "Saldo total 0 sats" e um link de texto
  // minúsculo. Quem chega pela primeira vez não descobre que precisa colar uma
  // chave, e o produto parece não fazer nada.
  it('abre o formulário sozinho quando não há carteira nenhuma', async () => {
    wallets.mockResolvedValue([])
    montar()

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/xpub, ypub, zpub/)).toBeDefined(),
    )
  })

  it('diz que ainda não há carteira, em vez de anunciar saldo zero', async () => {
    wallets.mockResolvedValue([])
    const { container } = montar()

    await waitFor(() => expect(screen.getByText(/nenhuma carteira vigiada/i)).toBeDefined())
    expect(container.textContent).not.toMatch(/saldo total/i)
  })

  it('explica o que colar', async () => {
    wallets.mockResolvedValue([])
    montar()

    await waitFor(() =>
      expect(screen.getByText(/cole a chave pública estendida/i)).toBeDefined(),
    )
  })
})

describe('Dashboard — com carteira', () => {
  it('não abre o formulário sozinho: o saldo é o assunto', async () => {
    wallets.mockResolvedValue([CARTEIRA])
    montar()

    await waitFor(() => expect(screen.getByText(/saldo total/i)).toBeDefined())
    expect(screen.queryByPlaceholderText(/xpub, ypub, zpub/)).toBeNull()
  })

  it('mantém o botão de adicionar disponível', async () => {
    wallets.mockResolvedValue([CARTEIRA])
    montar()

    await waitFor(() => expect(screen.getByText(/\+ vigiar carteira/i)).toBeDefined())
  })

  // O estado inicial some porque chegou carteira, não porque o carregamento
  // terminou: piscar o formulário durante o fetch seria pior que não tê-lo.
  it('não pisca o formulário enquanto as carteiras carregam', () => {
    wallets.mockReturnValue(new Promise(() => {}))
    montar()

    expect(screen.queryByPlaceholderText(/xpub, ypub, zpub/)).toBeNull()
    expect(screen.queryByText(/nenhuma carteira vigiada/i)).toBeNull()
  })
})

describe('Dashboard — saldo durante a ressincronização', () => {
  // O worker remarca a carteira como `importing` a cada tick. Numa carteira
  // com histórico grande isso é a maior parte do tempo, e zerar o total
  // enquanto se reconfere faz o painel mentir: o saldo é conhecido.
  it('mantém o saldo de carteira que já sincronizou antes', async () => {
    wallets.mockResolvedValue([
      { ...CARTEIRA, syncState: 'importing', syncHeight: 319347, balanceSats: '7483514' },
    ])
    montar()

    await waitFor(() => expect(screen.getByText('7.483.514')).toBeDefined())
  })

  it('conta os UTXOs dela também', async () => {
    wallets.mockResolvedValue([
      { ...CARTEIRA, syncState: 'importing', syncHeight: 319347, utxoCount: 30 },
    ])
    montar()

    await waitFor(() => expect(screen.getByText(/30 UTXOs/)).toBeDefined())
  })

  // Primeira importação é outra coisa: aí o dado realmente não existe, e
  // somar zero é honesto.
  it('não conta carteira que nunca terminou uma sincronização', async () => {
    wallets.mockResolvedValue([
      { ...CARTEIRA, syncState: 'importing', syncHeight: null, balanceSats: '7483514' },
    ])
    montar()

    await waitFor(() => expect(screen.getByText(/saldo total/i)).toBeDefined())
    expect(screen.queryByText('7.483.514')).toBeNull()
  })

  it('nem carteira recém-cadastrada, ainda em pending', async () => {
    wallets.mockResolvedValue([
      { ...CARTEIRA, syncState: 'pending', syncHeight: null, balanceSats: '7483514' },
    ])
    montar()

    await waitFor(() => expect(screen.getByText(/saldo total/i)).toBeDefined())
    expect(screen.queryByText('7.483.514')).toBeNull()
  })
})
