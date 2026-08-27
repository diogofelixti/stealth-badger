import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const alertDetail = vi.fn()
const transaction = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      alertDetail: (...a: unknown[]) => alertDetail(...a),
      transaction: (...a: unknown[]) => transaction(...a),
    },
  }
})

const { AlertDetail } = await import('../src/components/AlertDetail')

const TXID = 'ab'.repeat(32)

const CATALOGO: Catalog = {
  'alert.txid': 'Transação',
  'alert.confirmations': '{n} confirmações',
  'alert.inMempool': 'na mempool, ainda sem confirmação',
  'alert.height': 'Altura',
  'alert.blockHash': 'Hash do bloco',
  'alert.wallet': 'Carteira',
  'alert.siblings': 'Outros alertas desta transação',
  'alert.noEvent': 'Este alerta não veio de uma transação.',
  'alert.fetchOnChain': 'Buscar na cadeia',
  'alert.fetchNote': 'A consulta vai para {fonte}, que passa a saber que você procurou esta transação.',
  'alert.close': 'Fechar',
  'alert.copy': 'Copiar',
  'feed.funds_received.title': 'Fundos recebidos',
  'feed.funds_received.body': '{value} sats',
}

const DETALHE = {
  alert: {
    id: 7, walletId: 1, type: 'funds_received', severity: 'info' as const,
    params: { value: 51000 }, createdAt: '2026-08-27T10:00:00Z', readAt: null,
  },
  event: {
    id: 3, type: 'utxo_created', height: 195, blockHash: '000000abc',
    txid: TXID, vout: 3, payload: { value: 51000 },
  },
  wallet: { id: 1, label: 'Cofre', network: 'signet' },
  confirmations: 6,
  siblings: [],
}

beforeEach(() => {
  alertDetail.mockReset()
  transaction.mockReset()
  alertDetail.mockResolvedValue(DETALHE)
  transaction.mockResolvedValue({ txid: TXID, height: 195, blockHash: '000000abc', vin: [], vout: [] })
})

function montar() {
  render(
    <AlertDetail
      alertId={7}
      fonte="mempool.space"
      catalog={CATALOGO}
      lang="pt"
      onClose={() => {}}
    />,
  )
}

describe('AlertDetail', () => {
  it('mostra o txid inteiro, sem truncar', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())
  })

  it('conta as confirmações', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(/6 confirmações/)).toBeDefined())
  })

  // A regressão que ninguém veria: abrir o detalhe passando a consultar a
  // cadeia sozinho multiplica a exposição que o produto existe para denunciar.
  it('não consulta a cadeia enquanto ninguém pedir', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    expect(transaction).not.toHaveBeenCalled()
  })

  it('diz para onde a consulta vai, antes de ir', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    expect(screen.getByText(/mempool\.space, que passa a saber/)).toBeDefined()
  })

  it('busca na cadeia só quando o usuário clica', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    fireEvent.click(screen.getByText('Buscar na cadeia'))

    await waitFor(() => expect(transaction).toHaveBeenCalledWith(TXID, 1))
  })

  it('alerta sem transação diz isso, em vez de mostrar campo vazio', async () => {
    alertDetail.mockResolvedValue({
      ...DETALHE,
      event: null,
      confirmations: null,
    })
    montar()

    await waitFor(() =>
      expect(screen.getByText(/não veio de uma transação/)).toBeDefined(),
    )
    expect(screen.queryByText('Buscar na cadeia')).toBeNull()
  })
})
