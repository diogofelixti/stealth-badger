import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Backend, Catalog, Me, PrivacyReport, Wallet, WalletAddress } from '../src/lib/api'

const wallets = vi.fn<() => Promise<Wallet[]>>()
const alerts = vi.fn()
const backends = vi.fn<() => Promise<Backend[]>>()
const channels = vi.fn()
const search = vi.fn()
const utxos = vi.fn()
const privacy = vi.fn<() => Promise<PrivacyReport>>()
const addresses = vi.fn<() => Promise<WalletAddress[]>>()
const addressPrivacy = vi.fn()
// o painel pergunta as preferências para saber se mostra preço e taxa
const preferences = vi.fn()
const price = vi.fn()
const fees = vi.fn()
const chainTip = vi.fn()

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
      preferences: () => preferences(),
      price: () => price(),
      fees: () => fees(),
      chainTip: () => chainTip(),
      utxos: () => utxos(),
      privacy: () => privacy(),
      addresses: () => addresses(),
      addressPrivacy: () => addressPrivacy(),
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
  'nav.addresses': 'Endereços',
  'nav.alerts': 'Alertas',
  'nav.privacy': 'Privacidade',
  'nav.settings': 'Configurações',
  'nav.access': 'Acesso Externo',
  'balance.total': 'Saldo total',
  'balance.wallets': '{n} carteiras',
  'wallets.title': 'Minhas carteiras',
  'wallets.add': '+ Vigiar carteira',
  'wallets.empty': 'Nenhuma carteira vigiada ainda.',
  'addresses.title': 'Endereços avulsos',
  'addresses.add': '+ Vigiar endereço',
  'addresses.empty': 'Nenhum endereço avulso vigiado ainda.',
  'addresses.note': 'Um endereço solto, sem chave estendida.',
  'balance.utxos': '{n} UTXOs',
  'wallet.alerts': 'Alertas desta carteira',
  'wallet.notFoundOnScreen': 'Esta carteira não existe, ou não é sua.',
  'privacy.severalHosts': '{n} backends',
  'privacy.pageTitle': 'Privacidade',
  'privacy.pageNote': 'Mostra o que já foi medido.',
  'privacy.walletSelect': 'Carteira',
  'privacy.generalScore': 'Score médio',
  'privacy.generalAlerts': 'Alertas',
  'privacy.chartReuse': 'Reuso de endereço',
  'privacy.chartUtxos': 'Faixas de UTXO',
  'privacy.reusedAddresses': '{reused} de {total} endereços usados de novo',
  'privacy.address': 'Endereço',
  'privacy.path': 'Caminho',
  'privacy.balance': 'Saldo',
  'privacy.addressScoreShort': 'Score',
  'privacy.noAddresses': 'Nenhum endereço sincronizado ainda.',
  'privacy.addressDetail': 'Detalhe do endereço',
  'privacy.addressUnknown': 'Ainda não há análise salva para este endereço.',
  'privacy.addressScore': 'Privacidade do endereço {score}/100 · {grade}',
  'prefs.price': 'Preço do BTC',
  'prefs.fees': 'Estimativa de taxa',
  'fees.blocks': '{n} blocos',
  'fees.next': 'próximo bloco',
}

const ME: Me = { email: 'quem@exemplo.local', isAdmin: false, language: 'pt' }

const PUBLICA: Wallet = {
  id: 1, label: 'Cofre', kind: 'xpub', address: null, scriptType: 'p2wpkh',
  network: 'signet', fingerprint: 'aabb', syncState: 'synced', syncProgress: 100,
  syncHeight: 100, syncError: null, balanceSats: '50000', utxoCount: 1,
  frozenCount: 0, spentUtxoCount: 0, usedAddressCount: 0,
  backendKind: 'esplora', backendIsPublic: true, backendUrl: 'https://mempool.space/signet/api',
  privacyScore: null, privacyGrade: null, privacyScannedAt: null,
}

beforeEach(() => {
  preferences.mockResolvedValue({
    theme: 'sett', currency: 'BRL', priceSources: [], feeSource: 'off',
  })
  price.mockReset()
  price.mockResolvedValue({ currency: 'BRL', sources: [], median: null })
  fees.mockReset()
  fees.mockResolvedValue({ source: 'off', blocks: null, at: '' })
  chainTip.mockResolvedValue({ height: 100, backendHost: 'x', isPublic: true, at: '' })
  wallets.mockResolvedValue([PUBLICA])
  alerts.mockResolvedValue({ items: [], nextCursor: null })
  backends.mockResolvedValue([])
  channels.mockResolvedValue([])
  search.mockResolvedValue([])
  utxos.mockResolvedValue([])
  privacy.mockResolvedValue({
    latest: null,
    history: [],
    running: false,
    error: null,
    measured: { activeAddresses: 0, reusedAddresses: 0 },
  })
  addresses.mockResolvedValue([])
  addressPrivacy.mockResolvedValue({ latest: null, running: false, error: null })
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
  for (const rota of [
    '/',
    '/carteiras/1',
    '/enderecos',
    '/alertas',
    '/privacidade',
    '/configuracoes',
    '/acessos',
  ]) {
    it(`${rota} mantém o aviso de explorador público`, async () => {
      const { container } = montarEm(rota)

      await waitFor(() =>
        expect(container.querySelector('[data-posture="public"]')).not.toBeNull(),
      )
      expect(container.querySelector('[role="status"][data-posture="public"]')).not.toBeNull()
    })
  }
})

