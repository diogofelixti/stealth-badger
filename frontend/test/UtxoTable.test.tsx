import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog, Utxo } from '../src/lib/api'

const utxos = vi.fn<() => Promise<Utxo[]>>()
const markUtxo = vi.fn()
const importLabels = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      utxos: () => utxos(),
      markUtxo: (...a: unknown[]) => markUtxo(...a),
      importLabels: (...a: unknown[]) => importLabels(...a),
    },
  }
})

const { UtxoTable } = await import('../src/components/UtxoTable')

const CATALOGO: Catalog = {
  'utxos.title': 'UTXOs',
  'utxos.freeze': 'congelar',
  'utxos.unfreeze': 'descongelar',
  'utxos.frozen': 'congelado',
  'utxos.labelPlaceholder': 'rótulo',
  'utxos.export': 'Exportar rótulos',
  'utxos.import': 'Importar rótulos',
  'utxos.dust': 'poeira',
  'utxos.empty': 'Nenhum UTXO.',
}

const TXID = 'aa'.repeat(32)

const utxo = (over: Partial<Utxo> = {}): Utxo => ({
  txid: TXID,
  vout: 0,
  valueSats: 412850,
  height: 319233,
  address: 'tb1qexemplo000000000000000000000000000',
  derivationPath: '0/0',
  label: null,
  tags: [],
  frozen: false,
  ...over,
})

function montar() {
  return render(<UtxoTable walletId={1} catalog={CATALOGO} lang="pt" />)
}

beforeEach(() => {
  utxos.mockResolvedValue([utxo()])
  markUtxo.mockResolvedValue({ ok: true })
})

describe('UtxoTable', () => {
  it('mostra valor, altura e caminho de derivação de cada UTXO', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/412\.850/)).toBeDefined())
    expect(screen.getByText(/0\/0/)).toBeDefined()
  })

  it('diz que não há UTXO em vez de mostrar tabela vazia', async () => {
    utxos.mockResolvedValue([])
    montar()
    await waitFor(() => expect(screen.getByText(/nenhum utxo/i)).toBeDefined())
  })

  // Congelar é a decisão de coin control mais direta que existe: "não gaste
  // este". Sem ela a tabela é só uma lista.
  it('congela o UTXO e avisa o servidor', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/412\.850/)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /congelar/i }))

    await waitFor(() =>
      expect(markUtxo).toHaveBeenCalledWith(1, TXID, 0, { frozen: true }),
    )
  })

  it('oferece descongelar o que já está congelado', async () => {
    utxos.mockResolvedValue([utxo({ frozen: true })])
    montar()
    await waitFor(() => expect(screen.getByRole('button', { name: /descongelar/i })).toBeDefined())
  })

  it('grava o rótulo escrito ao sair do campo', async () => {
    montar()
    await waitFor(() => expect(screen.getByPlaceholderText(/rótulo/i)).toBeDefined())
    const campo = screen.getByPlaceholderText(/rótulo/i)
    fireEvent.change(campo, { target: { value: 'do faucet' } })
    fireEvent.blur(campo)

    await waitFor(() =>
      expect(markUtxo).toHaveBeenCalledWith(1, TXID, 0, { label: 'do faucet' }),
    )
  })

  // Poeira é o UTXO que a carteira não consegue gastar por valor, e é vetor de
  // rastreamento. Ele precisa saltar aos olhos na tabela.
  it('destaca o UTXO de poeira', async () => {
    utxos.mockResolvedValue([utxo({ valueSats: 500 })])
    const { container } = montar()
    await waitFor(() => expect(screen.getByText(/poeira/i)).toBeDefined())
    expect(container.querySelector('[data-dust="true"]')).not.toBeNull()
  })

  it('oferece baixar o arquivo de rótulos', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/412\.850/)).toBeDefined())
    const link = screen.getByRole('link', { name: /exportar rótulos/i })
    expect(link.getAttribute('href')).toBe('/api/wallets/1/labels')
  })
})
