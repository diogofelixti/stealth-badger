import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog, PrivacyReport } from '../src/lib/api'

const privacy = vi.fn<() => Promise<PrivacyReport>>()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return { ...real, api: { ...real.api, privacy: () => privacy() } }
})

const { PrivacyPanel } = await import('../src/components/PrivacyPanel')

const CATALOGO: Catalog = {
  'privacy.findings': 'O que o scanner viu',
}

const RELATORIO: PrivacyReport = {
  latest: {
    score: 66,
    grade: 'C',
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
    ],
  },
  history: [],
  running: false,
  error: null,
}

describe('PrivacyPanel', () => {
  it('só busca o relatório quando é aberto, para não consultar o que ninguém pediu', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    expect(privacy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))
    await waitFor(() => expect(privacy).toHaveBeenCalledTimes(1))
  })

  it('lista os achados com o que fazer a respeito', async () => {
    privacy.mockResolvedValue(RELATORIO)
    render(<PrivacyPanel walletId={1} catalog={CATALOGO} lang="pt" />)
    fireEvent.click(screen.getByRole('button', { name: /o que o scanner viu/i }))

    await waitFor(() => expect(screen.getByText(/2 of 31 addresses reused/)).toBeDefined())
    expect(screen.getByText(/Never reuse Bitcoin addresses/)).toBeDefined()
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
