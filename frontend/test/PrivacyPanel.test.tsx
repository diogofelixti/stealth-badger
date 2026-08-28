import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog, PrivacyReport, Utxo } from '../src/lib/api'

const privacy = vi.fn<() => Promise<PrivacyReport>>()
const scanUsedAddressPrivacy = vi.fn()
const utxos = vi.fn<() => Promise<Utxo[]>>()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      privacy: () => privacy(),
      scanUsedAddressPrivacy: (...a: unknown[]) => scanUsedAddressPrivacy(...a),
      utxos: () => utxos(),
    },
  }
})

const { PrivacyPanel } = await import('../src/components/PrivacyPanel')

const CATALOGO: Catalog = {
  'privacy.findings': 'O que o scanner viu',
  'privacy.scanUsedAddresses': 'Analisar endereços usados',
  'privacy.addressScanQueued': '{n} endereços na fila',
  'privacy.chartScore': 'Score',
  'privacy.chartHistory': 'Histórico',
  'privacy.chartSeverity': 'Severidade',
  'privacy.chartUtxos': 'Faixas de UTXO',
  'privacy.chartReuse': 'Reuso de endereço',
  'privacy.chartCounterparties': 'Contrapartes recorrentes',
  'privacy.reusedAddresses': '{reused} de {total} endereços usados de novo',
  'privacy.utxoTotal': 'total no histograma: {value}',
}

const RELATORIO: PrivacyReport = {
  latest: {
    score: 66,
    grade: 'C',
    walletInfo: {
      activeAddresses: 31,
      reusedAddresses: 2,
    },
    scannerVersion: '0.34.2',
    scannedAt: '2026-08-26T12:00:00Z',
    findings: [
      {
        id: 'wallet-address-reuse',
        severity: 'medium',
        confidence: 'deterministic',
        title: '2 of 31 addresses reused',
        description: 'Address reuse directly links transactions together.',
        recommendation: 'Never reuse Bitcoin addresses.',
        scoreImpact: -5,
      },
      {
        id: 'wallet-uniform-script',
        severity: 'good',
        confidence: 'deterministic',
        title: 'Uniform script type: p2wpkh',
        description: 'All UTXOs use the same script type.',
        recommendation: 'Continue.',
        scoreImpact: 3,
      },
      {
        id: 'address-reuse-critical',
        severity: 'critical',
        confidence: 'deterministic',
        title: 'Address reused in 97 transactions',
        description: 'Address reuse links every payment.',
        recommendation: {
          urgency: 'immediate',
          headline: 'Stop receiving on this address',
          text: 'Move future receipts to fresh addresses.',
          tools: [{ name: 'Address reuse guide', url: 'https://am-i.exposed/docs/address-reuse' }],
        },
        scoreImpact: -90,
        params: { recurringCount: 19 },
      },
    ],
  },
  history: [
    { score: 74, grade: 'B', scannedAt: '2026-08-25T12:00:00Z' },
    { score: 66, grade: 'C', scannedAt: '2026-08-26T12:00:00Z' },
  ],
  running: false,
  error: null,
}

function utxo(overrides: Partial<Utxo> = {}): Utxo {
  return {
    txid: 'ab'.repeat(32),
    vout: 0,
    addressId: 1,
    valueSats: 50_000,
    height: 100,
    address: 'tb1qteste',
    derivationPath: 'm/0/0',
    addressPrivacyScore: null,
    addressPrivacyGrade: null,
    addressPrivacyScannedAt: null,
    label: null,
    tags: [],
    frozen: false,
    ...overrides,
  }
}

describe('PrivacyPanel', () => {
  beforeEach(() => {
    scanUsedAddressPrivacy.mockReset()
    utxos.mockReset()
    scanUsedAddressPrivacy.mockResolvedValue({ status: 'running', addresses: 2 })
    utxos.mockResolvedValue([
      utxo({ valueSats: 500 }),
      utxo({ valueSats: 5_000 }),
      utxo({ valueSats: 50_000 }),
      utxo({ valueSats: 2_000_000 }),
    ])
  })

  it('só busca o relatório quando é aberto, para não consultar o que ninguém pediu', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    expect(privacy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))
    await waitFor(() => expect(privacy).toHaveBeenCalledTimes(1))
    expect(utxos).toHaveBeenCalledTimes(1)
  })

  it('lista os achados com o que fazer a respeito', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByText(/2 of 31 addresses reused/)).toBeDefined())
    expect(screen.getByText(/Never reuse Bitcoin addresses/)).toBeDefined()
  })

  it('mostra recomendação estruturada com urgência e ferramentas externas', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByText(/Stop receiving on this address/)).toBeDefined())
    expect(screen.getByText(/immediate/i)).toBeDefined()
    const link = screen.getByRole('link', { name: /Address reuse guide/i })
    expect(link.getAttribute('href')).toBe('https://am-i.exposed/docs/address-reuse')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('mostra gráficos de score, severidade, histórico, UTXOs, reuso e contrapartes', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    expect(await screen.findByText('Score')).toBeDefined()
    expect(screen.getByText('Histórico')).toBeDefined()
    expect(screen.getByText('Severidade')).toBeDefined()
    expect(screen.getByText('Faixas de UTXO')).toBeDefined()
    expect(screen.getByText('Reuso de endereço')).toBeDefined()
    expect(screen.getByText('Contrapartes recorrentes')).toBeDefined()
    expect(screen.getByText(/2 de 31 endereços/)).toBeDefined()
    expect(screen.getByText(/total no histograma/)).toBeDefined()
  })

  it('dispara análise profunda dos endereços usados por clique explícito', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /endereços usados/i })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /endereços usados/i }))

    await waitFor(() => expect(scanUsedAddressPrivacy).toHaveBeenCalledWith(1))
    expect(screen.getByText(/2 endereços na fila/)).toBeDefined()
  })


  // Um achado positivo não pode ser pintado como problema: o scanner distingue
  // "isto está bom" de "isto te expõe", e apagar a diferença faria a tela
  // parecer um alarme constante.
  it('distingue o achado que elogia do que acusa', async () => {
    privacy.mockResolvedValue(RELATORIO)
    const { container } = render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByText(/Uniform script type/)).toBeDefined())
    expect(container.querySelector('[data-severity="good"]')).not.toBeNull()
    expect(container.querySelector('[data-severity="medium"]')).not.toBeNull()
  })

  it('mostra a falha em vez de um painel vazio quando o scanner quebrou', async () => {
    privacy.mockResolvedValue({
      latest: null,
      history: [],
      running: false,
      error: 'am-i-exposed não instalado',
    })
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByText(/não instalado/)).toBeDefined())
  })
})
