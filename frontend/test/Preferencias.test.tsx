import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const preferences = vi.fn()
const savePreferences = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      preferences: () => preferences(),
      savePreferences: (...a: unknown[]) => savePreferences(...a),
    },
  }
})

const { Preferencias } = await import('../src/components/Preferencias')

const CATALOGO: Catalog = {
  'prefs.price': 'Preço do BTC',
  'prefs.priceNote':
    'Nenhuma fonte ligada. Ligar uma faz este servidor perguntar o preço a ela; a consulta leva só o par de moedas, e o IP que aparece é o do servidor, não o seu.',
  'prefs.currency': 'Moeda',
  'prefs.fees': 'Estimativa de taxa',
  'prefs.feeOff': 'desligada',
  'prefs.feeNode': 'pelo seu nó',
  'prefs.feeMempool': 'pelo mempool.space',
}

const PADRAO = { theme: 'sett', currency: 'BRL', priceSources: [], feeSource: 'off' }

beforeEach(() => {
  preferences.mockReset()
  savePreferences.mockReset()
  preferences.mockResolvedValue(PADRAO)
  savePreferences.mockImplementation(async (mudanca: Record<string, unknown>) => ({
    ...PADRAO,
    ...mudanca,
  }))
})

function montar() {
  render(<Preferencias catalog={CATALOGO} lang="pt" />)
}

describe('Preferencias', () => {
  // Nada ligado de fábrica, e a prosa explica o que cada fonte enxerga: um
  // servidor perguntando o preço, e o IP dele.
  it('começa com todas as fontes de preço desligadas, e explica o que elas veem', async () => {
    montar()

    await waitFor(() => expect(screen.getByLabelText(/coingecko/i)).toBeDefined())
    expect((screen.getByLabelText(/coingecko/i) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/o IP que aparece é o do servidor/i)).toBeDefined()
  })

  it('ligar uma fonte salva a escolha', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/kraken/i)).toBeDefined())

    fireEvent.click(screen.getByLabelText(/kraken/i))

    await waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith({ priceSources: ['kraken'] }),
    )
  })

  it('a estimativa de taxa oferece as três opções, e começa desligada', async () => {
    montar()

    await waitFor(() => expect(screen.getByLabelText(/estimativa de taxa/i)).toBeDefined())
    const seletor = screen.getByLabelText(/estimativa de taxa/i) as HTMLSelectElement
    expect(seletor.value).toBe('off')
    expect(Array.from(seletor.options).map(o => o.value)).toEqual(['off', 'node', 'mempool'])
  })

  it('trocar a fonte de taxa salva a escolha', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/estimativa de taxa/i)).toBeDefined())

    fireEvent.change(screen.getByLabelText(/estimativa de taxa/i), {
      target: { value: 'mempool' },
    })

    await waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith({ feeSource: 'mempool' }),
    )
  })
})
