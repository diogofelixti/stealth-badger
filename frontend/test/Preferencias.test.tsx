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
  'prefs.save': 'Salvar preferências',
  'prefs.saving': 'salvando…',
  'prefs.saved': 'salvo, e o topo já está mostrando',
  'prefs.unsaved': 'há mudanças não salvas',
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

const avisouOTopo = vi.fn()

function montar() {
  render(<Preferencias catalog={CATALOGO} lang="pt" onSalvou={avisouOTopo} />)
}

/** Mexe num campo e clica em salvar, que é o caminho que a tela passou a ter. */
async function salvar() {
  fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
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

  /*
   * O que a queixa de 28/08 encontrou: cada campo salvava sozinho no
   * `onChange`, e o `Mercado` do cabeçalho pergunta as preferências uma vez, ao
   * montar. Ligar uma fonte de preço não mudava nada no topo até recarregar a
   * página inteira, e sem botão não dava nem para distinguir "não salvou" de
   * "salvou e não apareceu".
   */
  it('mexer num campo não salva sozinho: quem salva é o botão', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/kraken/i)).toBeDefined())

    fireEvent.click(screen.getByLabelText(/kraken/i))

    expect(savePreferences).not.toHaveBeenCalled()
    expect(screen.getByText('há mudanças não salvas')).toBeDefined()
  })

  it('ligar uma fonte e salvar manda a escolha inteira', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/kraken/i)).toBeDefined())

    fireEvent.click(screen.getByLabelText(/kraken/i))
    await salvar()

    await waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ priceSources: ['kraken'] }),
      ),
    )
  })

  // O topo precisa reler: é isso que faz o preço aparecer no clique, e não no
  // recarregamento da página.
  it('salvar avisa quem desenha preço e taxa no cabeçalho', async () => {
    avisouOTopo.mockClear()
    montar()
    await waitFor(() => expect(screen.getByLabelText(/kraken/i)).toBeDefined())

    fireEvent.click(screen.getByLabelText(/kraken/i))
    await salvar()

    await waitFor(() => expect(avisouOTopo).toHaveBeenCalled())
  })

  it('sem mudança nenhuma, o botão de salvar não está clicável', async () => {
    montar()

    await waitFor(() => expect(screen.getByRole('button', { name: /Salvar/ })).toBeDefined())
    expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('depois de salvar, a tela confirma e o botão volta a ficar parado', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/kraken/i)).toBeDefined())

    fireEvent.click(screen.getByLabelText(/kraken/i))
    await salvar()

    await waitFor(() =>
      expect(screen.getByText('salvo, e o topo já está mostrando')).toBeDefined(),
    )
    expect(screen.queryByText('há mudanças não salvas')).toBeNull()
  })

  it('a estimativa de taxa oferece as três opções, e começa desligada', async () => {
    montar()

    await waitFor(() => expect(screen.getByLabelText(/estimativa de taxa/i)).toBeDefined())
    const seletor = screen.getByLabelText(/estimativa de taxa/i) as HTMLSelectElement
    expect(seletor.value).toBe('off')
    expect(Array.from(seletor.options).map(o => o.value)).toEqual(['off', 'node', 'mempool'])
  })

  it('trocar a fonte de taxa e salvar manda a escolha', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/estimativa de taxa/i)).toBeDefined())

    fireEvent.change(screen.getByLabelText(/estimativa de taxa/i), {
      target: { value: 'mempool' },
    })
    await salvar()

    await waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ feeSource: 'mempool' }),
      ),
    )
  })
})
