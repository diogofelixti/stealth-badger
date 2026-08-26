import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Achado, Catalog } from '../src/lib/api'

const search = vi.fn<() => Promise<Achado[]>>()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return { ...real, api: { ...real.api, search: () => search() } }
})

const { Search } = await import('../src/components/Search')

const CATALOGO: Catalog = {
  'search.placeholder': 'buscar endereço',
  'search.empty': 'Nada encontrado.',
  'search.used': 'usado',
  'search.unused': 'nunca usado',
}

const ACHADO: Achado = {
  walletId: 1,
  walletLabel: 'Cofre',
  address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  derivationPath: '0/7',
  used: true,
  balanceSats: 3300,
}

beforeEach(() => {
  search.mockResolvedValue([])
})

describe('Search', () => {
  // Buscar a cada tecla dispararia uma consulta por caractere digitado. Num
  // endereço de 42 caracteres colado, seriam 42 consultas ao banco para
  // responder uma pergunta.
  it('não consulta a cada tecla digitada', async () => {
    render(<Search catalog={CATALOGO} lang="pt" />)
    const campo = screen.getByPlaceholderText(/buscar endereço/i)
    fireEvent.change(campo, { target: { value: 'b' } })
    fireEvent.change(campo, { target: { value: 'bc' } })
    fireEvent.change(campo, { target: { value: 'bc1' } })
    expect(search).not.toHaveBeenCalled()
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 1500 })
  })

  it('mostra a carteira, o caminho de derivação e o saldo do que achou', async () => {
    search.mockResolvedValue([ACHADO])
    render(<Search catalog={CATALOGO} lang="pt" />)
    fireEvent.change(screen.getByPlaceholderText(/buscar endereço/i), {
      target: { value: 'bc1qw508' },
    })
    await waitFor(() => expect(screen.getByText(/Cofre/)).toBeDefined(), { timeout: 1500 })
    expect(screen.getByText(/0\/7/)).toBeDefined()
    expect(screen.getByText(/3\.300/)).toBeDefined()
  })

  it('diz que não achou, em vez de ficar em branco', async () => {
    render(<Search catalog={CATALOGO} lang="pt" />)
    fireEvent.change(screen.getByPlaceholderText(/buscar endereço/i), {
      target: { value: 'zzzz' },
    })
    await waitFor(() => expect(screen.getByText(/nada encontrado/i)).toBeDefined(), {
      timeout: 1500,
    })
  })

  it('não mostra "nada encontrado" antes de alguém buscar', () => {
    render(<Search catalog={CATALOGO} lang="pt" />)
    expect(screen.queryByText(/nada encontrado/i)).toBeNull()
  })

  it('distingue endereço usado de nunca usado', async () => {
    search.mockResolvedValue([ACHADO, { ...ACHADO, address: 'bc1qoutro', used: false }])
    render(<Search catalog={CATALOGO} lang="pt" />)
    fireEvent.change(screen.getByPlaceholderText(/buscar endereço/i), {
      target: { value: 'bc1q' },
    })
    await waitFor(() => expect(screen.getByText(/nunca usado/i)).toBeDefined(), {
      timeout: 1500,
    })
    expect(screen.getByText(/^usado$/i)).toBeDefined()
  })
})