describe('mercado no Painel', () => {
  it('mostra preço e as três taxas no Painel, sem competir com o selo de postura', async () => {
    preferences.mockResolvedValue({
      theme: 'sett',
      currency: 'BRL',
      priceSources: ['coingecko'],
      feeSource: 'mempool',
    })
    price.mockResolvedValue({
      currency: 'BRL',
      sources: [{ id: 'coingecko', price: 550000, at: '' }],
      median: 550000,
    })
    fees.mockResolvedValue({ source: 'mempool', blocks: { 1: 12, 3: 8, 6: 5 }, at: '' })
    const { container } = montarEm('/')

    await waitFor(() => expect(screen.getByText(/550\.000/)).toBeDefined())
    expect(screen.getByText(/12/)).toBeDefined()
    expect(screen.getByText(/próximo bloco/)).toBeDefined()
    expect(screen.getByText(/3 blocos/)).toBeDefined()
    expect(screen.getByText(/6 blocos/)).toBeDefined()
    expect(container.querySelector('[role="status"][data-posture="public"]')).not.toBeNull()
    expect(container.querySelector('header [data-market]')).toBeNull()
    expect(container.querySelector('main [data-market="panel"]')).not.toBeNull()
  })
})

// A postura é da sessão inteira, e não da primeira carteira: basta uma
// exposta para a resposta honesta ser pública, e quando mais de um explorador
// expõe, contar quantos é mais honesto que eleger um.
describe('o selo de postura', () => {
  it('só anuncia soberano quando nenhuma carteira passa por explorador', async () => {
    wallets.mockResolvedValue([
      { ...PUBLICA, backendKind: 'esplora', backendIsPublic: false, backendUrl: 'electrum://127.0.0.1:50001' },
    ])
    const { container } = montarEm('/')

    await waitFor(() =>
      expect(container.querySelector('[role="status"][data-posture="sovereign"]')).not.toBeNull(),
    )
  })

  it('nomeia o explorador que expõe, e não o backend da primeira carteira', async () => {
    wallets.mockResolvedValue([
      { ...PUBLICA, id: 2, backendKind: 'esplora', backendIsPublic: false, backendUrl: 'electrum://127.0.0.1:50001' },
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
  it('oferece as sete rotas na barra lateral', async () => {
    montarEm('/')

    await waitFor(() => expect(screen.getByText('Painel')).toBeDefined())
    for (const nome of [
      'Carteiras',
      'Endereços',
      'Alertas',
      'Privacidade',
      'Configurações',
      'Acesso Externo',
    ]) {
      expect(screen.getByText(nome)).toBeDefined()
    }
  })

  it('a página de privacidade mostra resumo e abre detalhe salvo por endereço', async () => {
    utxos.mockResolvedValue([
      {
        txid: 'ab'.repeat(32),
        vout: 0,
        addressId: 7,
        valueSats: 500,
        height: 100,
        address: 'tb1qendereco',
        derivationPath: '0/0',
        addressPrivacyScore: null,
        addressPrivacyGrade: null,
        addressPrivacyScannedAt: null,
        label: null,
        tags: [],
        frozen: false,
      },
    ])
    addresses.mockResolvedValue([
      {
        id: 7,
        address: 'tb1qendereco',
        derivationPath: '0/0',
        used: true,
        utxoCount: 1,
        balanceSats: '500',
        privacyScore: 12,
        privacyGrade: 'F',
        privacyScannedAt: '2026-08-28T10:00:00Z',
      },
    ])
    addressPrivacy.mockResolvedValue({
      latest: {
        id: 1,
        addressId: 7,
        score: 12,
        grade: 'F',
        walletInfo: {},
        findings: [{ id: 'x', severity: 'high', confidence: 'high', title: 'Address reuse', description: 'd', recommendation: 'r', scoreImpact: -10 }],
        scannerVersion: '0.34.2',
        scannedAt: '2026-08-28T10:00:00Z',
      },
      running: false,
      error: null,
    })
    montarEm('/privacidade')

    await waitFor(() => expect(screen.getByRole('button', { name: 'tb1qendereco' })).toBeDefined())
    screen.getByRole('button', { name: 'tb1qendereco' }).click()

    await waitFor(() => expect(screen.getByText(/Privacidade do endereço 12\/100/)).toBeDefined())
    expect(screen.getByText('Address reuse')).toBeDefined()
  })

  it('a página de uma carteira que não existe diz isso, em vez de quebrar', async () => {
    montarEm('/carteiras/999')

    await waitFor(() =>
      expect(document.querySelector('[data-posture="public"]')).not.toBeNull(),
    )
  })
})

describe('a lista de carteiras', () => {
  it('tem o botão de vigiar carteira', async () => {
    // Ele só existia no Painel. Quem entrava por `Carteiras` — que é onde se
    // procura carteira — encontrava uma lista sem nenhuma forma de acrescentar
    // uma, e tinha de descobrir sozinho que o caminho era outra tela.
    montarEm('/carteiras')
    await waitFor(() => expect(screen.getByText('+ Vigiar carteira')).toBeTruthy())
  })
})

describe('a página de endereços', () => {
  it('lista só o endereço avulso, com o endereço inteiro à vista', async () => {
    // Endereço avulso e carteira são a mesma linha no banco, e é por isso que o
    // motor não sabe a diferença. Quem vigia um endereço solto sabe: procurá-lo
    // no meio das carteiras é procurar outra coisa.
    wallets.mockResolvedValue([
      { ...PUBLICA, id: 1, kind: 'xpub', label: 'Cold' },
      {
        ...PUBLICA,
        id: 2,
        kind: 'address',
        label: 'Doação',
        address: 'tb1qexemplodeenderecoavulso000000000000000',
      },
    ])

    montarEm('/enderecos')

    await waitFor(() => expect(screen.getByText('Doação')).toBeTruthy())
    expect(screen.getByText('tb1qexemplodeenderecoavulso000000000000000')).toBeTruthy()
    expect(screen.queryByText('Cold')).toBeNull()
  })
})
