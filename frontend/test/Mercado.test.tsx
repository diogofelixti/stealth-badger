import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const preferences = vi.fn()
const price = vi.fn()
const fees = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      preferences: () => preferences(),
      price: () => price(),
      fees: () => fees(),
    },
  }
})

const { Mercado } = await import('../src/components/Mercado')

const CATALOGO: Catalog = {
  'prefs.price': 'Preço do BTC',
  'prefs.fees': 'Estimativa de taxa',
  'fees.blocks': '{n} blocos',
  'fees.next': 'próximo bloco',
}

beforeEach(() => {
  preferences.mockReset()
  price.mockReset()
  fees.mockReset()
  price.mockResolvedValue({ currency: 'BRL', sources: [], median: null })
  fees.mockResolvedValue({ source: 'off', blocks: null, at: '' })
})

describe('Mercado', () => {
  // Desligado é desligado: nem painel, nem consulta.
  it('não consulta nada quando tudo está desligado', async () => {
    preferences.mockResolvedValue({
      theme: 'sett', currency: 'BRL', priceSources: [], feeSource: 'off',
    })

    const { container } = render(<Mercado catalog={CATALOGO} lang="pt" />)

    await waitFor(() => expect(preferences).toHaveBeenCalled())
    expect(price).not.toHaveBeenCalled()
    expect(fees).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })

  it('mostra a mediana quando há fonte de preço ligada', async () => {
    preferences.mockResolvedValue({
      theme: 'sett', currency: 'BRL', priceSources: ['coingecko'], feeSource: 'off',
    })
    price.mockResolvedValue({
      currency: 'BRL',
      sources: [{ id: 'coingecko', price: 550000, at: '' }],
      median: 550000,
    })

    render(<Mercado catalog={CATALOGO} lang="pt" />)

    await waitFor(() => expect(screen.getByText(/550\.000/)).toBeDefined())
  })

  it('mostra as três estimativas quando a taxa está ligada', async () => {
    preferences.mockResolvedValue({
      theme: 'sett', currency: 'BRL', priceSources: [], feeSource: 'mempool',
    })
    fees.mockResolvedValue({ source: 'mempool', blocks: { 1: 12, 3: 8, 6: 5 }, at: '' })

    render(<Mercado catalog={CATALOGO} lang="pt" />)

    await waitFor(() => expect(screen.getByText(/12/)).toBeDefined())
    expect(screen.getByText(/8/)).toBeDefined()
    expect(screen.getByText(/5/)).toBeDefined()
  })
})
